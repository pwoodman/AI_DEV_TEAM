# Plan D: Enhanced Task Router + Context Budget — Design

**Date:** 2026-04-27
**Status:** Approved
**Goals:** Faster execution, fewer tokens, better end result through focused context and scoped validators.

---

## 1. Objective

Replace the current 6-line `routeNode()` function (which returns only `AgentKind | "skip"`) with a richer `RouteResult` that carries a per-task context byte budget and an allowed-validator list. Implement three candidate options, measure each empirically against two bench fixtures, and promote the winner to the permanent default. Additionally add three always-on simple-task optimizations (architect bypass, mention-path context pre-filtering, validator short-circuit) that close the performance gap against vanilla Claude Code on small obvious tasks.

---

## 2. Success Criteria

- `tokensIn + tokensOut` reduced vs baseline on both `add-pagination-to-list-endpoint` (medium) and `fix-failing-vitest` (micro)
- Both tasks still pass (same correctness)
- Wall time equal or lower on both fixtures
- Architect bypass fires on `fix-failing-vitest` (detectable by absence of architect LLM call in decision log)
- No regressions in the full 250-test suite

---

## 3. Data Model

`routeNode()` returns `RouteResult` instead of `AgentKind | "skip"`:

```ts
interface RouteResult {
  agent: AgentKind | "skip";
  contextBudget: number;               // bytes cap for buildContextFiles()
  allowedValidators: ValidatorName[];  // subset of the full validator chain
}
```

`ValidatorName` is the existing type from `@amase/contracts` (`"schema" | "patch-safety" | "lang-adapter" | "ui-tests" | "security"`).

The orchestrator filters its validator chain to `allowedValidators` before executing each node.

---

## 4. Option A — Budget by Kind + Validator Scoping

Pure lookup tables, zero runtime cost. No structural changes to `orchestrator.ts` beyond wiring.

### Context budgets (bytes)

```ts
const CONTEXT_BUDGET: Record<AgentKind, number> = {
  frontend:  8_000,
  backend:  16_000,  // current default — unchanged
  refactor: 28_000,
  qa:        8_000,
  "ui-test": 8_000,
};
```

### Allowed validators

```ts
const ALLOWED_VALIDATORS: Record<AgentKind, ValidatorName[]> = {
  frontend:  ["schema", "patch-safety", "lang-adapter"],
  backend:   ["schema", "patch-safety", "lang-adapter", "security"],
  refactor:  ["schema", "patch-safety", "lang-adapter"],
  qa:        ["schema", "patch-safety", "lang-adapter"],
  "ui-test": ["schema", "patch-safety", "ui-tests"],
};
```

**Additional rule:** if `node.language` is not `"typescript"` or `"javascript"`, `"ui-tests"` is always dropped from `allowedValidators`.

---

## 5. Option B — ContextAssembler Class

Same budgets and validator scoping as Option A. The only change: `buildContextFiles()` is extracted from `orchestrator.ts` into `packages/core/src/context-assembler.ts`:

```ts
export class ContextAssembler {
  async build(
    workspace: string,
    allowedPaths: string[],
    budgetBytes: number,
  ): Promise<Array<{ path: string; slice: string }>>
}
```

The orchestrator constructs one `ContextAssembler` instance per run and calls `build()`. Behaviour is identical to Option A. This option confirms the extraction is safe and behaviour-neutral — a prerequisite for Plan E's memory injection, which will slot into `ContextAssembler.build()`.

---

## 6. Option C — Token-Estimate Budget

Same validator scoping as Option A. Budget is expressed in tokens (using `chars ÷ 4` as the proxy), matching the PRD target of "≤1000 tokens typical per task". Converted to bytes at call time: `maxBytes = tokenBudget * 4`.

### Token budgets

```ts
const TOKEN_BUDGET: Record<AgentKind, number> = {
  frontend:   600,
  backend:   1000,
  refactor:  1800,
  qa:         600,
  "ui-test":  600,
};
```

This option tests whether a tighter budget materially reduces `tokensIn` vs Option A, or whether the existing file-packing logic already keeps context lean enough that C adds no benefit.

---

## 7. Simple-Task Optimizations

Three additional optimizations applied on top of whichever router option wins the comparison. Each targets the overhead gap between AMASE and vanilla Claude Code on small, obvious tasks.

### 7.1 Architect Bypass (fast path)

**Problem:** even a trivially single-file task pays for a full architect LLM call to produce a DAG before any real work starts.

**Detection heuristic** (pure string analysis, no LLM, applied in `plan()`):
- Request mentions exactly one file path (regex: `\b\S+\.\w{1,5}\b`)
- Request contains no coordination words: `across`, `all files`, `everywhere`, `refactor`, `migrate`, `rename throughout`
- Request length < 300 characters

When all three conditions hold, `plan()` skips the architect call and pre-builds a single-node DAG directly:

```ts
{
  nodes: [{
    id: "n1",
    kind: detectKind(request),   // frontend | backend | qa — pure regex
    allowedPaths: [detectedPath],
    dependsOn: [],
  }]
}
```

**Fallback:** if the resulting patch fails validation, the orchestrator retries with a full architect-planned DAG (existing path). The bypass saves one LLM call on success; on failure it costs one extra round-trip — acceptable since the heuristic is conservative.

### 7.2 Mention-Path Context Pre-filtering

**Problem:** `buildContextFiles()` crawls all `allowedPaths` even when the request explicitly names the file to edit, loading unrelated files and wasting context budget.

**Rule:** if the request contains a file path that exists in the workspace, set `allowedPaths = [mentionedPath]` and skip all directory crawling. The context budget then covers only that file and any imports it explicitly references (one level deep, resolved statically from the file's `import`/`require` statements).

Applied in the orchestrator before `buildContextFiles()` — no change to `routeNode()` or `ContextAssembler`.

### 7.3 Validator Short-Circuit for Micro Tasks

**Problem:** `lang-adapter` runs lint + typecheck + tests even for patches that only touch test files or single isolated functions where type errors are structurally impossible.

**Rule:** when `node.kind` is `"qa"` and the patch touches only `*.test.ts` / `*.spec.ts` files, drop `lang-adapter` from `allowedValidators` and run only `["schema", "patch-safety"]`. Test files cannot introduce type errors in production code; the test runner already validates correctness.

This is additive to the `allowedValidators` logic in Section 4 — applied as a post-processing step on the `RouteResult` before the validator chain runs.

---

## 8. Feature Flag

All three router options plus the baseline are toggled via:

```
AMASE_ROUTER_MODE=baseline|option-a|option-b|option-c
```

The simple-task optimizations (Section 7) are always active alongside whichever router mode is selected — they are not behind a flag. Default (when unset): `baseline`.

---

## 9. Comparison Script

`scripts/router-comparison.mjs` runs all four modes sequentially against two fixtures:
- `add-pagination-to-list-endpoint` (medium — tests router budget impact)
- `fix-failing-vitest` (micro — tests simple-task optimization impact)

```
mode              fixture                          tokensIn  tokensOut  wallMs  pass
──────────────────────────────────────────────────────────────────────────────────────
baseline          add-pagination-to-list-endpoint  —         —          —       —
baseline          fix-failing-vitest               —         —          —       —
option-a          add-pagination-to-list-endpoint  —         —          —       —
option-a          fix-failing-vitest               —         —          —       —
option-b          add-pagination-to-list-endpoint  —         —          —       —
option-b          fix-failing-vitest               —         —          —       —
option-c          add-pagination-to-list-endpoint  —         —          —       —
option-c          fix-failing-vitest               —         —          —       —
```

Each mode calls `runAmase(fixture, opts)` directly. One run per cell — directional, not statistically significant.

**Winner:** lowest `tokensIn + tokensOut` summed across both fixtures that still passes both.

---

## 10. Winner Promotion

After running the comparison:

1. The winning option's implementation becomes the unconditional default.
2. The `AMASE_ROUTER_MODE` env flag is deleted.
3. The two losing option implementations are deleted.
4. `scripts/router-comparison.mjs` is deleted (one-shot diagnostic).
5. All changes land in one commit: `feat(core): promote router option-X as default`.

---

## 11. Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Modify | `packages/core/src/router.ts` | Add `RouteResult` type; implement all 3 options + validator short-circuit (§7.3) |
| Create | `packages/core/src/context-assembler.ts` | Extracted `ContextAssembler` class (Option B) |
| Modify | `packages/core/src/orchestrator.ts` | Wire `contextBudget` + `allowedValidators`; add architect bypass (§7.1) + mention-path pre-filter (§7.2) |
| Create | `packages/core/tests/router-route-result.test.ts` | Unit tests for all three `RouteResult` options + short-circuit rule |
| Create | `packages/core/tests/context-assembler.test.ts` | Unit tests for `ContextAssembler` (Option B) |
| Create | `packages/core/tests/architect-bypass.test.ts` | Unit tests for bypass heuristic (all three detection conditions) |
| Create | `scripts/router-comparison.mjs` | Comparison runner — deleted after winner is promoted |

---

## 12. Testing

- **Unit tests** for `routeNode()` covering every `AgentKind` × all three modes: assert correct `contextBudget` and `allowedValidators`.
- **Unit tests** for `ContextAssembler.build()`: assert byte cap is respected, files are packed correctly.
- **Unit tests** for architect bypass heuristic: test all boundary conditions (path present/absent, coordination words, length threshold).
- **Unit tests** for validator short-circuit: `qa` node with test-only patch → `["schema", "patch-safety"]` only.
- **Full suite** (`pnpm test`) must pass with each mode active before comparison is run.
- **Comparison script** is the acceptance gate — winner must pass both fixtures.
