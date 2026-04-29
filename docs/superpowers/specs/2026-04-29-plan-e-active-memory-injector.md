# Plan E — Active Memory Injector Design

**Date:** 2026-04-29
**Status:** Approved

---

## 1. Goal

Wire LanceDB similarity search into context assembly so the agent receives ≤3 relevant prior-task patterns (≤150 tokens) before every LLM call. Add `adapter: LangAdapter | null` to `RouteResult` so downstream consumers (Plan F forward risk analyser) can access the registered adapter without a second registry lookup.

---

## 2. Architecture

```
orchestrator.execute()
  ↓
routeNode()  →  RouteResult { agent, contextBudget, allowedValidators, adapter }   [new: adapter]
  ↓
MemoryInjector.query(goal, allowedPaths)          [new — race vs 200ms timeout]
  → priorPatterns: PatternHint[]  ([] on miss/timeout/no key)
  ↓
buildContextFiles()  →  append memory block to context envelope
  ↓
agent.run(input)
  ↓
[node completes]
  ↓
MemoryInjector.index(goal, allowedPaths, pass)    [new — fire-and-forget]
```

---

## 3. New LanceDB Table: `task_outcomes`

Separate from the existing `code_symbols` table. Schema:

```ts
interface OutcomeRecord {
  goal: string          // task goal text (embedded)
  filePaths: string     // JSON-serialised string[] of allowedPaths (stored, not embedded)
  summary: string       // ≤50-char outcome label, e.g. "fixed: null-guard on sum()"
  result: "pass" | "fail"
  vector: number[]      // embedding of goal
}
```

Keyed by embedding of `goal`. Queried by cosine similarity against current task goal.

---

## 4. MemoryInjector Class

Lives in `packages/memory/src/memory-injector.ts`.

```ts
export interface PatternHint {
  summary: string           // ≤50 chars
  outcome: "fixed" | "regressed" | "optimised"
  confidence: number        // cosine similarity, 0–1
}

export class MemoryInjector {
  constructor(
    private store: EmbeddingStore,   // opened on construction
    private provider: EmbeddingProvider,
  ) {}

  // Returns [] if VOYAGE_API_KEY absent, timeout fires, or table empty.
  async query(goal: string, allowedPaths: string[]): Promise<PatternHint[]>

  // Fire-and-forget. Errors are swallowed — never throws.
  index(goal: string, allowedPaths: string[], pass: boolean): void
}
```

**query():**
- Wraps Voyage embed + LanceDB search in `Promise.race([..., timeout(200)])`.
- Filters results to `confidence >= 0.75`.
- Returns at most 3 results, sorted by confidence descending.
- On any error (no key, timeout, LanceDB miss): returns `[]`.

**index():**
- Calls `provider.embed([goal])` then `store.upsert(...)` in a detached promise.
- Errors are caught and discarded — never propagates.
- Summary is derived from: `pass ? "fixed: <first 40 chars of goal>" : "failed: <first 40 chars of goal>"`.
- Outcome: `pass → "fixed"`, `fail → "regressed"`.

---

## 5. RouteResult Change

```ts
// packages/core/src/router.ts
export interface RouteResult {
  agent: AgentKind | "skip"
  contextBudget: number
  allowedValidators: ValidatorName[]
  adapter: LangAdapter | null        // NEW
}
```

`routeNode()` calls `adapterRegistry.get(node.language ?? "")` and attaches the result. Returns `null` when no adapter is registered for the language.

---

## 6. Context Envelope — Memory Block

After `buildContextFiles()`, if `priorPatterns.length > 0`, the orchestrator appends:

```
--- Prior patterns (confidence ≥ 0.75) ---
1. [fixed] "add null guard in handleInput" (0.91)
2. [regressed] "extract pagination helper" (0.82)
```

Plain text, no JSON. Hard cap: 3 patterns × ~50 tokens each = 150 tokens max. The block is appended after file slices, before the task goal.

---

## 7. Orchestrator Wiring

`OrchestratorDeps` gains an optional `memoryInjector?: MemoryInjector`. When absent, query returns `[]` and index is a no-op. The bench adapter does not supply one (no Voyage key in bench env), so bench runs are unaffected.

In `execute()`:
1. After `routeNode()` → call `memoryInjector?.query(node.goal, effectiveContextPaths)` with 200ms timeout.
2. Append memory block to context if patterns returned.
3. After node completes (pass or fail) → call `memoryInjector?.index(node.goal, effectiveContextPaths, pass)`.

---

## 8. Graceful Degradation

| Condition | Behaviour |
|---|---|
| `VOYAGE_API_KEY` not set | `MemoryInjector` constructor skips — dep not injected |
| Voyage API timeout (>200ms) | Race resolves with `[]`, continues |
| LanceDB table empty (first run) | `search()` returns `[]`, continues |
| `confidence < 0.75` | Pattern filtered out |
| All patterns filtered | Empty block, no context change |

---

## 9. Files

| Action | File | Purpose |
|---|---|---|
| Create | `packages/memory/src/memory-injector.ts` | `MemoryInjector` class |
| Modify | `packages/memory/src/index.ts` | Export `MemoryInjector`, `PatternHint` |
| Modify | `packages/core/src/router.ts` | Add `adapter` to `RouteResult` |
| Modify | `packages/core/src/orchestrator.ts` | Wire query + index + memory block |
| Create | `packages/memory/tests/memory-injector.test.ts` | Unit tests with stub EmbeddingStore |
| Create | `packages/core/tests/router-adapter.test.ts` | Tests for adapter field in RouteResult |

---

## 10. Tests

- `MemoryInjector.query()` returns `[]` when provider throws
- `MemoryInjector.query()` returns `[]` when timeout fires
- `MemoryInjector.query()` filters results below 0.75 confidence
- `MemoryInjector.query()` caps at 3 results
- `MemoryInjector.index()` does not throw on provider error
- `routeNode()` attaches correct adapter for known language
- `routeNode()` returns `adapter: null` for unknown language
