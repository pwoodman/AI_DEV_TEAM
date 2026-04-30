# AMASE North Star PRD — Deterministic MCP Layer for High-Performance AI Coding

**Date:** 2026-04-26
**Last updated:** 2026-04-29 (Plans E + F merged)
**Status:** Approved — active north star

---

## 1. Objective

Evolve AMASE into an MCP layer that outperforms native Claude Code and Superpowers by:

- Token usage ↓ ≥30%
- Task completion speed ≥50% faster
- One-shot completion rate ≥80%
- Test coverage on generated changes ≥80%
- Static analysis violations: 0 critical/high
- Regression detection ≥95%

## 2. Success Metrics

| Metric | Target |
|---|---|
| Token usage | ↓ ≥30% vs baseline |
| Task completion speed | ≥50% faster vs baseline |
| One-shot completion rate | ≥80% |
| Test coverage (generated changes) | ≥80% |
| Static analysis violations | 0 critical/high |
| Regression detection | ≥95% |

**Baseline:** existing bench results from Claude Code / Superpowers runs. No re-runs needed — compare AMASE output against stored results. Keep running AMASE against bench fixtures until all targets are beaten.

## 3. Core Principles

- LLM = Planner only. Never formats, validates syntax, or infers types.
- Context is minimised by default (≤1000 tokens typical per task).
- All outputs are deltas (patches), never full files.
- Deterministic systems enforce quality — LLM does not.
- Nothing is returned without passing the Quality Gate.
- Forward safety and regression awareness are mandatory on every task.

## 4. Language Support

Language-agnostic by design. Expert-level support for the top 20 languages as of 2026:

TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++, C, PHP, Ruby, Swift, Kotlin, Dart, Scala, Shell, SQL, HTML/CSS, R, Lua.

Each language is supported via a **LangAdapter** (see Section 6). TypeScript is the reference implementation (tsc + biome + vitest). Python (ruff + mypy + pytest) and Go (golangci-lint + go build + gofmt + go test) are implemented. Languages without a registered adapter degrade gracefully to schema + patch-safety validators only.

## 5. Architecture

### High-Level Flow

```
Request
  ↓
Language Detector        — deterministic, extension + shebang check        ✅ done
  ↓
Task Router              — pure function, agent + context budget + validators ✅ done
  ↓
Active Memory Injector   — pre-fetches ≤3 prior patterns from LanceDB       ✅ done
  ↓
Context Assembler        — file slices + schemas + memory, capped at budget  ✅ done
  ↓
Agent (LLM)              — plans only, emits patches
  ↓
Validator Chain          — delegates to LangAdapter: lint → typecheck → test  ✅ done
  ↓
Forward Risk Analyser    — dependency graph scan, regression check            ✅ done
  ↓
Delta Generator          — structured patch + quality metadata output         ✅ done (quality.json)
```

### Component Status

| Component | Status |
|---|---|
| MCP Server (plan/execute/status/artifacts) | ✅ exists |
| Orchestrator / DAG Scheduler | ✅ exists |
| Validator Chain (schema → patch-safety → lang-adapter → security → ui-tests) | ✅ done |
| Memory (ASTIndex, LanceDB, DecisionLog) | ✅ exists — LanceDB + embeddings infra ready |
| Language Detector | ✅ done (Plan A) |
| LangAdapter interface + Registry | ✅ done (Plan A) |
| TypeScript adapter (tsc + biome + vitest) | ✅ done (Plan A) |
| Python adapter (ruff + mypy + pytest) | ✅ done (Plan B) |
| Go adapter (golangci-lint + go build + gofmt + go test) | ✅ done (Plan B) |
| langAdapterValidator (language-aware dispatch) | ✅ done (Plan B) |
| Router with RouteResult (contextBudget + allowedValidators) | ✅ done (Plan D) |
| Mention-path context pre-filter | ✅ done (Plan D) |
| Validator short-circuit by task kind | ✅ done (Plan D) |
| Decision-log v2 events (run.started, node.enqueued, agent.llm.response) | ✅ done (Plan C) |
| Gap metrics (parallelism, retry rate, cache-hit ratio, validator share) | ✅ done (Plan C) |
| `amase-bench trace` CLI command | ✅ done (Plan C) |
| Hard bench fixtures (fix-cascading-type-errors, split-god-module) | ✅ done (Plan C) |
| `adapter: LangAdapter \| null` in RouteResult | ✅ done (Plan E) |
| Active Memory Injector | ✅ done (Plan E) |
| Forward Risk Analyser | ✅ done (Plan F) |
| Rust, Java, C#, Next.js LangAdapters + Next.js workspace detection | ✅ done (Plan G) |
| C++, PHP, Ruby, Swift, Kotlin, Dart, Scala, Shell, HTML/CSS, SQL, R, Lua LangAdapters | 🔲 todo (Plan H+) |
| Structured delta output format (quality.json) | ✅ done (Plan F) |

## 6. Language Adapter Layer

### Interface

```ts
interface LangAdapter {
  readonly language: string       // e.g. "python", "go", "csharp"
  readonly extensions: string[]   // e.g. [".py"]

  lint(files: string[], workspace: string): Promise<ValidationResult>
  typecheck(files: string[], workspace: string): Promise<ValidationResult>
  format(files: string[], workspace: string): Promise<ValidationResult>
  test(files: string[], workspace: string): Promise<ValidationResult>
}
```

### Language → Tool Mapping

| Language | Lint | Typecheck | Format | Test | Status |
|---|---|---|---|---|---|
| TypeScript/JS | biome | tsc | biome | vitest | ✅ done |
| Python | ruff | mypy | ruff | pytest | ✅ done |
| Go | golangci-lint | go build | gofmt | go test | ✅ done |
| Rust | clippy | rustc | rustfmt | cargo test | 🔲 |
| Java | checkstyle | javac | google-java-format | junit | 🔲 |
| C# | roslyn analyzers | dotnet build | dotnet format | dotnet test | 🔲 |
| C/C++ | clang-tidy | clang | clang-format | ctest | 🔲 |
| PHP | phpstan | — | php-cs-fixer | phpunit | 🔲 |
| Ruby | rubocop | sorbet (optional) | rubocop | rspec | 🔲 |
| Swift | swiftlint | swiftc | swiftformat | xctest | 🔲 |
| Kotlin | detekt | kotlinc | ktlint | junit | 🔲 |
| Dart | dart analyze | dart analyze | dart format | dart test | 🔲 |
| Scala | scalafmt | scalac | scalafmt | sbt test | 🔲 |
| Shell | shellcheck | — | shfmt | bats | 🔲 |
| HTML/CSS | stylelint | — | prettier | — | 🔲 |
| SQL | sqlfluff | — | sqlfluff | — | 🔲 |
| R | lintr | — | styler | testthat | 🔲 |
| Lua | luacheck | — | stylua | busted | 🔲 |

### Registry

```ts
const adapterRegistry = new Map<string, LangAdapter>()
// populated at startup, keyed by language name and each extension
```

Language Detector reads file extensions in the workspace → returns `LangAdapter[]`. If no adapter found, proceeds with schema + patch-safety only.

## 7. Active Memory Injector

**Status: ✅ done (Plan E) — MemoryInjector wired into orchestrator; 200ms timeout race; fire-and-forget indexing**

Runs at context assembly time, before any LLM call.

**Query:** current task goal + affected file paths → embedding → LanceDB similarity search.

**Output:**

```ts
interface MemoryInjection {
  priorPatterns: Array<{
    summary: string      // ≤50 chars
    outcome: "fixed" | "regressed" | "optimised"
    confidence: number   // cosine similarity, 0–1
  }>
}
```

**Hard limits:**
- Max 3 prior patterns per call
- Max 150 tokens total
- Minimum confidence 0.75 — below threshold is dropped, not included

**Write path:** after each completed task, a background indexer embeds the outcome summary into LanceDB. No new storage — reuses existing LanceDB + DecisionLog.

**Why active over passive:** zero extra LLM round-trips, zero agent reasoning overhead. Relevant patterns arrive pre-filtered — agent skips reasoning it would otherwise spend tokens on.

## 8. Enhanced Task Router

**Status: ✅ done (Plans D + E) — contextBudget + allowedValidators + adapter all wired.**

`RouteResult`:

```ts
interface RouteResult {
  agent: AgentKind | "skip"
  adapter: LangAdapter | null         // null = no adapter registered
  allowedValidators: ValidatorName[]
  contextBudget: number
}
```

## 9. Quality Gate — Forward Risk Analyser

**Status: ✅ done (Plan F) — three-pass analysis (heuristic + AST caller-walk + adapter test run); HIGH triggers one retry**

Final stage of the validator chain, runs after all existing validators pass.

### Regression Scan

1. ASTIndex dependency graph: find all symbols touched by patches.
2. Walk one level up: identify callers of changed symbols.
3. Run targeted regression tests against callers only (not full suite).
4. Emit `regressionRisk: LOW | MEDIUM | HIGH`.
5. HIGH → blocks output, triggers targeted retry with risk injected into `context.diff`.

### Forward Risk Scan

Pure AST + static analysis, no LLM:

- Public API shape changes (added/removed/renamed exports)
- Schema changes (Zod, DB migrations, OpenAPI)
- Performance-sensitive paths (heuristics: `*/middleware/*`, `*/hot-path/*`, AST annotations)

Each finding tagged and included in delta output.

## 10. Delta Output Format

**Status: ✅ done (Plan F) — quality.json written to workspace after each forward risk pass**

```yaml
patch:
  file: service.py
  change: replaced blocking call with async equivalent

tests_added:
  - test_concurrency
  - test_null_input

quality:
  coverage: 84%
  static_analysis: passed
  regression_risk: LOW
  forward_risks: []

memory_patterns_used: 1
tokens_used: 812
```

`tokens_used` is emitted per task and fed into the bench metrics loop.

## 11. Benchmarking Loop

- Baseline: stored bench results from Claude Code / Superpowers (do not re-run baseline).
- Run AMASE against existing bench fixtures continuously.
- Track per-run: tokens used, wall-clock time, one-shot success, coverage, static analysis, regression detection rate.
- Ship when all six success metrics in Section 2 are beaten simultaneously.
- Bench infra: `amase-bench trace`, gap metrics, decision-log v2, hard fixtures all in place. ✅

## 12. Roadmap

| Plan | Goal | Status |
|---|---|---|
| A | LangAdapter foundation (interface, registry, TS adapter) | ✅ merged |
| B | Python + Go adapters, langAdapterValidator | ✅ merged |
| C | Observability: decision-log v2, trace CLI, gap metrics, hard fixtures | ✅ merged |
| D | Router: RouteResult, contextBudget, allowedValidators, mention-path filter | ✅ merged |
| E | Active Memory Injector + `adapter` field in RouteResult | ✅ merged |
| F | Forward Risk Analyser + structured delta output | ✅ merged |
| G | Rust, Java, C#, Next.js LangAdapters + Next.js workspace detection | ✅ merged |
| H | Remaining 12 LangAdapters (C++, PHP, Ruby, Swift, Kotlin, Dart, Scala, Shell, HTML/CSS, SQL, R, Lua) | 🔲 |

## 13. Enforcement Rules (Hard Constraints)

The system must not:

- Return untested code
- Return failing tests
- Introduce breaking changes without flagging in `forward_risks`
- Bypass static analysis
- Return full files instead of patches
- Make an LLM call without a Zod-validated input and scoped context envelope
- Include tool descriptions for validators not in `allowedValidators`

## 14. Definition of Senior-Level Code

Code must be:

- Modular and composable
- Low coupling, high cohesion
- Testable with clear boundaries
- Performance-aware
- Explicitly handling errors and edge cases

Enforced via static analysis rules, complexity thresholds, dependency graph checks, and mandatory test validation — not by LLM judgement.
