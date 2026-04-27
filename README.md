# AMASE — Autonomous Multi-Agent SDLC Engine

Control plane over AI models for end-to-end SDLC execution. Orchestrates specialised agents against a task DAG, runs deterministic validators before any LLM retry, and exposes its lifecycle as an MCP server Claude Code can drive.

See [`docs/superpowers/specs/2026-04-19-amase-v1-design.md`](docs/superpowers/specs/2026-04-19-amase-v1-design.md) for the approved v1 design.

## Layout

```
packages/
├── contracts/      Zod schemas + inferred TS types
├── core/           Orchestrator, DAG scheduler, router, sandbox
├── agents/         BaseAgent + 7 agents with on-disk prompt templates
├── validators/     schema → patch-safety → tsc → biome → vitest → playwright
├── memory/         DAGStore, DecisionLog (JSONL), ASTIndex (ts-morph), LanceDB embeddings
├── llm/            Anthropic SDK wrapper + stub client for tests
├── mcp-server/     stdio MCP server: amase_plan / amase_execute / amase_status / amase_artifacts
└── cli/            `amase plan` / `amase run` — same core as MCP
```

## Setup

```bash
pnpm install
pnpm build
```

Set credentials before running agents:

```
export ANTHROPIC_API_KEY=sk-...
export VOYAGE_API_KEY=pa-...     # only required when embeddings are used
```

## Use via Claude Code (MCP)

`.mcp.json` at the repo root already registers the server. After `pnpm build`, Claude Code will expose four tools:

- `amase_plan({ request, workspacePath })` — Architect decomposes the request into a DAG.
- `amase_execute({ dagId })` — runs the DAG in parallel with validator gates.
- `amase_status({ runId })` — current node states + tail of decision log.
- `amase_artifacts({ runId })` — sandbox path + full decision log.

### Environment flags

- `ANTHROPIC_API_KEY` — required unless `AMASE_LLM_STUB=1`.
- `AMASE_LLM_STUB=1` — use an in-process stub LLM (architect emits a trivial DAG, other agents return a single `src/stub.ts` patch). Used by tests and local smoke runs.
- `AMASE_STUB_FIXTURE=/path/to.json` — when `AMASE_LLM_STUB=1`, every call returns the file contents verbatim.
- `AMASE_MINIMAL_VALIDATORS=1` — run only `schema` + `patch-safety` (skips tsc/biome/vitest/playwright). Useful for sandboxed smoke runs without a real project.

### Local smoke tests

```
node scripts/smoke-orchestrator.mjs   # stub LLM, in-process orchestrator
node scripts/mcp-smoke.mjs            # spawns mcp-server and drives it over stdio
```

## Use via CLI

```
pnpm --filter @amase/cli start -- plan "add a /health endpoint" --workspace ./some-app
pnpm --filter @amase/cli start -- run  "add a /health endpoint" --workspace ./some-app
```

## Invariants

- No LLM call without a Zod-validated input and a scoped context envelope.
- Agents never receive full-repo context — only file slices, schemas, diffs, related symbols.
- Deterministic validators run first. LLM retries are only triggered by validator failure, with the failure message injected as `context.diff`.
- Prompt templates live on disk under `packages/agents/src/prompts/` — never inline.
- Max 2 retries per node; failed branches halt, independent branches continue.

## Success metrics (measured from the decision log)

≥1.5× throughput, ≤60% token use vs single-agent baseline, ≥90% task success, ≤15% retry rate, ≥70% parallelization efficiency, ≥90% UI interaction coverage when UI artifacts exist.

## Benchmarks

See [`docs/bench/README.md`](docs/bench/README.md) for the bench runner, headline interpretation, and local/CI invocation.

## Status

Walking-skeleton complete and green:

- `pnpm install && pnpm build` — all 8 packages compile.
- `pnpm test` — 55 tests across 10 files pass (contracts, llm, agents, validators, memory, core, MCP stdio round-trip).
- `node scripts/mcp-smoke.mjs` — end-to-end stdio drive of `plan → execute → status → artifacts` in <2 s.

Next:

1. Wire Architect / Backend / Frontend prompts against the real Anthropic API on a toy workspace.
2. Implement context-envelope assembly (memory → agent) — agents currently receive `files: []`.
3. Tune retry/validator policies using observed decision-log metrics.
