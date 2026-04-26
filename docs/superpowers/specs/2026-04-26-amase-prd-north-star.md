# AMASE North Star PRD — Deterministic MCP Layer for High-Performance AI Coding

**Date:** 2026-04-26
**Status:** Approved — active north star
**Supersedes:** nothing (supplements v1/v2 design docs as the goal state)

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

Each language is supported via a **LangAdapter** (see Section 6). TypeScript is the reference implementation (already exists via tsc + biome + vitest). Languages without a registered adapter degrade gracefully to schema + patch-safety validators only.

## 5. Architecture

### High-Level Flow

```
Request
  ↓
Language Detector        — deterministic, extension + shebang check
  ↓
Task Router              — pure function, selects agent + LangAdapter + context budget
  ↓
Active Memory Injector   — pre-fetches ≤3 prior patterns from LanceDB (≤150 tokens)
  ↓
Context Assembler        — file slices + schemas + memory, capped at contextBudget
  ↓
Agent (LLM)              — plans only, emits patches
  ↓
Validator Chain          — delegates to LangAdapter: lint → typecheck → test → format
  ↓
Forward Risk Analyser    — dependency graph scan, regression check, API/schema change detection
  ↓
Delta Generator          — structured patch + quality metadata output
```

### What Exists vs What's New

| Component | Status |
|---|---|
| MCP Server (plan/execute/status/artifacts) | Exists — keep |
| Orchestrator / DAG Scheduler | Exists — keep |
| Validator Chain (schema → patch-safety → tsc → biome → vitest) | Exists — extend |
| Memory (ASTIndex, LanceDB, DecisionLog) | Exists — extend write path |
| Router (kind → agent) | Exists — enhance with language awareness |
| Language Detector | New |
| LangAdapter interface + Registry | New |
| 19 additional LangAdapters (TS already done) | New |
| Active Memory Injector | New |
| Forward Risk Analyser | New |
| Context budget enforcement | New |

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

Each method spawns the appropriate CLI tool and maps output to the existing `ValidationResult` contract. No new validator chain logic required.

### Language → Tool Mapping (reference)

| Language | Lint | Typecheck | Format | Test |
|---|---|---|---|---|
| TypeScript/JS | biome | tsc | biome | vitest |
| Python | ruff | mypy | ruff | pytest |
| Go | golangci-lint | go build | gofmt | go test |
| Rust | clippy | rustc | rustfmt | cargo test |
| Java | checkstyle | javac | google-java-format | junit |
| C# | roslyn analyzers | dotnet build | dotnet format | dotnet test |
| C/C++ | clang-tidy | clang | clang-format | ctest |
| PHP | phpstan | — | php-cs-fixer | phpunit |
| Ruby | rubocop | sorbet (optional) | rubocop | rspec |
| Swift | swiftlint | swiftc | swiftformat | xctest |
| Kotlin | detekt | kotlinc | ktlint | junit |
| Dart | dart analyze | dart analyze | dart format | dart test |
| Scala | scalafmt | scalac | scalafmt | sbt test |
| Shell | shellcheck | — | shfmt | bats |
| HTML/CSS | stylelint | — | prettier | — |
| SQL | sqlfluff | — | sqlfluff | — |
| R | lintr | — | styler | testthat |
| Lua | luacheck | — | stylua | busted |

### Registry

```ts
const adapterRegistry = new Map<string, LangAdapter>()
// populated at startup, keyed by language name and each extension
```

Language Detector reads file extensions in the workspace → returns `LangAdapter[]`. If no adapter found, proceeds with schema + patch-safety only.

## 7. Active Memory Injector

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

Extends the existing pure-function router with language and budget awareness.

```ts
interface RouteResult {
  agent: AgentKind
  adapter: LangAdapter | null         // null = no adapter registered
  allowedValidators: ValidatorKind[]  // only validators relevant to this task
  contextBudget: number               // max tokens for context envelope
}
```

- `allowedValidators` is the intersection of task kind and adapter capabilities. Irrelevant validator tool descriptions never reach the agent prompt.
- `contextBudget` is passed to the context assembler, which fills file slices + schemas + memory injection up to the cap and stops.
- Language detection is deterministic (extension + optional shebang/magic-byte). Zero tokens spent on routing.

## 9. Quality Gate — Forward Risk Analyser

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

## 12. Enforcement Rules (Hard Constraints)

The system must not:

- Return untested code
- Return failing tests
- Introduce breaking changes without flagging in `forward_risks`
- Bypass static analysis
- Return full files instead of patches
- Make an LLM call without a Zod-validated input and scoped context envelope
- Include tool descriptions for validators not in `allowedValidators`

## 13. Definition of Senior-Level Code

Code must be:

- Modular and composable
- Low coupling, high cohesion
- Testable with clear boundaries
- Performance-aware
- Explicitly handling errors and edge cases

Enforced via static analysis rules, complexity thresholds, dependency graph checks, and mandatory test validation — not by LLM judgement.
