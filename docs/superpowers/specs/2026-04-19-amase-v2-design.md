# AMASE v2 — Outperforming Superpowers

**Status:** Draft
**Date:** 2026-04-19
**Supersedes additively:** `2026-04-19-amase-v1-design.md` (v1 primitives remain; v2 adds architect upgrade, performance mechanisms, and a measurement harness)

## 1. Goal

On a frozen benchmark of ≥5 real tasks where both stacks pass, AMASE must beat the Superpowers skill stack by:

- **≥30% lower wall-clock time to completion**
- **≥15% fewer tokens consumed**
- **Pass rate ≥ Superpowers' pass rate** (no regression)
- Subjectively "better finished result" — higher diff similarity to golden patch, fewer validator retries

These three numeric targets are measured by the harness in §5 and form the acceptance gate in §8.

## 2. Non-goals

- Not a rewrite. v1 primitives (DAG, validators, retry policy, decision log, AST index, MCP surface) stay.
- Not a platform. This spec scopes to v2 of the orchestrator + one new `bench` package + one new test package. No new agents, no new validators beyond what's already in v1.
- Not a multi-model router. v2 stays on Anthropic SDK.

## 3. Summary

Five changes, composed:

1. **Benchmark harness** (`packages/bench/`) — frozen fixtures + runner + reporter with pass-gated headline and Pareto matrix.
2. **Architect gap-filler** — three-tier ambiguity decision (rubric → classifier → self-flag) with 3-option user questions and decision-log reuse.
3. **Cost bundle** — prompt caching, enforced context trimming, decision-log reuse.
4. **Speed bundle** — speculative execution, self-correction pre-commit, parallelism tuning.
5. **MCP verification** — stdio contract tests + property-based fuzz.

## 4. Why this beats Superpowers

Superpowers relies on model judgment for every "should I ask the user?" decision, runs no prompt caching, re-reads whole files into context, has no cross-session decision memory, and offers no benchmark. The gap is architectural, not vibe-level: AMASE replaces model judgment with a deterministic rubric on ~99% of decisions and caches static prompts. That is where the token reduction is quantifiable and where the time savings compound.

## 5. Benchmark harness — `packages/bench/`

### 5.1 Fixtures

8 fixtures under `packages/bench/fixtures/<task-id>/` (middle of the 5–10 range; enough for statistical signal while keeping authoring cost bounded). Each fixture contains:

- `prompt.md` — the user request, copy-pasted verbatim into both stacks.
- `before/` — initial workspace tree.
- `expected.patch` — golden diff used for `diff_similarity` scoring.
- `tests/` — a vitest (or equivalent) suite that is **red** against `before/` and **green** against `before/ + expected.patch`.

Initial fixture set (authoring is part of v2 implementation, not this spec):

1. `add-zod-schema` — add a schema + one test.
2. `fix-failing-vitest` — locate and fix a single failing unit test.
3. `refactor-function` — split a 40-line function into two.
4. `add-cli-flag` — add one flag to an existing CLI entrypoint.
5. `rename-symbol` — rename across 3 files.
6. `handle-null-input` — add null-guard + test in a pure function.
7. `extract-constant` — pull a magic number into a named const with test.
8. `add-typed-error` — replace string error with typed error class.

### 5.2 Runner

`amase bench run --stacks=amase,superpowers [--tasks=<glob>]`

For each (task, stack):

1. Create a temp worktree from `before/`.
2. Invoke the stack with `prompt.md` as input.
3. Record timestamp before/after.
4. On completion, run `tests/` against the resulting worktree.
5. Write one line to `bench/results/<run-id>.jsonl`:

```json
{
  "task_id": "add-zod-schema",
  "stack": "amase",
  "pass": true,
  "tokens_in": 12430,
  "tokens_out": 1892,
  "wall_ms": 48210,
  "diff_similarity": 0.87,
  "retries": 0
}
```

**Superpowers adapter** (`packages/bench/adapters/superpowers.ts`) spawns a Claude Code subprocess with the Superpowers plugin active, pipes in the prompt, and scrapes tokens/time from the JSONL transcript. Adapter is the only bridge point; if Claude Code's transcript format changes, only this file breaks.

**AMASE adapter** (`packages/bench/adapters/amase.ts`) calls the orchestrator in-process, tallying tokens from `AgentOutput.metadata` (already tracked in v1 per `2026-04-19-amase-v1-design.md` §5).

### 5.3 Reporter

`amase bench report [--run=<id>]` emits:

- **Headline (A):** `token_delta`, `time_delta`, `pass_rate_delta`, each computed only over tasks where *both* stacks passed. Printed as a three-line summary plus a confidence note: if `n < 5`, output is "insufficient signal" instead of a number. This prevents over-claiming from a tiny sample.
- **Matrix (C):** full per-task table and a `report.html` with a 2D scatter (tokens vs time, colored by pass). Used for diagnosis when the headline moves.
- **Guardrail:** if `pass_rate_delta < 0`, the run is marked `regression` regardless of token/time wins.

### 5.4 Cost control

**Default mode:** `AMASE_LLM_STUB=1` with a per-fixture response cache. Both stacks run against recorded LLM responses keyed by `(task_id, prompt_hash)`. First pass records; subsequent runs replay. Near-zero API cost per iteration. This is the mode CI and local dev use.

**Truth mode:** `amase bench run --live` uses real API on both stacks. Expensive (budget ~$0.10–$0.50 per fixture per stack); run manually, e.g. weekly, to verify the stub numbers haven't drifted from reality.

The stub-mode numbers only count as valid if a `--live` run within the last 7 days agrees within ±10% on each of the three headline deltas (`token_delta`, `time_delta`, `pass_rate_delta`). Otherwise the cached responses are stale and must be re-recorded.

## 6. Architect gap-filler — `packages/agents/architect/`

Three-tier ambiguity decision, run per decision point during DAG construction. A "decision point" = anywhere the architect would currently silently pick between shapes (module layout, data model, dependency choice, etc.).

### 6.1 Tier 1 — Heuristic rubric (free, ~99% of decisions)

Score each decision against a fixed checklist. Each yes = +1 point:

- Touches a public API (anything exported from a package entry point)
- Changes a persisted data model (schema, migration, stored format)
- Adds a runtime dependency not already in `package.json`
- Changes a module boundary (move/create/delete files that are imported across package boundaries)
- Costs more than 3 files of changes
- Introduces a cross-cutting concern (auth, logging, error handling surface, i18n)

**Decision:**
- Score ≥2 → ask user (Tier output: 3 options).
- Score 0 → decide silently; append to decision log as `auto-decided`.
- Score 1 → Tier 2.

Rubric is encoded in `architect/rubric.ts` as a pure function `(decision: DecisionDraft) => number`. It is unit-tested with 20+ fixture decisions. Users can extend the rubric per-project via `CLAUDE.md` directives loaded at architect startup (e.g., "always ask about auth changes" → adds an `auth` predicate).

### 6.2 Tier 2 — Classifier (~150 tokens, cached prompt, fires on ~1% of decisions)

When Tier 1 score = 1, a single LLM call classifies `ask | decide`. System prompt is static and wrapped in `cache_control: {type: "ephemeral"}`, so the recurring cost is ~150 input tokens + ~5 output tokens per call. Expected volume: 1–2 calls per task.

### 6.3 Tier 3 — Self-flag (free, opt-in)

Architect's normal LLM output can include `"needs_user_input": true` with a reason. This fires even when the rubric score is 0, catching spec-level ambiguity (e.g., "the prompt says 'handle errors gracefully' but doesn't define gracefully") that the structural rubric can't see.

### 6.4 Question shape

Every user-facing question emits exactly three options, each with a one-line trade-off, and marks one as recommended. Schema:

```ts
interface UserQuestion {
  question: string;
  options: [Option, Option, Option];
  recommended: 0 | 1 | 2;
  reason: string;
}
```

Exposed over MCP as a new tool `amase_clarify({ runId }) → UserQuestion | null`. `amase_answer({ runId, choice })` resumes execution.

### 6.5 Decision-log reuse

Before Tier 1 fires, architect queries the workspace's decision log (`.amase/decisions.jsonl`) for a prior decision with matching `{node.kind, touched_paths signature}`. Hit → reuse the prior answer silently, log the new entry as `reused_from: <prior_entry_id>`. Miss → proceed to Tier 1.

The "touched paths signature" is the sorted list of glob-normalized paths (e.g. `src/api/*.ts` rather than a specific file). Prevents brittle exact-match misses.

## 7. Performance bundles

### 7.1 Cost bundle

**Prompt caching.** `llm/AnthropicClient.ts` wraps every `system` message and every injected skill guide in `cache_control: {type: "ephemeral"}`. Targets: 5-min TTL cache hits on all agent system prompts and on all `skills/*/guide.md` bodies. Measured via `usage.cache_read_input_tokens` in response metadata.

**Context trimming.** `BaseAgent.buildContext()` signature changes to require either `symbols: string[]` or `files: string[]`. Whole-workspace reads are removed. The architect is responsible for declaring the minimal slice per node when emitting the DAG. `ASTIndex.getSlice(symbol)` is the default reader; `fs.readFile` is allowed only when a symbol-level slice is impossible (non-TS files).

**Decision-log reuse.** See §6.5.

### 7.2 Speed bundle

**Speculative execution.** `Scheduler` starts DAG nodes whose dependencies are all resolved *and* which are not downstream of an unresolved user question. If a speculative node's output is later invalidated by the user's answer, its changes are rolled back (sandbox-level: each node runs in its own worktree branch and is only merged on DAG completion).

**Self-correction pre-commit.** `BaseAgent.emit()` runs `schema` + `patch-safety` validators on the agent's draft patch in-process before returning. If either fails, the agent performs one inline self-correction pass using the cached conversation history — no new system prompt send — and re-emits. This replaces ~50% of today's full-retry cycles (estimated from v1 retry log analysis in implementation).

**Parallelism tuning.** `Scheduler.fanout` raised from implicit 1-per-node to `min(readyNodes.length, CPU_COUNT)` for validator-bound work. Agent-bound work stays at 1 per node (API rate limiting).

## 8. Acceptance criteria

v2 ships when a single `amase bench run --stacks=amase,superpowers` over all 8 fixtures produces:

- `token_delta ≥ 15%` (pass-gated)
- `time_delta ≥ 30%` (pass-gated)
- `pass_rate_delta ≥ 0`
- Both-passed subset size ≥ 5
- `diff_similarity` mean for AMASE ≥ Superpowers' mean
- MCP contract tests green (§9)
- MCP fuzz suite green for 1000 iterations (§9)

A `--live` run within 7 days must agree with the stub numbers within ±10% on the headline.

## 9. MCP verification

### 9.1 Stdio contract tests — `tests/mcp-contract/`

Vitest suite that spawns the MCP server as a child process with `AMASE_LLM_STUB=1` and drives it over stdio. Per tool (`amase_plan`, `amase_execute`, `amase_status`, `amase_artifacts`, and the new `amase_clarify`, `amase_answer`), assertions:

- Tool schema matches `mcp-server/schema.ts` exactly.
- Happy-path response returns in <2s with stub LLM.
- Invalid input returns a JSON-RPC error, does not crash the server.
- Decision log is written to the expected path.
- Validator chain fires in the documented order.
- Server shuts down cleanly on stdin close.

Runs in CI on every PR.

### 9.2 Property-based fuzz — `tests/mcp-fuzz/`

`fast-check` generates random valid `amase_plan` inputs (bounded workspace trees + request strings). Invariants checked per generated input:

- Produced DAG is acyclic.
- Every node has `retries ≤ 2`.
- Decision log JSONL is parseable by a round-trip test.
- No node has circular path dependencies.

Runs nightly, not per-PR. 1000 iterations per nightly run.

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Superpowers adapter breaks when Claude Code transcript format changes | Medium | Adapter is isolated in one file; add a version probe at harness startup that fails fast if transcript schema drifts. |
| Stub-mode numbers drift from live reality | Medium | `--live` reconciliation within 7 days required for valid acceptance (§5.4). |
| Prompt-cache TTL missed due to request pacing | Low | Instrument `cache_read_input_tokens` and surface hit rate in `bench report`; warn if below 50% of input tokens are cache hits. |
| Rubric misses a shape-changing decision category | Medium | 20+ unit-test fixtures required for the rubric; additions made via CLAUDE.md extensions without code changes. |
| Speculative execution rollback corrupts workspace | Medium | Per-node worktree branches; rollback = branch discard, never a mutation on the user's workspace. |
| Self-correction loop infinite-loops on persistent schema errors | Low | Hard cap: one self-correction pass; second failure falls through to normal retry. |
| 8 fixtures too few for statistical significance on close deltas | Medium | Acceptance requires both-passed subset ≥5 AND headline deltas well above the target (15%/30% with margin). Grow to 16 fixtures in v2.1 if signal is noisy. |

## 11. Implementation order

Recommended task sequencing for the implementation plan (to be produced by `writing-plans`):

1. Benchmark harness scaffold + 2 fixtures (`add-zod-schema`, `fix-failing-vitest`) + stub-mode only.
2. Superpowers adapter + AMASE adapter + reporter.
3. Remaining 6 fixtures.
4. Prompt caching in `AnthropicClient`.
5. Context trimming in `BaseAgent`.
6. Architect rubric (Tier 1) + 20 unit-test fixtures.
7. `amase_clarify` / `amase_answer` MCP tools + `UserQuestion` schema.
8. Tier 2 classifier + Tier 3 self-flag.
9. Decision-log reuse.
10. Self-correction pre-commit.
11. Speculative execution + per-node worktree branches.
12. Parallelism tuning.
13. Stdio contract tests.
14. Property-based fuzz.
15. First full `amase bench run --live` to record baseline and verify acceptance.
