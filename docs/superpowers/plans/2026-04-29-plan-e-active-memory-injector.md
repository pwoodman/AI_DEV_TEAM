# Plan E: Active Memory Injector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `MemoryInjector` that queries LanceDB for ≤3 prior task patterns before every LLM call and indexes outcomes after each node completes; add `adapter: LangAdapter | null` to `RouteResult` so downstream consumers can access the registered adapter without a second registry lookup.

**Architecture:** `MemoryInjector` lives in `packages/memory/` and owns a `task_outcomes` LanceDB table separate from the existing `code_symbols` table. It wraps all Voyage API calls in a 200ms timeout race and swallows all errors — the orchestrator continues normally if memory is unavailable. `routeNode()` gains an `adapter` field by looking up `adapterRegistry` by `node.language`. The orchestrator injects memory as an optional `MemoryInjector` dep and appends prior patterns to the context envelope as plain text.

**Tech Stack:** TypeScript, `@lancedb/lancedb`, Vitest, `@amase/contracts`, `@amase/validators` (adapterRegistry)

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `packages/memory/src/memory-injector.ts` | `MemoryInjector` class + `PatternHint` type |
| Modify | `packages/memory/src/index.ts` | Export `MemoryInjector`, `PatternHint` |
| Create | `packages/memory/tests/memory-injector.test.ts` | Unit tests with stub LanceDB |
| Modify | `packages/core/src/router.ts` | Add `adapter: LangAdapter \| null` to `RouteResult` |
| Create | `packages/core/tests/router-adapter.test.ts` | Tests for adapter field |
| Modify | `packages/core/src/orchestrator.ts` | Add `memoryInjector?` dep; wire query + memory block + index |

---

## Task 1: Create `MemoryInjector` with tests

**Files:**
- Create: `packages/memory/src/memory-injector.ts`
- Create: `packages/memory/tests/memory-injector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/memory/tests/memory-injector.test.ts`:

```typescript
import { expect, test, vi } from "vitest";
import { MemoryInjector } from "../src/memory-injector.js";
import type { EmbeddingProvider } from "../src/embeddings.js";

function makeStubProvider(vectors: number[][] = [[0.1, 0.2]]): EmbeddingProvider {
  return { embed: vi.fn().mockResolvedValue(vectors) };
}

function makeStubTable(rows: Record<string, unknown>[] = []) {
  return {
    search: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(rows),
      }),
    }),
    add: vi.fn().mockResolvedValue(undefined),
    createTable: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStubDb(table: ReturnType<typeof makeStubTable>) {
  return {
    tableNames: vi.fn().mockResolvedValue(["task_outcomes"]),
    openTable: vi.fn().mockResolvedValue(table),
    createTable: vi.fn().mockResolvedValue(table),
    connect: vi.fn(),
  };
}

test("query returns empty array when provider throws", async () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockRejectedValue(new Error("no key")),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toEqual([]);
});

test("query returns empty array when timeout fires before provider responds", async () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([[0.1]]), 500)),
    ),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toEqual([]);
});

test("query filters results below 0.75 confidence", async () => {
  const provider = makeStubProvider();
  const table = makeStubTable([
    { goal: "fix null", summary: "fixed: fix null", result: "pass", filePaths: "[]", vector: [0.1], _distance: 0.4 },
    { goal: "add test", summary: "fixed: add test", result: "pass", filePaths: "[]", vector: [0.1], _distance: 0.1 },
  ]);
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  (injector as unknown as { table: unknown }).table = table;
  (injector as unknown as { opened: boolean }).opened = true;
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toHaveLength(1);
  expect(result[0]!.summary).toBe("fixed: add test");
  expect(result[0]!.confidence).toBeGreaterThanOrEqual(0.75);
});

test("query caps results at 3", async () => {
  const provider = makeStubProvider();
  const rows = Array.from({ length: 6 }, (_, i) => ({
    goal: `task ${i}`,
    summary: `fixed: task ${i}`,
    result: "pass",
    filePaths: "[]",
    vector: [0.1],
    _distance: 0.05,
  }));
  const table = makeStubTable(rows);
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  (injector as unknown as { table: unknown }).table = table;
  (injector as unknown as { opened: boolean }).opened = true;
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toHaveLength(3);
});

test("index does not throw when provider errors", () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockRejectedValue(new Error("network error")),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  expect(() => injector.index("fix the bug", ["src/"], true)).not.toThrow();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/memory test 2>&1 | tail -10
```

Expected: FAIL — `MemoryInjector` not found.

- [ ] **Step 3: Create `packages/memory/src/memory-injector.ts`**

```typescript
import { mkdir } from "node:fs/promises";
import * as lancedb from "@lancedb/lancedb";
import type { EmbeddingProvider } from "./embeddings.js";

export interface PatternHint {
  summary: string;
  outcome: "fixed" | "regressed";
  confidence: number;
}

interface OutcomeRow {
  goal: string;
  filePaths: string;
  summary: string;
  result: "pass" | "fail";
  vector: number[];
  _distance?: number;
}

const QUERY_TIMEOUT_MS = 200;
const MIN_CONFIDENCE = 0.75;
const MAX_PATTERNS = 3;

export class MemoryInjector {
  private db: lancedb.Connection | undefined;
  private table: lancedb.Table | undefined;
  private opened = false;

  constructor(
    private provider: EmbeddingProvider,
    private dbPath: string,
  ) {}

  private async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    await mkdir(this.dbPath, { recursive: true });
    this.db = await lancedb.connect(this.dbPath);
    const names = await this.db.tableNames();
    if (names.includes("task_outcomes")) {
      this.table = await this.db.openTable("task_outcomes");
    }
  }

  async query(goal: string, _allowedPaths: string[]): Promise<PatternHint[]> {
    const timeout = new Promise<PatternHint[]>((resolve) =>
      setTimeout(() => resolve([]), QUERY_TIMEOUT_MS),
    );
    return Promise.race([this._query(goal), timeout]).catch(() => []);
  }

  private async _query(goal: string): Promise<PatternHint[]> {
    await this.open();
    if (!this.table) return [];
    const [vector] = await this.provider.embed([goal]);
    if (!vector) return [];
    const rows = (await this.table
      .search(vector)
      .limit(MAX_PATTERNS * 3)
      .toArray()) as OutcomeRow[];
    return rows
      .map((r) => ({
        summary: r.summary,
        outcome: (r.result === "pass" ? "fixed" : "regressed") as "fixed" | "regressed",
        confidence: Math.max(0, 1 - (r._distance ?? 1)),
      }))
      .filter((h) => h.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_PATTERNS);
  }

  index(goal: string, allowedPaths: string[], pass: boolean): void {
    void this._index(goal, allowedPaths, pass).catch(() => {});
  }

  private async _index(goal: string, allowedPaths: string[], pass: boolean): Promise<void> {
    await this.open();
    if (!this.db) return;
    const summary = `${pass ? "fixed" : "failed"}: ${goal.slice(0, 40)}`;
    const result: "pass" | "fail" = pass ? "pass" : "fail";
    const [vector] = await this.provider.embed([goal]);
    if (!vector) return;
    const row: OutcomeRow = {
      goal,
      filePaths: JSON.stringify(allowedPaths),
      summary,
      result,
      vector,
    };
    if (!this.table) {
      this.table = await this.db.createTable("task_outcomes", [row]);
    } else {
      await this.table.add([row]);
    }
  }
}
```

- [ ] **Step 4: Export from `packages/memory/src/index.ts`**

Add to the end of `packages/memory/src/index.ts`:

```typescript
export * from "./memory-injector.js";
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @amase/memory test 2>&1 | tail -8
```

Expected: 5 tests PASS.

- [ ] **Step 6: Build memory package**

```bash
pnpm --filter @amase/memory build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/memory-injector.ts packages/memory/src/index.ts packages/memory/tests/memory-injector.test.ts
git commit -m "feat(memory): add MemoryInjector with LanceDB task_outcomes table"
```

---

## Task 2: Add `adapter` field to `RouteResult`

**Files:**
- Modify: `packages/core/src/router.ts`
- Create: `packages/core/tests/router-adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/router-adapter.test.ts`:

```typescript
import { expect, test, beforeAll } from "vitest";
import type { TaskNode } from "@amase/contracts";
import { adapterRegistry } from "@amase/validators";
import { TypeScriptAdapter } from "@amase/validators/adapters/typescript";
import { routeNode } from "../src/router.js";

function makeNode(kind: string, language = "typescript"): TaskNode {
  return {
    id: "n1",
    kind: kind as TaskNode["kind"],
    goal: "do something",
    allowedPaths: ["src/"],
    dependsOn: [],
    language: language as TaskNode["language"],
  };
}

beforeAll(() => {
  adapterRegistry.register(new TypeScriptAdapter());
});

test("routeNode attaches typescript adapter for typescript language", () => {
  const result = routeNode(makeNode("backend", "typescript"));
  expect(result.adapter).not.toBeNull();
  expect(result.adapter?.language).toBe("typescript");
});

test("routeNode returns adapter null for unknown language", () => {
  const result = routeNode(makeNode("backend", "cobol"));
  expect(result.adapter).toBeNull();
});

test("routeNode returns adapter null for skip", () => {
  const result = routeNode(makeNode("frontend"), { skipFrontend: true });
  expect(result.adapter).toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/core test tests/router-adapter.test.ts 2>&1 | tail -8
```

Expected: FAIL — `adapter` property does not exist on `RouteResult`.

- [ ] **Step 3: Update `packages/core/src/router.ts`**

Add the import at the top (after the existing import):

```typescript
import type { AgentKind, TaskNode, ValidatorName } from "@amase/contracts";
import type { LangAdapter } from "@amase/validators";
import { adapterRegistry } from "@amase/validators";
```

Add `adapter` to the `RouteResult` interface:

```typescript
export interface RouteResult {
  agent: AgentKind | "skip";
  contextBudget: number;
  allowedValidators: ValidatorName[];
  adapter: LangAdapter | null;
}
```

Update the skip return in `routeNode`:

```typescript
  if (agent === "skip") {
    return { agent: "skip", contextBudget: 0, allowedValidators: [], adapter: null };
  }
```

Update the main return in `routeNode`:

```typescript
  return {
    agent,
    contextBudget: CONTEXT_BUDGET_A[agent] ?? 16_000,
    allowedValidators: validatorsForNode(agent, node.language),
    adapter: adapterRegistry.getByLanguage(node.language ?? "") ?? null,
  };
```

- [ ] **Step 4: Check for TypeScript adapter import path**

```bash
grep -rn "TypeScriptAdapter\|class TypeScriptAdapter" packages/validators/src/adapters/typescript.ts | head -5
```

If the class is not exported by name, update the test import to use the registry directly instead:

```typescript
// Replace the beforeAll + import with:
import { adapterRegistry } from "@amase/validators";
// adapterRegistry is pre-populated at module load time — no manual registration needed
```

Check `packages/validators/src/index.ts` for how adapters are registered at startup:

```bash
grep -n "register\|TypeScript\|adapterRegistry" packages/validators/src/index.ts | head -10
```

Adjust the test to match how adapters are actually registered.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter @amase/core test 2>&1 | tail -8
```

Expected: all tests PASS including the 3 new router-adapter tests.

- [ ] **Step 6: Build core**

```bash
pnpm --filter @amase/core build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/router.ts packages/core/tests/router-adapter.test.ts
git commit -m "feat(core): add adapter field to RouteResult via adapterRegistry lookup"
```

---

## Task 3: Wire `MemoryInjector` into the orchestrator

**Files:**
- Modify: `packages/core/src/orchestrator.ts`

- [ ] **Step 1: Add import and dep**

At the top of `packages/core/src/orchestrator.ts`, add to the imports:

```typescript
import type { MemoryInjector } from "@amase/memory";
```

In the `OrchestratorDeps` interface (around line 211), add:

```typescript
export interface OrchestratorDeps {
  agents: Record<AgentKind, BaseAgent>;
  validators: Validator[];
  store: DAGStore;
  makeDecisionLog: (path: string) => DecisionLog;
  maxRetriesPerNode?: number;
  deploymentReadiness?: boolean;
  astIndex?: ASTIndex;
  memoryInjector?: MemoryInjector;   // ADD THIS LINE
}
```

- [ ] **Step 2: Add memory query after context files are built**

Find the line in `execute()`:

```typescript
        const files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);
```

Replace with:

```typescript
        const files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);

        // Memory injection: prepend ≤3 prior patterns from LanceDB (≤150 tokens).
        // No-ops silently if injector absent, key missing, or timeout fires.
        const priorPatterns = this.deps.memoryInjector
          ? await this.deps.memoryInjector.query(node.goal, effectiveContextPaths)
          : [];
        if (priorPatterns.length > 0) {
          const memoryBlock = [
            "--- Prior patterns (confidence ≥ 0.75) ---",
            ...priorPatterns.map(
              (p, i) => `${i + 1}. [${p.outcome}] "${p.summary}" (${p.confidence.toFixed(2)})`,
            ),
          ].join("\n");
          files.unshift({ path: "__memory__", slice: memoryBlock });
        }
```

- [ ] **Step 3: Add memory index after node completes**

Find the block inside `if (outcome.ok)` that contains `recordPatchQuality` (around line 846). After `recordPatchQuality(...)`, add:

```typescript
          // Fire-and-forget memory indexing — never blocks or throws.
          this.deps.memoryInjector?.index(node.goal, effectiveContextPaths, true);
```

Also add indexing on node failure. Find the `retries += 1;` line that follows validator failure (after `lastFailureMessage = ...`), and before it, add:

```typescript
          this.deps.memoryInjector?.index(node.goal, effectiveContextPaths, false);
```

- [ ] **Step 4: Build and run full test suite**

```bash
pnpm build 2>&1 | tail -5
pnpm -r test 2>&1 | grep -E "FAIL|Tests " | grep -v cli
```

Expected: clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/orchestrator.ts
git commit -m "feat(core): wire MemoryInjector — query before LLM call, index after node completes"
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
|---|---|
| MemoryInjector class in packages/memory | Task 1 |
| PatternHint type | Task 1 |
| 200ms timeout race | Task 1 (Step 3 — `Promise.race`) |
| Graceful degradation (no key, timeout, empty table) | Task 1 (tests) |
| ≥0.75 confidence filter | Task 1 |
| Max 3 patterns | Task 1 |
| fire-and-forget index | Task 1 |
| adapter field in RouteResult | Task 2 |
| adapterRegistry lookup by language | Task 2 |
| null for unknown language | Task 2 (test) |
| memoryInjector dep in OrchestratorDeps | Task 3 |
| memory block appended to context | Task 3 |
| index on pass | Task 3 |
| index on fail | Task 3 |

### No placeholders confirmed

All tasks contain complete runnable code.
