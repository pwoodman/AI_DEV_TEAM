# AMASE Bench

Evidence system for the "≥30% faster, ≤70% tokens" claim vs superpowers.

## Run locally

Primary fairness (the headline claim), live Sonnet on both sides, N=3 samples:

```bash
pnpm build
ANTHROPIC_API_KEY=sk-... node packages/bench/dist/cli.js run \
  --samples=3 --model=claude-sonnet-4-6 --fairness=primary --live
```

Both modes in one run:

```bash
ANTHROPIC_API_KEY=sk-... node packages/bench/dist/cli.js run \
  --samples=3 --model=claude-sonnet-4-6 --fairness=both --live
```

Single task for iteration (cheap, stub mode):

```bash
node packages/bench/dist/cli.js run --tasks=add-cli-flag --samples=1
```

## Report verdicts

| verdict | meaning |
|---|---|
| `ok` | ≥30% wall-time win AND ≥30% token win over superpowers; both stacks passed every fully-green task; CI-green. |
| `fail_targets` | Both stacks produced enough fully-green tasks to compare, but one or both headline deltas are below 30%. CI fails. |
| `regression` | AMASE pass rate < superpowers pass rate. CI fails hard. |
| `insufficient_signal` | Fewer than 5 tasks are fully green in both stacks. Not a claim — a "fix the bench" state. |

`wallMs.ci95` / `tokens.ci95` report the 95% confidence interval on the delta (as a fraction). Non-overlapping-with-zero ⇒ statistically significant.

## Pass gate

Each task's `pass` is:

1. Typecheck the patched workspace (`tsc --noEmit` for ts/js fixtures).
2. Run the fixture's `tests/` suite with vitest.

Both must succeed. `diffSimilarity` is reported but does not gate.

## Fixture categories

| Category | Count | Scope |
|---|---|---|
| micro | 5 | Single-file edit |
| medium | 5 | 2–4 file changes across packages |
| large | 3 | Feature-sized (endpoint, middleware, pipeline) |

## CLI reference

```
node packages/bench/dist/cli.js run \
  [--stacks=amase,superpowers]   # default: amase,superpowers
  [--samples=3]                  # N runs per (task, stack)
  [--model=claude-sonnet-4-6]    # forced model for primary fairness
  [--fairness=primary|secondary|both]
  [--tasks=id1,id2]              # subset of fixture IDs
  [--live]                       # use real LLM (requires ANTHROPIC_API_KEY)
```
