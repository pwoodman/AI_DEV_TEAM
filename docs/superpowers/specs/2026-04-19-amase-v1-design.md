# AMASE v1 — Design Spec

**Date:** 2026-04-19
**Status:** Approved for implementation
**Scope:** Walking-skeleton agent-mesh-first MVP of AMASE v1.1 PRD.

## 1. Decisions Locked

| Area | Choice |
|---|---|
| Language / runtime | TypeScript on Node.js |
| Package layout | pnpm workspaces monorepo in `AI_DEV_TEAM/` |
| LLM access | Direct Anthropic SDK (router abstraction deferred) |
| v1 slice | Agent-mesh-first: 7 agent stubs with strict JSON contracts, orchestrator wired last |
| Execution substrate | In-process TS classes, parallelism via `Promise.all` + worker threads where needed |
| Contract validation | Zod (schemas double as TS types) |
| Memory | Full: DAG store + AST index (`ts-morph`) + embeddings (LanceDB) + decision log |
| Embedding model | Voyage `voyage-code-3` |
| Intake | MCP server over stdio (`@modelcontextprotocol/sdk`), plus thin CLI |
| MCP tools | Lifecycle: `amase_plan` / `amase_execute` / `amase_status` / `amase_artifacts` |
| Lint/format | Biome |
| Test runner | Vitest |
| UI automation | Playwright |

## 2. Repo Layout

```
AI_DEV_TEAM/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── .mcp.json
├── docs/superpowers/specs/
└── packages/
    ├── contracts/      # Zod schemas + inferred TS types
    ├── core/           # Orchestrator, DAG engine, scheduler, retry
    ├── agents/         # 7 agents + BaseAgent, prompt templates on disk
    ├── validators/     # tsc, Biome, Vitest, Playwright, Zod, patch-safety
    ├── memory/         # DAGStore, ASTIndex, Embeddings, DecisionLog
    ├── llm/            # Anthropic SDK wrapper + template loader
    ├── mcp-server/     # stdio MCP server
    └── cli/            # Thin CLI wrapping core
```

Each package: own `package.json`, `src/`, `tests/`, `index.ts` export surface.

## 3. Core Data Flow

1. **Intake** via MCP `amase_plan` or CLI → `FeatureRequest` (Zod-validated).
2. **Architect Agent** (invoked only for multi-module requests) emits `TaskGraph` (DAG of `TaskNode`s).
3. **Router** (pure function, non-LLM) assigns an agent per node `kind`; nodes with no matching artifact are skipped (dynamic routing).
4. **Scheduler** executes ready nodes in parallel; respects DAG dependencies.
5. Each agent receives a **scoped context envelope** (slices, schemas, diffs, related symbols) assembled by `memory`. Full-repo context is prohibited.
6. Agent emits `AgentOutput` (patches + metadata) → **validator chain** runs deterministically before any retry.
7. First validator failure → **targeted retry** on the failing node only, with validator error injected into `context.diff`. Max 2 retries per node.
8. Patches apply to a git-tracked **workspace sandbox** (`.amase/runs/<dagId>/workspace`).
9. **Aggregator** bundles final artifacts + decision log entry.

**Invariant:** no LLM call happens without a validated Zod input and a scoped context envelope.

## 4. Agent Contract

```ts
// AgentInput
{
  taskId: string,
  kind: 'architect'|'backend'|'frontend'|'refactor'|'test-gen'|'qa'|'ui-test',
  goal: string,
  context: {
    files: Array<{path: string, slice: string}>,
    schemas?: JsonSchema[],
    diff?: string,
    relatedSymbols?: Symbol[],
  },
  constraints: { maxTokens: number, timeoutMs: number, allowedPaths: string[] }
}

// AgentOutput
{
  taskId: string,
  patches: Array<{path: string, op: 'create'|'modify'|'delete', content: string}>,
  notes: string,        // ≤200 chars
  followups?: TaskNode[]
}
```

**BaseAgent** (abstract class) handles: input validation, prompt template loading from `agents/<name>/prompt.md` (no inline prompts — prevents drift), LLM call, output validation, metrics emission. Subclasses override `buildPrompt(input)` and optionally `postProcess(raw)`.

Adding an 8th agent = one folder + one template + one class.

## 5. Validator Chain

Fixed order; each validator is a pure `(patches, workspace) => ValidationResult`:

1. **Schema** — Zod-validate `AgentOutput`.
2. **Patch safety** — each patch `path` inside `constraints.allowedPaths`; no traversal.
3. **Syntax/type** — apply patches to sandbox, run `tsc --noEmit` on affected files only.
4. **Lint** — Biome.
5. **Unit tests** — Vitest, scoped to files touching changed paths.
6. **UI tests** — Playwright, conditional on frontend-path changes.

**Retry policy:** validator failure → reinvoke only the failing agent with validator error appended to `context.diff`. Max 2 retries per node. After exhaustion, node marked `failed` and its branch halts; independent branches continue.

**Metrics per node:** tokens in/out, wall time, retry count, validator outcomes. Written to decision log (JSONL) so PRD KPI targets are measurable from day one.

## 6. Memory Layer

Four stores in `packages/memory`, each behind a small interface for swappability:

- **DAGStore** — in-memory `Map<dagId, TaskGraph>` + JSONL snapshot on every transition (crash-safe, no DB).
- **ASTIndex** — `ts-morph`, exposes `getSlice(symbol)` and `findRefs(symbol)`. Cached per-file by mtime hash.
- **Embeddings** — LanceDB table `code_symbols` (path, symbol, kind, vector). Populated lazily on related-symbol lookup. Vectors from Voyage `voyage-code-3`.
- **DecisionLog** — append-only JSONL at `.amase/runs/<dagId>/decisions.jsonl`. Never replayed as chat context.

All stores scoped per-run under `.amase/runs/<dagId>/` — runs are isolated and deletable.

## 7. MCP Server Surface

`packages/mcp-server` over stdio:

- `amase_plan({ request, workspacePath })` → `{ dagId, nodes }`. Runs Architect + router; no codegen.
- `amase_execute({ dagId, approveAll? })` → `{ runId }`. Kicks off parallel execution; returns immediately.
- `amase_status({ runId })` → `{ state, nodes: [{id, status, retries, tokensIn, tokensOut}], logTail }`.
- `amase_artifacts({ runId })` → patch bundle + decision log entries.

Claude Code pattern: plan → show DAG to user → execute → poll status → fetch artifacts. Registered via `.mcp.json` at repo root.

## 8. Testing Strategy

- **Unit tests** per package (Vitest); `llm` package heavily mocked.
- **Contract tests** — fixtures directory per Zod schema; round-trip valid/invalid cases.
- **Integration tests** on orchestrator using a stub LLM returning pre-canned patches — DAG/validator/retry loop tested without API calls.
- **One E2E smoke test** against real Anthropic API (env-gated), runs a small "add function + test" task.

## 9. Success Criteria (per PRD §4)

Measurable from the decision log on MVP completion:

- ≥1.5× throughput vs single-agent baseline (Claude Code running the same request sequentially).
- ≤60% token usage vs baseline.
- ≥90% task success rate; ≤15% retry rate.
- ≥70% parallelization efficiency (DAG critical-path ratio).
- ≥90% UI interaction coverage and ≥95% workflow pass rate when UI artifacts exist.

## 10. Extension — Skills, Security Engineer, Deployment Manager (approved 2026-04-19)

### 10.1 Skill Library (`packages/skills`)

Each skill is a folder: `id`, `guide.md` (prompt-injection text), optional `check.ts` (deterministic validator function). Topics:

- Backend: `backend/rest-api`, `backend/async-jobs`, `backend/data-model`.
- Frontend: `frontend/component-design`, `frontend/state-management`, `frontend/accessibility`.
- Languages: `lang/typescript`, `lang/python`, `lang/go`, `lang/sql`.
- Security: `security/secrets`, `security/input-validation`, `security/authn-authz`.
- Deployment: `deployment/dockerize`, `deployment/ci-gates`, `deployment/observability`.

Selection: `TaskNode` gains `skills?: string[]`; when absent, the resolver auto-infers from `kind` + detected `language` + touched paths. `BaseAgent` injects each selected skill's `guide.md` under an `## Applicable skills` header in the system prompt. Skills with `check()` run in the validator chain after `patch-safety` and before `typecheck`.

### 10.2 Security Engineer

- **Validator (`security`)** — deterministic aggregation of `security/*` skill checks: secret scan, dangerous-dep scan, unvalidated-input heuristics, raw-SQL concat detection. Runs per node.
- **Agent (`security`)** — LLM review over the node's patch bundle. Invoked when Architect emits a `security` node or when the security validator raises a warning above threshold.

### 10.3 Deployment Manager

- **Agent (`deployment`)** — generates/edits `Dockerfile`, CI workflows, readiness docs, migration notes. Triggered by Architect node of kind `deployment`, or automatically when patches touch `Dockerfile`, `.github/workflows/*`, `infra/*`, or `migrations/*`.
- **Readiness Gate** — runs once at end-of-DAG. Checks: all nodes terminal, no unresolved security warnings, Dockerfile present if runtime exists, CI workflow exists, CHANGELOG/README mentions the change, migrations paired with rollbacks. Emits `shippable: true|false` to decision log. Blocking behavior is opt-in per run.

### 10.4 Contract Additions

- `AgentKindSchema` += `"security" | "deployment"`.
- `TaskNodeSchema` += `skills?: string[]`, `language?: "ts" | "js" | "py" | "go" | "sql" | "other"`.
- `DecisionLogEntry.event` += `"skill.applied"`, `"deployment.readiness"`.
- `ValidatorNameSchema` += `"security"`, `"deployment-readiness"`.

### 10.5 MCP Addition

- `amase_skills({ filter? })` — list skills + what would auto-apply for a given language/kind hint.

### 10.6 Backwards compatibility

All new fields optional; the existing flow and test suite are unchanged when no skills are declared. Security and deployment validators/agents are opt-in via config.

## 11. Out of Scope for v1

- Router abstraction / multi-provider LLM access.
- Cross-project persistent learning.
- Visual (screenshot-diff) UI validation.
- CI/CD pipeline ownership.
- Autonomous backlog generation.
- Human-in-the-loop approval UI (CLI/MCP prompts only).
