# Plan F — Forward Risk Analyser + Structured Delta Output Design

**Date:** 2026-04-29
**Status:** Approved

---

## 1. Goal

Add a post-validator forward risk analysis step to the orchestrator that:
- Detects regression risk via AST caller-walk (TypeScript) and adapter test runs (all languages)
- Detects forward risks via heuristic scan (all languages)
- Emits structured `ForwardRiskResult` on the run result and as `quality.json` in the workspace

HIGH regression risk blocks output and triggers one retry with risk context injected. MEDIUM and forward risks annotate but do not block.

---

## 2. Architecture

```
runValidatorChain(validators)   ← existing, unchanged
  ↓ (all pass)
runForwardRiskAnalysis(patches, workspace, language, adapter)   ← new
  ↓
ForwardRiskResult { regressionRisk, forwardRisks }
  ↓
write quality.json to workspace
  ↓
attach to orchestrator run result
  ↓
if regressionRisk === "HIGH" → retry once with risk context
```

---

## 3. ForwardRiskResult Type

Lives in `packages/contracts/src/validation.ts` alongside existing validation types.

```ts
export type RegressionRisk = "LOW" | "MEDIUM" | "HIGH";

export interface ForwardRisk {
  kind: "api-shape" | "schema" | "perf-path";
  file: string;
  detail: string;   // e.g. "exported function 'fetchUser' removed"
}

export interface ForwardRiskResult {
  regressionRisk: RegressionRisk;
  forwardRisks: ForwardRisk[];
}
```

---

## 4. `runForwardRiskAnalysis` Function

Lives in `packages/validators/src/forward-risk.ts`.

```ts
export async function runForwardRiskAnalysis(
  patches: Patch[],
  workspace: string,
  language: string | undefined,
  adapter: LangAdapter | null,
): Promise<ForwardRiskResult>
```

Three passes run in parallel, results merged:

### Pass 1 — Heuristic Scan (all languages)

Pure string analysis over patch content. No I/O.

**api-shape:** detect removed/renamed exports by diffing `export function|class|const|type` names between before/after in the patch hunk.

**schema:** match patterns `z\.object|z\.string|z\.number|migration|ALTER TABLE|openapi` in changed lines.

**perf-path:** match file paths against `*/middleware/*`, `*/hot-path/*`, `*/critical/*`, or inline annotation `// perf-sensitive`.

Each match → one `ForwardRisk` entry. Does not set `regressionRisk` (that comes from passes 2/3).

### Pass 2 — AST Caller-Walk (TypeScript only)

Only runs when patch contains `.ts` or `.tsx` files.

1. For each changed TS file, call `ASTIndex.listSymbols(path)` on the before-state.
2. Compare against symbols present in the patch after-state — identify removed or renamed exports.
3. `glob('**/*.ts', workspace)` → for each file, check if it imports the changed file.
4. Each importing file found → `regressionRisk` escalates: `LOW → MEDIUM`.
5. Capped at MEDIUM — AST walk alone cannot confirm a regression, only flag the risk.

Skipped entirely for non-TS files. Returns `regressionRisk: LOW` if no changed TS files.

### Pass 3 — Adapter Test Run (all languages when adapter present)

Calls `adapter.test(changedFilePaths, workspace)`.

| Test result | regressionRisk contribution |
|---|---|
| Pass | LOW |
| Fail | HIGH |
| Adapter null / test throws | LOW (no degradation — test wasn't available) |

**HIGH is the only blocking condition.** Triggers one retry.

### Merging Results

```
finalRisk = max(pass2Risk, pass3Risk)   // HIGH > MEDIUM > LOW
```

Pass 1 contributes `forwardRisks[]` only, never affects `regressionRisk`.

---

## 5. Retry on HIGH

When `regressionRisk === HIGH`, the orchestrator:

1. Appends to the agent's retry context:
   ```
   --- Regression risk: HIGH ---
   Tests failed after applying patch. Failing output:
   <first 500 chars of adapter.test() stderr>
   Revise the patch to fix the failing tests.
   ```
2. Re-runs the agent node once (retries counter incremented).
3. Re-runs validator chain + forward risk analysis on the new patch.
4. If still HIGH after retry → marks node as failed, surfaces error.

Only one retry is allowed for forward risk HIGH. The existing validator retry budget is separate.

---

## 6. Delta Output — `quality.json`

Written to `<workspace>/quality.json` after forward risk analysis completes (pass or retry-resolved).

```json
{
  "regressionRisk": "LOW",
  "forwardRisks": [],
  "validatorFailures": 0,
  "retries": 0,
  "tokensUsed": 812,
  "diffSimilarity": 0.91
}
```

`tokensUsed`, `validatorFailures`, `retries`, and `diffSimilarity` are pulled from existing orchestrator metrics already in scope at that point.

---

## 7. Run Result Change

`OrchestratorRunResult` (or equivalent event emission) gains:

```ts
forwardRisk?: ForwardRiskResult   // undefined if analyser not run (e.g. validators failed)
```

The bench adapter reads this for the metrics loop (future — not wired in Plan F, just emitted).

---

## 8. Orchestrator Wiring

In `execute()`, after `runValidatorChain` returns all-pass:

```ts
const riskResult = await runForwardRiskAnalysis(
  patches, paths.workspace, node.language, routeResult.adapter
);
await writeQualityJson(paths.workspace, { ...riskResult, validatorFailures, retries, tokensIn, diffSimilarity });
if (riskResult.regressionRisk === "HIGH" && retries === 0) {
  // inject risk context and retry
}
```

`writeQualityJson` is a small helper that serialises and writes `quality.json`.

---

## 9. Files

| Action | File | Purpose |
|---|---|---|
| Modify | `packages/contracts/src/validation.ts` | Add `ForwardRiskResult`, `ForwardRisk`, `RegressionRisk` types |
| Create | `packages/validators/src/forward-risk.ts` | `runForwardRiskAnalysis` — three-pass analysis |
| Modify | `packages/validators/src/index.ts` | Export `runForwardRiskAnalysis`, `ForwardRiskResult` |
| Modify | `packages/core/src/orchestrator.ts` | Wire post-validator call, retry logic, quality.json write |
| Create | `packages/validators/tests/forward-risk.test.ts` | Unit tests for all three passes |
| Create | `packages/contracts/tests/forward-risk-types.test.ts` | Schema parse tests for new types |

---

## 10. Tests

**Heuristic scan:**
- Detects removed export in patch hunk
- Detects Zod schema mutation (`z.object` change)
- Detects perf-path file match (`src/middleware/auth.ts`)
- Returns empty forwardRisks for clean patch

**AST caller-walk:**
- Returns MEDIUM when importing file found for changed TS symbol
- Returns LOW when no importing files found
- Skips entirely for non-TS patch

**Adapter test run:**
- Returns HIGH when adapter.test() fails
- Returns LOW when adapter.test() passes
- Returns LOW when adapter is null

**Merge:**
- HIGH from pass 3 overrides MEDIUM from pass 2
- forwardRisks accumulate across all passes

**Orchestrator integration:**
- quality.json written after successful analysis
- Retry triggered exactly once on HIGH
- No retry triggered on MEDIUM
