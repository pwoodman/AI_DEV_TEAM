# Plan D: Enhanced Task Router + Context Budget — Design

**Date:** 2026-04-27
**Status:** Approved
**Goals:** Faster execution, fewer tokens, better end result through focused context and scoped validators.

---

## 1. Objective

Replace the current 6-line `routeNode()` function (which returns only `AgentKind | "skip"`) with a richer `RouteResult` that carries a per-task context byte budget and an allowed-validator list. Implement three candidate options, measure each empirically against one representative bench fixture, and promote the winner to the permanent default.

---

## 2. Success Criteria

- `tokensIn + tokensOut` reduced vs baseline on `add-pagination-to-list-endpoint`
- Task still passes (same correctness)
- Wall time equal or lower
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

## 7. Feature Flag

All three options plus the baseline are toggled via:

```
AMASE_ROUTER_MODE=baseline|option-a|option-b|option-c
```

Default (when unset): `baseline` — no behaviour change until the comparison is run and the winner is promoted.

---

## 8. Comparison Script

`scripts/router-comparison.mjs` runs all four modes sequentially against `add-pagination-to-list-endpoint` and prints a result table:

```
mode              tokensIn  tokensOut  wallMs  pass
─────────────────────────────────────────────────────
baseline          —         —          —       —
option-a          —         —          —       —
option-b          —         —          —       —
option-c          —         —          —       —
```

Each mode calls `runAmase(fixture, opts)` directly (no subprocess). Metrics are read from the returned `BenchResult`. One run per mode — this is directional, not statistically significant.

**Winner:** lowest `tokensIn + tokensOut` that still passes.

---

## 9. Winner Promotion

After running the comparison:

1. The winning option's implementation becomes the unconditional default.
2. The `AMASE_ROUTER_MODE` env flag is deleted.
3. The two losing option implementations are deleted.
4. `scripts/router-comparison.mjs` is deleted (one-shot diagnostic).
5. All changes land in one commit: `feat(core): promote router option-X as default`.

---

## 10. Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Modify | `packages/core/src/router.ts` | Return `RouteResult`; implement all 3 options behind flag |
| Create | `packages/core/src/context-assembler.ts` | Extracted `ContextAssembler` class (Option B) |
| Modify | `packages/core/src/orchestrator.ts` | Wire `contextBudget` + `allowedValidators` from `RouteResult` |
| Modify | `packages/core/src/router.ts` | Add `RouteResult` type + `RouterOptions` stays; no contracts change needed |
| Create | `packages/core/tests/router-route-result.test.ts` | Unit tests for all three `RouteResult` options |
| Create | `packages/core/tests/context-assembler.test.ts` | Unit tests for `ContextAssembler` (Option B) |
| Create | `scripts/router-comparison.mjs` | Comparison runner — deleted after winner is promoted |

---

## 11. Testing

- **Unit tests** for `routeNode()` covering every `AgentKind` × all three modes: assert correct `contextBudget` and `allowedValidators`.
- **Unit tests** for `ContextAssembler.build()`: assert byte cap is respected, files are packed correctly.
- **Full suite** (`pnpm test`) must pass with each mode active before comparison is run.
- **Comparison script** is the acceptance gate — winner must pass the fixture.
