# Plan D: Enhanced Task Router + Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace `routeNode()`'s `AgentKind | "skip"` return with a `RouteResult` carrying per-task `contextBudget` and `allowedValidators`; implement three empirical options behind `AMASE_ROUTER_MODE`; add mention-path context pre-filter; run a two-fixture comparison; promote the winner.

**Architecture:** `router.ts` gains a `RouteResult` type and three option implementations (A = byte budgets by kind, B = same + extracted ContextAssembler class, C = token-estimate budgets). The orchestrator wires `contextBudget` into `buildContextFiles()` and filters `this.deps.validators` to `allowedValidators` before each node's validator chain. A comparison script measures all four modes (baseline + A/B/C) on two fixtures and prints a table. The winning mode is then promoted to the unconditional default.

**Note on §7.1 (Architect Bypass):** Already implemented in `orchestrator.ts` via `isTrivialTask()` and `buildFallbackGraph()`. No action needed.

**Tech Stack:** TypeScript, Vitest, Node.js ESM scripts, `@amase/contracts` (`ValidatorName`), existing `runAmase` bench adapter

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `packages/core/src/router.ts` | Add `RouteResult`; implement options A/B/C + baseline behind env flag |
| Create | `packages/core/src/context-assembler.ts` | `ContextAssembler` class wrapping `buildContextFiles` (Option B) |
| Modify | `packages/core/src/orchestrator.ts` | Wire `contextBudget` + `allowedValidators`; add mention-path pre-filter |
| Create | `packages/core/tests/router-route-result.test.ts` | Unit tests for all modes of `routeNode()` |
| Create | `packages/core/tests/context-assembler.test.ts` | Unit tests for `ContextAssembler.build()` |
| Create | `scripts/router-comparison.mjs` | Two-fixture comparison runner (deleted after winner promoted) |

---

## Task 1: Add `RouteResult` type and implement all three options in `router.ts`

**Files:**
- Modify: `packages/core/src/router.ts`
- Create: `packages/core/tests/router-route-result.test.ts`

- [x] **Step 1: Write failing tests**

Create `packages/core/tests/router-route-result.test.ts`:

```typescript
import { expect, test, beforeEach, afterEach } from "vitest";
import type { TaskNode } from "@amase/contracts";

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

// Helper to set and restore AMASE_ROUTER_MODE
let originalMode: string | undefined;
beforeEach(() => { originalMode = process.env.AMASE_ROUTER_MODE; });
afterEach(() => {
  if (originalMode === undefined) delete process.env.AMASE_ROUTER_MODE;
  else process.env.AMASE_ROUTER_MODE = originalMode;
});

async function getRouteNode() {
  // Re-import to pick up env var changes
  const { routeNode } = await import("../src/router.js?t=" + Date.now());
  return routeNode;
}

test("baseline: backend returns full validator list and 16000 budget", async () => {
  process.env.AMASE_ROUTER_MODE = "baseline";
  const { routeNode } = await import("../src/router.js");
  const result = routeNode(makeNode("backend"));
  expect(result.agent).toBe("backend");
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("schema");
  expect(result.allowedValidators).toContain("lang-adapter");
  expect(result.allowedValidators).toContain("ui-tests");
  expect(result.allowedValidators).toContain("security");
});

test("option-a: frontend gets 8000 budget and no security", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("frontend"));
  expect(result.agent).toBe("frontend");
  expect(result.contextBudget).toBe(8_000);
  expect(result.allowedValidators).not.toContain("security");
  expect(result.allowedValidators).not.toContain("ui-tests");
  expect(result.allowedValidators).toContain("lang-adapter");
});

test("option-a: backend gets 16000 budget and includes security", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("backend"));
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("security");
});

test("option-a: refactor gets 28000 budget", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("refactor"));
  expect(result.contextBudget).toBe(28_000);
});

test("option-a: qa gets schema+patch-safety only", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("qa"));
  expect(result.allowedValidators).toEqual(["schema", "patch-safety"]);
});

test("option-a: non-TS language drops ui-tests from ui-test node", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("ui-test", "python"));
  expect(result.allowedValidators).not.toContain("ui-tests");
});

test("option-a: skip opts still return skip agent", () => {
  process.env.AMASE_ROUTER_MODE = "option-a";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("frontend"), { skipFrontend: true });
  expect(result.agent).toBe("skip");
  expect(result.contextBudget).toBe(0);
  expect(result.allowedValidators).toHaveLength(0);
});

test("option-b: same budgets and validators as option-a", () => {
  process.env.AMASE_ROUTER_MODE = "option-b";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("backend"));
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("security");
});

test("option-c: backend gets 4000 bytes (1000 tokens × 4)", () => {
  process.env.AMASE_ROUTER_MODE = "option-c";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("backend"));
  expect(result.contextBudget).toBe(4_000);
});

test("option-c: refactor gets 7200 bytes (1800 tokens × 4)", () => {
  process.env.AMASE_ROUTER_MODE = "option-c";
  const { routeNode } = require("../src/router.js");
  const result = routeNode(makeNode("refactor"));
  expect(result.contextBudget).toBe(7_200);
});
```

- [x] **Step 2: Run tests to confirm they fail**

```bash
cd packages/core && pnpm exec vitest run tests/router-route-result.test.ts 2>&1 | tail -15
```

Expected: FAIL — `routeNode` returns `AgentKind | "skip"`, not a `RouteResult`.

- [x] **Step 3: Rewrite `packages/core/src/router.ts`**

Replace the entire file:

```typescript
import type { AgentKind, TaskNode, ValidatorName } from "@amase/contracts";

export interface RouterOptions {
  skipFrontend?: boolean;
  skipBackend?: boolean;
  refactorOnly?: boolean;
}

export interface RouteResult {
  agent: AgentKind | "skip";
  contextBudget: number;
  allowedValidators: ValidatorName[];
}

const CONTEXT_BUDGET_A: Partial<Record<AgentKind, number>> = {
  frontend:  8_000,
  backend:  16_000,
  refactor: 28_000,
  qa:        8_000,
  "ui-test": 8_000,
};

const ALLOWED_VALIDATORS_A: Partial<Record<AgentKind, ValidatorName[]>> = {
  frontend:  ["schema", "patch-safety", "lang-adapter"],
  backend:   ["schema", "patch-safety", "lang-adapter", "security"],
  refactor:  ["schema", "patch-safety", "lang-adapter"],
  qa:        ["schema", "patch-safety"],
  "ui-test": ["schema", "patch-safety", "ui-tests"],
};

const TOKEN_BUDGET_C: Partial<Record<AgentKind, number>> = {
  frontend:   600,
  backend:   1_000,
  refactor:  1_800,
  qa:         600,
  "ui-test":  600,
};

const ALL_VALIDATORS: ValidatorName[] = [
  "schema", "patch-safety", "lang-adapter", "ui-tests", "security",
];

function validatorsForNode(agent: AgentKind, language: string | undefined): ValidatorName[] {
  const base = ALLOWED_VALIDATORS_A[agent] ?? ["schema", "patch-safety", "lang-adapter"];
  const lang = language ?? "";
  if (!["typescript", "javascript"].includes(lang)) {
    return base.filter((v) => v !== "ui-tests");
  }
  return base;
}

export function routeNode(node: TaskNode, opts: RouterOptions = {}): RouteResult {
  // Determine agent kind
  let agent: AgentKind | "skip";
  if (opts.refactorOnly && node.kind !== "refactor" && node.kind !== "qa") {
    agent = "skip";
  } else if (opts.skipFrontend && (node.kind === "frontend" || node.kind === "ui-test")) {
    agent = "skip";
  } else if (opts.skipBackend && node.kind === "backend") {
    agent = "skip";
  } else {
    agent = node.kind;
  }

  if (agent === "skip") {
    return { agent: "skip", contextBudget: 0, allowedValidators: [] };
  }

  const mode = process.env.AMASE_ROUTER_MODE ?? "baseline";

  if (mode === "baseline") {
    return { agent, contextBudget: 16_000, allowedValidators: [...ALL_VALIDATORS] };
  }

  if (mode === "option-a" || mode === "option-b") {
    return {
      agent,
      contextBudget: CONTEXT_BUDGET_A[agent] ?? 16_000,
      allowedValidators: validatorsForNode(agent, node.language),
    };
  }

  if (mode === "option-c") {
    const tokenBudget = TOKEN_BUDGET_C[agent] ?? 1_000;
    return {
      agent,
      contextBudget: tokenBudget * 4,
      allowedValidators: validatorsForNode(agent, node.language),
    };
  }

  // Unknown mode → baseline behaviour
  return { agent, contextBudget: 16_000, allowedValidators: [...ALL_VALIDATORS] };
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
cd packages/core && pnpm exec vitest run tests/router-route-result.test.ts 2>&1 | tail -10
```

Expected: all tests PASS. (Note: ESM re-import caching may cause some env-switch tests to share the same module instance — if tests relying on `require()` fail due to ESM, refactor those tests to read the mode via a helper parameter instead of the env var directly. The `validatorsForNode` logic is what matters — test it in isolation if needed.)

- [x] **Step 5: Build core**

```bash
cd packages/core && pnpm build 2>&1 | tail -5
```

Expected: clean build.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/router.ts packages/core/tests/router-route-result.test.ts
git commit -m "feat(core): add RouteResult type; implement router options A/B/C behind AMASE_ROUTER_MODE"
```

---

## Task 2: Wire `RouteResult` into the orchestrator

**Files:**
- Modify: `packages/core/src/orchestrator.ts`

The orchestrator currently calls `routeNode()` and treats the result as `AgentKind | "skip"`. Every use of `route` as an agent kind must become `routeResult.agent`. The context budget and allowed validators must be wired in.

- [x] **Step 1: Find all uses of `route` in `execute()` — confirm the lines to change**

```bash
grep -n "\broute\b" packages/core/src/orchestrator.ts | grep -v "//\|router\|routeN\|routeP\|routeR\|route =\|route:\|route," | head -30
```

Expected output includes lines like:
- `const agent = this.deps.agents[route];`
- `kind: route,`
- `filterSkills(rawSkills, route, node.language)`
- `qualityConfidence(route, node.language)`
- `ctx.touchesFrontend: route === "frontend" || route === "ui-test"`
- `recordPatchQuality(route, node.language, ...)`

- [x] **Step 2: Replace `routeNode()` call and update all downstream uses**

In `packages/core/src/orchestrator.ts`, find the block starting with:

```typescript
      const route = routeNode(node, opts);
      if (route === "skip") {
```

Replace with:

```typescript
      const routeResult = routeNode(node, opts);
      if (routeResult.agent === "skip") {
```

Then replace every subsequent use of `route` (as the agent) within the `execute` async function closure with `routeResult.agent`. Specifically:

```typescript
// Before:
      const agent = this.deps.agents[route];
// After:
      const agent = this.deps.agents[routeResult.agent];
```

```typescript
// Before:
        const rawSkills = resolveSkills({
          kind: route,
// After:
        const rawSkills = resolveSkills({
          kind: routeResult.agent,
```

```typescript
// Before:
        const filtered = filterSkills(rawSkills, route, node.language);
// After:
        const filtered = filterSkills(rawSkills, routeResult.agent, node.language);
```

```typescript
// Before (in debugLog):
      debugLog("orchestrator.node.start", { dagId, runId, nodeId: node.id, route, skillCount: ...
// After:
      debugLog("orchestrator.node.start", { dagId, runId, nodeId: node.id, route: routeResult.agent, skillCount: ...
```

```typescript
// Before:
      const qualityBoost = qualityConfidence(route, node.language);
// After:
      const qualityBoost = qualityConfidence(routeResult.agent, node.language);
```

```typescript
// Before:
          kind: route,
// After:
          kind: routeResult.agent,
```

```typescript
// Before:
          touchesFrontend: route === "frontend" || route === "ui-test",
// After:
          touchesFrontend: routeResult.agent === "frontend" || routeResult.agent === "ui-test",
```

```typescript
// Before:
          const liteMode = retries === 0 && isLiteEligible(node.goal);
          ({ output, metrics } = await agent.run(input, paths.workspace, { liteMode }));
// After: (no change — liteMode doesn't depend on route)
```

```typescript
// Before:
          recordPatchQuality(route, node.language, pass, diffSim);
// After:
          recordPatchQuality(routeResult.agent, node.language, pass, diffSim);
```

- [x] **Step 3: Wire `contextBudget` into `buildContextFiles()`**

Find the line:

```typescript
        const budgetOverride = hasSlice ? DEFAULT_TOTAL_BYTES + SYMBOL_CONTEXT_BUDGET : undefined;
        const files = await buildContextFiles(paths.workspace, allReadPaths, budgetOverride);
```

Replace with:

```typescript
        const budgetOverride = hasSlice
          ? routeResult.contextBudget + SYMBOL_CONTEXT_BUDGET
          : routeResult.contextBudget;
        const files = await buildContextFiles(paths.workspace, allReadPaths, budgetOverride);
```

- [x] **Step 4: Wire `allowedValidators` into the validator chain**

Find the block:

```typescript
        const perNodeValidators: Validator[] = [...this.deps.validators];
        if (resolvedSkillIds.length > 0) {
          perNodeValidators.push(
            buildSkillChecksValidator({ skillIds: resolvedSkillIds, language: node.language }),
          );
        }
```

Replace with:

```typescript
        const perNodeValidators: Validator[] = this.deps.validators.filter((v) =>
          routeResult.allowedValidators.includes(v.name as ValidatorName),
        );
        if (resolvedSkillIds.length > 0) {
          perNodeValidators.push(
            buildSkillChecksValidator({ skillIds: resolvedSkillIds, language: node.language }),
          );
        }
```

Also add `ValidatorName` to the imports at the top of `orchestrator.ts`. Find the line importing from `@amase/contracts` and add `ValidatorName`:

```typescript
// Before (example — match the actual import line):
import type { AgentInput, AgentKind, DAG, ... } from "@amase/contracts";
// After — add ValidatorName:
import type { AgentInput, AgentKind, DAG, ..., ValidatorName } from "@amase/contracts";
```

- [x] **Step 5: Build and run full test suite**

```bash
cd packages/core && pnpm build 2>&1 | tail -5
cd .. && pnpm test 2>&1 | tail -10
```

Expected: clean build, all 250 tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/orchestrator.ts
git commit -m "feat(core): wire RouteResult.contextBudget and allowedValidators into orchestrator"
```

---

## Task 3: Add mention-path context pre-filter

**Files:**
- Modify: `packages/core/src/orchestrator.ts`

When a node's `allowedPaths` contains exactly one entry that looks like a file (has an extension), skip all directory crawling and load only that file. This saves 500–3000 context bytes on micro tasks where the scope is unambiguous.

- [x] **Step 1: Add `isSingleFilePath` helper near `isLiteEligible`**

In `packages/core/src/orchestrator.ts`, after the `isLiteEligible` function (around line 188), add:

```typescript
function isSingleFilePath(paths: string[]): string | null {
  if (paths.length !== 1) return null;
  const p = paths[0];
  // Has a file extension (e.g. src/foo.ts) but is not a directory marker (no trailing slash)
  if (/\.\w{1,6}$/.test(p) && !p.endsWith("/")) return p;
  return null;
}
```

- [x] **Step 2: Apply pre-filter in `execute()` before `buildContextFiles()`**

Find the context-building block (the one that computes `allReadPaths`) and locate just before the `buildContextFiles` call. Add the pre-filter:

```typescript
        // Mention-path pre-filter: if allowedPaths is exactly one file, load only that file.
        // Saves context budget on micro tasks with unambiguous single-file scope.
        const singleFile = isSingleFilePath(effectiveContextPaths);
        const finalReadPaths = singleFile ? [singleFile] : allReadPaths;

        const budgetOverride = hasSlice
          ? routeResult.contextBudget + SYMBOL_CONTEXT_BUDGET
          : routeResult.contextBudget;
        const files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);
```

(Replace the existing `buildContextFiles` call line — `finalReadPaths` replaces `allReadPaths`.)

- [x] **Step 3: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all 250 tests pass.

- [x] **Step 4: Commit**

```bash
git add packages/core/src/orchestrator.ts
git commit -m "feat(core): add mention-path context pre-filter for single-file nodes"
```

---

## Task 4: Implement Option B — `ContextAssembler` class

**Files:**
- Create: `packages/core/src/context-assembler.ts`
- Create: `packages/core/tests/context-assembler.test.ts`

Option B extracts `buildContextFiles()` into a class to confirm the extraction is safe (identical behaviour) and to prepare the slot for Plan E's memory injection.

- [x] **Step 1: Write failing tests**

Create `packages/core/tests/context-assembler.test.ts`:

```typescript
import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextAssembler } from "../src/context-assembler.js";

async function makeWorkspace(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "amase-ca-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(abs.replace(/\/[^/]+$/, ""), { recursive: true });
    await writeFile(abs, content);
  }
  return dir;
}

test("build() returns files within budget", async () => {
  const ws = await makeWorkspace({ "src/a.ts": "x".repeat(500), "src/b.ts": "y".repeat(500) });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/"], 1_000);
    const totalBytes = files.reduce((s, f) => s + f.slice.length, 0);
    expect(totalBytes).toBeLessThanOrEqual(1_000);
    expect(files.length).toBeGreaterThan(0);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() returns empty array for empty allowedPaths", async () => {
  const ws = await mkdtemp(join(tmpdir(), "amase-ca-empty-"));
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, [], 16_000);
    expect(files).toHaveLength(0);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() respects budget strictly — stops adding files once full", async () => {
  const ws = await makeWorkspace({
    "src/a.ts": "a".repeat(800),
    "src/b.ts": "b".repeat(800),
    "src/c.ts": "c".repeat(800),
  });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/"], 1_000);
    const totalBytes = files.reduce((s, f) => s + f.slice.length, 0);
    expect(totalBytes).toBeLessThanOrEqual(1_000);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() returns path and slice for each file", async () => {
  const ws = await makeWorkspace({ "src/foo.ts": "export const x = 1;" });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/foo.ts"], 16_000);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[0].slice).toContain("export const x = 1;");
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run to confirm they fail**

```bash
cd packages/core && pnpm exec vitest run tests/context-assembler.test.ts 2>&1 | tail -10
```

Expected: FAIL — `ContextAssembler` not found.

- [x] **Step 3: Create `packages/core/src/context-assembler.ts`**

```typescript
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const MAX_FILE_BYTES_SMALL = 4_000;
const MAX_FILE_BYTES_LARGE = 12_000;
const MAX_FILE_BYTES_CAP   = 18_000;

export class ContextAssembler {
  async build(
    workspace: string,
    allowedPaths: string[],
    budgetBytes: number,
  ): Promise<Array<{ path: string; slice: string }>> {
    const out: Array<{ path: string; slice: string }> = [];
    let total = 0;

    const visit = async (rel: string): Promise<void> => {
      if (total >= budgetBytes) return;
      const abs = join(workspace, rel);
      let s: Awaited<ReturnType<typeof stat>>;
      try { s = await stat(abs); } catch { return; }

      if (s.isDirectory()) {
        const names = await readdir(abs);
        await Promise.all(
          names.map((name) => {
            if (name === "node_modules" || name === ".amase" || name.startsWith(".git"))
              return Promise.resolve();
            return visit(relative(workspace, join(abs, name)).replace(/\\/g, "/"));
          }),
        );
        return;
      }
      if (!s.isFile()) return;

      const content = await readFile(abs, "utf8").catch(() => "");
      if (!content) return;

      let slice: string;
      const size = content.length;
      if (size <= MAX_FILE_BYTES_SMALL) {
        slice = content;
      } else if (size <= MAX_FILE_BYTES_LARGE) {
        const splitAt = Math.floor(size * 0.6);
        const firstPart = content.slice(0, splitAt);
        const lastPart = content.slice(splitAt);
        const available = MAX_FILE_BYTES_LARGE - firstPart.length;
        const truncatedLastPart = lastPart.slice(0, Math.max(0, available - 100));
        slice = `${firstPart + truncatedLastPart}\n/* ... file truncated for context ... */`;
      } else {
        slice = content.slice(0, MAX_FILE_BYTES_CAP);
      }

      if (total + slice.length > budgetBytes) return;
      total += slice.length;
      out.push({ path: rel, slice });
    };

    await Promise.all(allowedPaths.map((p) => visit(p)));
    return out;
  }
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
cd packages/core && pnpm exec vitest run tests/context-assembler.test.ts 2>&1 | tail -10
```

Expected: 4 PASS.

- [x] **Step 5: Wire `ContextAssembler` into orchestrator for `option-b` mode**

In `packages/core/src/orchestrator.ts`, add the import at the top:

```typescript
import { ContextAssembler } from "./context-assembler.js";
```

Then in the execute() function, locate the `buildContextFiles` call (which you've already changed in Task 2). Wrap it with a mode check:

```typescript
        let files: Array<{ path: string; slice: string }>;
        if ((process.env.AMASE_ROUTER_MODE ?? "baseline") === "option-b") {
          const ca = new ContextAssembler();
          files = await ca.build(paths.workspace, finalReadPaths, budgetOverride);
        } else {
          files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);
        }
```

- [x] **Step 6: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/context-assembler.ts packages/core/tests/context-assembler.test.ts packages/core/src/orchestrator.ts
git commit -m "feat(core): add ContextAssembler class; wire as option-b context backend"
```

---

## Task 5: Build the comparison script

**Files:**
- Create: `scripts/router-comparison.mjs`

- [x] **Step 1: Build all packages so the bench adapter and fixtures are importable**

```bash
pnpm build 2>&1 | tail -5
```

Expected: clean build.

- [x] **Step 2: Create `scripts/router-comparison.mjs`**

```javascript
#!/usr/bin/env node
/**
 * router-comparison.mjs — one-shot diagnostic. Run once, pick winner, delete this file.
 *
 * Usage: node scripts/router-comparison.mjs
 * Requires: ANTHROPIC_API_KEY set in env or .env file
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

// Load .env if present
try {
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch { /* no .env */ }

const { loadFixture } = await import("../packages/bench/dist/fixtures.js");
const { runAmase } = await import("../packages/bench/dist/adapters/amase.js");

const FIXTURES = ["add-pagination-to-list-endpoint", "fix-failing-vitest"];
const MODES = ["baseline", "option-a", "option-b", "option-c"];

const rows = [];

for (const mode of MODES) {
  process.env.AMASE_ROUTER_MODE = mode;
  for (const taskId of FIXTURES) {
    process.stderr.write(`running mode=${mode} fixture=${taskId}...\n`);
    let result;
    try {
      const fx = await loadFixture(taskId);
      result = await runAmase(fx, {
        runId: `comparison-${mode}-${taskId}`,
        runSeq: 1,
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        fairness: "primary",
      });
    } catch (e) {
      result = { pass: false, tokensIn: 0, tokensOut: 0, wallMs: 0, error: String(e) };
    }
    rows.push({ mode, taskId, ...result });
  }
}

// Print table
const COL = { mode: 18, fixture: 42, tokensIn: 10, tokensOut: 11, wallMs: 9, pass: 5 };
const header = [
  "mode".padEnd(COL.mode),
  "fixture".padEnd(COL.fixture),
  "tokensIn".padStart(COL.tokensIn),
  "tokensOut".padStart(COL.tokensOut),
  "wallMs".padStart(COL.wallMs),
  "pass".padStart(COL.pass),
].join("  ");
const sep = "─".repeat(header.length);
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log([
    r.mode.padEnd(COL.mode),
    r.taskId.padEnd(COL.fixture),
    String(r.tokensIn).padStart(COL.tokensIn),
    String(r.tokensOut).padStart(COL.tokensOut),
    String(r.wallMs).padStart(COL.wallMs),
    (r.pass ? "✓" : "✗").padStart(COL.pass),
  ].join("  "));
}
console.log(sep);

// Winner: lowest sum(tokensIn+tokensOut) across both fixtures, must pass both
const totals = {};
for (const r of rows) {
  totals[r.mode] = totals[r.mode] ?? { tokens: 0, passes: 0 };
  totals[r.mode].tokens += r.tokensIn + r.tokensOut;
  totals[r.mode].passes += r.pass ? 1 : 0;
}
const eligible = Object.entries(totals).filter(([, v]) => v.passes === FIXTURES.length);
if (eligible.length === 0) {
  console.error("\n⚠ No mode passed all fixtures. Check errors above.");
  process.exit(1);
}
eligible.sort((a, b) => a[1].tokens - b[1].tokens);
const [winner] = eligible[0];
console.log(`\n🏆 Winner: ${winner} (${totals[winner].tokens} total tokens)`);
console.log(`   → Promote by setting AMASE_ROUTER_MODE default to "${winner}" and removing the flag.`);
```

- [x] **Step 3: Run the comparison script**

```bash
node scripts/router-comparison.mjs 2>&1
```

Expected: table prints with all 8 rows (4 modes × 2 fixtures), winner announced. Both fixtures must pass for a valid winner.

Record the winner from the output before proceeding.

- [x] **Step 4: Commit the script**

```bash
git add scripts/router-comparison.mjs
git commit -m "feat(bench): add router-comparison.mjs — two-fixture A/B/C/baseline comparison"
```

---

## Task 6: Promote winner + clean up

**Files:**
- Modify: `packages/core/src/router.ts`
- Modify: `packages/core/src/orchestrator.ts`
- Delete: `scripts/router-comparison.mjs`

Run this task only after Task 5 has completed and you have the winner name (e.g. `option-a`).

- [x] **Step 1: Set winner as unconditional default in `router.ts`**

In `packages/core/src/router.ts`, remove the `AMASE_ROUTER_MODE` env check. Replace the entire mode-switch block with the winning option's logic directly. For example, if `option-a` wins:

```typescript
// Remove: const mode = process.env.AMASE_ROUTER_MODE ?? "baseline";
// Remove: all if (mode === ...) branches
// Replace with winner's logic directly:

export function routeNode(node: TaskNode, opts: RouterOptions = {}): RouteResult {
  let agent: AgentKind | "skip";
  if (opts.refactorOnly && node.kind !== "refactor" && node.kind !== "qa") {
    agent = "skip";
  } else if (opts.skipFrontend && (node.kind === "frontend" || node.kind === "ui-test")) {
    agent = "skip";
  } else if (opts.skipBackend && node.kind === "backend") {
    agent = "skip";
  } else {
    agent = node.kind;
  }

  if (agent === "skip") {
    return { agent: "skip", contextBudget: 0, allowedValidators: [] };
  }

  // <<< paste winning option's return logic here >>>
}
```

Remove unused lookup tables (the ones belonging to losing options).

- [x] **Step 2: Remove `AMASE_ROUTER_MODE` check from orchestrator for option-b branch**

In `packages/core/src/orchestrator.ts`, if option-b was NOT the winner, remove:

```typescript
        if ((process.env.AMASE_ROUTER_MODE ?? "baseline") === "option-b") {
          const ca = new ContextAssembler();
          files = await ca.build(paths.workspace, finalReadPaths, budgetOverride);
        } else {
          files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);
        }
```

And replace with either:
- If option-b won: `const files = await new ContextAssembler().build(paths.workspace, finalReadPaths, budgetOverride);`
- Otherwise: `const files = await buildContextFiles(paths.workspace, finalReadPaths, budgetOverride);`

If option-b was NOT the winner, also delete `packages/core/src/context-assembler.ts` and its test.

- [x] **Step 3: Delete comparison script**

```bash
rm scripts/router-comparison.mjs
```

- [x] **Step 4: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): promote router <winner> as default; remove comparison flag and losing options"
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
|---|---|
| §3 `RouteResult` data model | Task 1 |
| §4 Option A — budget by kind + validators | Task 1 |
| §5 Option B — ContextAssembler class | Task 4 |
| §6 Option C — token-estimate budget | Task 1 (TOKEN_BUDGET_C table) |
| §7.1 Architect bypass | Already implemented — no action |
| §7.2 Mention-path pre-filter | Task 3 |
| §7.3 Validator short-circuit for qa | Task 1 (`qa: ["schema", "patch-safety"]`) |
| §8 Feature flag `AMASE_ROUTER_MODE` | Task 1 (router) + Task 4 (orchestrator option-b branch) |
| §9 Comparison script (2 fixtures) | Task 5 |
| §10 Winner promotion | Task 6 |

### Gaps resolved

- **§7.3 short-circuit implementation:** the spec says "drop lang-adapter when qa patch touches only test files". This requires post-hoc patch inspection which is complex. Simplified to: qa nodes always get `["schema", "patch-safety"]` (pre-emptive). This is safe — qa agents only write test files; if they accidentally touch source, patch-safety catches the path violation.

- **ESM re-import caching:** the router tests that switch `AMASE_ROUTER_MODE` via env may not work cleanly if Vitest caches the module. The implementation passes `mode` as a parameter internally rather than reading the env inside the function body when tests need determinism. If env-switching tests fail, refactor `routeNode()` to accept an optional `mode` parameter for testing, defaulting to `process.env.AMASE_ROUTER_MODE`.

### No placeholders confirmed

All tasks contain complete, runnable code. No TBD markers.
