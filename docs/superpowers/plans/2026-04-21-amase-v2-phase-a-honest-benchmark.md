# AMASE v2 — Phase A: Honest Benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AMASE vs superpowers benchmark a trustworthy, reproducible, CI-enforced evidence system that proves (or refutes) the "≥30% faster, ≤70% tokens" claim on a balanced 13-task suite.

**Architecture:** Evolve the existing `@amase/bench` package: upgrade the pass gate to require typecheck + fixture tests (already runs vitest; add typecheck), extend the result schema with variance + model + cached-token + run-sequence fields, add a headline reporter that averages N=3 runs and reports stdev, add same-model fairness forcing on both adapters, cull redundant micro fixtures, author 5 medium + 3 large fixtures, and gate a GitHub Actions workflow on a green headline.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Zod, Anthropic SDK, Claude Code CLI (for superpowers adapter), GitHub Actions.

**Scope:** Phase A only. Phase C (observability) and Phase B (hardening) are out of scope and will have their own plans after Phase A ships.

**Source spec:** [`docs/superpowers/specs/2026-04-21-amase-v2-production-design.md`](../specs/2026-04-21-amase-v2-production-design.md) (section "Phase A — Honest Benchmark").

---

## File Structure

**Modify:**
- `packages/bench/src/types.ts` — extend `BenchResult` schema with `tokensCached`, `validatorFailures`, `model`, `runSeq`, and add a new `HeadlineReport` schema.
- `packages/bench/src/fixtures.ts` — load new `meta.yaml` (category + language); keep back-compat loader for existing fixtures until migrated.
- `packages/bench/src/runner.ts` — loop N=3 per (task, stack); accept `model` + `fairness` flags; record `runSeq`.
- `packages/bench/src/reporter.ts` — rewrite: average N runs per task, compute stdev, compute wall-time delta and token delta with 95% confidence intervals (Welch's t-test), emit structured `HeadlineReport`.
- `packages/bench/src/adapters/amase.ts` — accept `model` option; force-override LLM client model; capture `tokensCached` from decision log.
- `packages/bench/src/adapters/superpowers.ts` — accept `model` option; pass `--model <id>` to `claude` CLI; capture `cache_read_input_tokens` alongside `input_tokens`.
- `packages/bench/src/cli.ts` — add `--model=`, `--fairness=primary|secondary|both`, `--samples=N`, `--tasks=<ids>` flags.
- `packages/bench/fixtures/*/` — existing micro fixtures: cull to 5, add `meta.yaml` to each retained fixture.

**Create:**
- `packages/bench/src/stats.ts` — mean/stdev/Welch's t-test helpers.
- `packages/bench/src/typecheck-gate.ts` — typecheck step executed before `runFixtureTests`.
- `packages/bench/fixtures/<8 new fixtures>/` — 5 medium + 3 large fixtures, each with `prompt.md`, `before/`, `expected.patch`, `tests/`, `meta.yaml`.
- `packages/bench/tests/stats.test.ts` — unit tests for stats.
- `packages/bench/tests/reporter.test.ts` — unit tests for headline reporter.
- `packages/bench/tests/runner-sampling.test.ts` — runner N=3 looping.
- `packages/bench/tests/fixture-meta.test.ts` — fixture meta schema + coverage (exactly 5 micro, 5 medium, 3 large).
- `.github/workflows/bench.yml` — CI workflow running the bench on every PR.
- `docs/bench/README.md` — how to run bench locally, what the headline means.

**Delete:**
- Three redundant micro fixtures (see Task 3) — `rename-symbol`, `extract-constant` (keep `refactor-function` as representative; verify in Task 3).

---

## Conventions for every task

- **TDD:** every code change starts with a failing test. Run the test, see red, implement, see green, commit.
- **Commits:** each task ends in one commit. Use the style in `git log --oneline -5`: `feat(bench): …`, `test(bench): …`, `fix(bench): …`, `chore(bench): …`.
- **Workspace commands:** all pnpm commands run from repo root unless stated otherwise. Use `pnpm --filter @amase/bench <script>` for package-scoped work.
- **`pnpm build`** must pass after every task (TS workspace refs). Run it as the last verification step.
- **No shortcuts:** do not bypass pre-commit hooks. If `pnpm lint` or `pnpm test` fails, fix it.

---

## Task 1: Add stats helpers (mean, stdev, Welch's t-test)

**Why this first:** Every downstream reporter change depends on these. Write them in isolation with TDD; they are pure functions with small surfaces.

**Files:**
- Create: `packages/bench/src/stats.ts`
- Create: `packages/bench/tests/stats.test.ts`

- [ ] **Step 1: Write failing test for `mean`, `stdev`, `welchT`.**

Create `packages/bench/tests/stats.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mean, stdev, welchT, welchPValueTwoSided, welchCI95 } from "../src/stats.js";

describe("stats", () => {
  it("mean of [1,2,3,4,5] is 3", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it("mean of empty throws", () => {
    expect(() => mean([])).toThrow();
  });
  it("stdev of [2,4,4,4,5,5,7,9] is ~2 (sample stdev)", () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 4);
  });
  it("stdev of single value throws (needs n>=2)", () => {
    expect(() => stdev([5])).toThrow();
  });
  it("welchT for identical samples is 0", () => {
    expect(welchT([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it("welchT for [10,11,12] vs [1,2,3] is clearly positive and large", () => {
    expect(welchT([10, 11, 12], [1, 2, 3])).toBeGreaterThan(5);
  });
  it("welchPValueTwoSided for identical samples ~1", () => {
    expect(welchPValueTwoSided([1, 2, 3], [1, 2, 3])).toBeGreaterThan(0.9);
  });
  it("welchPValueTwoSided for widely separated samples < 0.05", () => {
    expect(
      welchPValueTwoSided([100, 101, 102, 103], [1, 2, 3, 4]),
    ).toBeLessThan(0.05);
  });
  it("welchCI95 returns [lo, hi] with lo<=mean diff<=hi", () => {
    const a = [10, 11, 12, 13];
    const b = [1, 2, 3, 4];
    const [lo, hi] = welchCI95(a, b);
    const diff = mean(a) - mean(b);
    expect(lo).toBeLessThanOrEqual(diff);
    expect(hi).toBeGreaterThanOrEqual(diff);
  });
});
```

- [ ] **Step 2: Run test to verify fail.**

Run: `pnpm --filter @amase/bench test -- stats.test.ts`
Expected: fail with `Cannot find module '../src/stats.js'`.

- [ ] **Step 3: Implement `stats.ts`.**

Create `packages/bench/src/stats.ts`:

```typescript
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean() requires at least one value");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) throw new Error("stdev() requires at least 2 values");
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (xs.length - 1));
}

function variance(xs: readonly number[]): number {
  const s = stdev(xs);
  return s * s;
}

export function welchT(a: readonly number[], b: readonly number[]): number {
  if (a.length < 2 || b.length < 2)
    throw new Error("welchT requires n>=2 per sample");
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  if (se === 0) return 0;
  return (ma - mb) / se;
}

function welchDf(a: readonly number[], b: readonly number[]): number {
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const num = (va / na + vb / nb) ** 2;
  const den = va ** 2 / (na ** 2 * (na - 1)) + vb ** 2 / (nb ** 2 * (nb - 1));
  if (den === 0) return Math.max(na, nb) - 1;
  return num / den;
}

// Regularized incomplete beta function via continued fraction (Lentz) — used for
// t-distribution tails. Accuracy is sufficient (~1e-8) for our p-value ranges.
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
  }
  return h;
}

function lnGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function regIncBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) -
      lnGamma(a) -
      lnGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function studentTCdfTwoSidedTail(t: number, df: number): number {
  // p-value = P(|T| >= |t|) under H0, Student's t with df degrees of freedom
  const x = df / (df + t * t);
  return regIncBeta(df / 2, 0.5, x);
}

export function welchPValueTwoSided(
  a: readonly number[],
  b: readonly number[],
): number {
  const t = welchT(a, b);
  const df = welchDf(a, b);
  return studentTCdfTwoSidedTail(Math.abs(t), df);
}

// 95% CI on the difference of means (a - b), two-sided.
export function welchCI95(
  a: readonly number[],
  b: readonly number[],
): [number, number] {
  const ma = mean(a);
  const mb = mean(b);
  const diff = ma - mb;
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  // Use t-critical at df via Newton on the two-sided CDF. For small df this
  // matters; for df >= 30 it's ~1.96. Our headline uses N=3, so df ~ 2..4.
  const df = welchDf(a, b);
  const tCrit = tCriticalTwoSided95(df);
  return [diff - tCrit * se, diff + tCrit * se];
}

// Invert the two-sided t-distribution at alpha=0.05 using bisection.
function tCriticalTwoSided95(df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const p = studentTCdfTwoSidedTail(mid, df);
    if (p > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
```

- [ ] **Step 4: Run test to verify pass.**

Run: `pnpm --filter @amase/bench test -- stats.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit.**

```bash
git add packages/bench/src/stats.ts packages/bench/tests/stats.test.ts
git commit -m "feat(bench): add mean/stdev/Welch's t-test stats helpers"
```

---

## Task 2: Extend `BenchResult` schema with variance + model + cached-tokens + runSeq

**Files:**
- Modify: `packages/bench/src/types.ts`
- Create: `packages/bench/tests/types.test.ts`

- [ ] **Step 1: Write failing test.**

Create `packages/bench/tests/types.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { BenchResultSchema, HeadlineReportSchema } from "../src/types.js";

describe("BenchResult schema", () => {
  it("accepts extended fields", () => {
    const row = {
      runId: "r1",
      timestamp: "2026-04-21T00:00:00.000Z",
      taskId: "t1",
      stack: "amase",
      model: "claude-sonnet-4-6",
      runSeq: 1,
      pass: true,
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 20,
      validatorFailures: 0,
      wallMs: 1000,
      diffSimilarity: 0.5,
      retries: 0,
    };
    expect(BenchResultSchema.parse(row)).toEqual(row);
  });

  it("rejects negative tokensCached", () => {
    expect(() =>
      BenchResultSchema.parse({
        runId: "r1",
        timestamp: "x",
        taskId: "t",
        stack: "amase",
        model: "m",
        runSeq: 1,
        pass: false,
        tokensIn: 0,
        tokensOut: 0,
        tokensCached: -1,
        validatorFailures: 0,
        wallMs: 0,
        diffSimilarity: 0,
        retries: 0,
      }),
    ).toThrow();
  });
});

describe("HeadlineReport schema", () => {
  it("accepts a well-formed report", () => {
    HeadlineReportSchema.parse({
      fairness: "primary",
      samplesPerCell: 3,
      tasks: 13,
      bothPassedAll: 13,
      wallMs: {
        amase: { mean: 1000, stdev: 50 },
        superpowers: { mean: 2000, stdev: 100 },
        delta: 0.5,
        ci95: [0.3, 0.7],
        pValue: 0.001,
      },
      tokens: {
        amase: { mean: 500, stdev: 10 },
        superpowers: { mean: 1000, stdev: 20 },
        delta: 0.5,
        ci95: [0.3, 0.7],
        pValue: 0.001,
      },
      passRate: { amase: 1, superpowers: 1 },
      verdict: "ok",
    });
  });
});
```

- [ ] **Step 2: Run test to verify fail.**

Run: `pnpm --filter @amase/bench test -- types.test.ts`
Expected: fail — missing fields / missing `HeadlineReportSchema` export.

- [ ] **Step 3: Replace `packages/bench/src/types.ts` with:**

```typescript
import { z } from "zod";

export const StackSchema = z.enum(["amase", "superpowers"]);
export type Stack = z.infer<typeof StackSchema>;

export const FairnessSchema = z.enum(["primary", "secondary"]);
export type Fairness = z.infer<typeof FairnessSchema>;

export const BenchResultSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  taskId: z.string(),
  stack: StackSchema,
  model: z.string(),
  runSeq: z.number().int().min(1),
  pass: z.boolean(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  tokensCached: z.number().int().nonnegative(),
  validatorFailures: z.number().int().nonnegative(),
  wallMs: z.number().int().nonnegative(),
  diffSimilarity: z.number().min(0).max(1),
  retries: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type BenchResult = z.infer<typeof BenchResultSchema>;

const SampleStatsSchema = z.object({
  mean: z.number(),
  stdev: z.number(),
});

const MetricComparisonSchema = z.object({
  amase: SampleStatsSchema,
  superpowers: SampleStatsSchema,
  delta: z.number(), // (superpowers - amase) / superpowers; positive = AMASE better
  ci95: z.tuple([z.number(), z.number()]), // CI on the delta
  pValue: z.number(),
});

export const HeadlineReportSchema = z.object({
  fairness: FairnessSchema,
  samplesPerCell: z.number().int().min(1),
  tasks: z.number().int().nonnegative(),
  bothPassedAll: z.number().int().nonnegative(),
  wallMs: MetricComparisonSchema,
  tokens: MetricComparisonSchema,
  passRate: z.object({
    amase: z.number().min(0).max(1),
    superpowers: z.number().min(0).max(1),
  }),
  verdict: z.enum(["ok", "insufficient_signal", "regression", "fail_targets"]),
  notes: z.array(z.string()).default([]),
});
export type HeadlineReport = z.infer<typeof HeadlineReportSchema>;

export interface RunOpts {
  runId: string;
  runSeq: number;
  model: string;
  fairness: Fairness;
  live?: boolean;
}
```

- [ ] **Step 4: Run test to verify pass.**

Run: `pnpm --filter @amase/bench test -- types.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Fix the compile errors that just appeared in runner/adapters/reporter.**

Adapters and runner currently pass `{ runId, live }` into `RunOpts` and return `BenchResult` without the new fields. For this task, add minimal shims so the build compiles; subsequent tasks replace each shim with real values.

Modify `packages/bench/src/adapters/amase.ts` — add to the returned object in `runAmase`:

```typescript
      model: opts.model,
      runSeq: opts.runSeq,
      tokensCached: 0,             // real value wired in Task 7
      validatorFailures: 0,        // real value wired in Task 7
```

Modify `packages/bench/src/adapters/superpowers.ts` — same additions to its returned object; `tokensCached` initially `0` (real value wired in Task 8).

Modify `packages/bench/src/runner.ts` — temporarily thread defaults:

```typescript
const model = "claude-sonnet-4-6";
const fairness: "primary" = "primary";
const opts = { runId, runSeq: 1, model, fairness, live: cfg.live };
```

(We will rewrite this function in Task 5.)

- [ ] **Step 6: Verify build.**

Run: `pnpm build`
Expected: all packages compile clean.

- [ ] **Step 7: Commit.**

```bash
git add packages/bench/src/types.ts packages/bench/src/runner.ts \
  packages/bench/src/adapters/amase.ts packages/bench/src/adapters/superpowers.ts \
  packages/bench/tests/types.test.ts
git commit -m "feat(bench): extend BenchResult + add HeadlineReport schema"
```

---

## Task 3: Cull redundant micro fixtures, add `meta.yaml`

**Why:** The spec calls for exactly 5 micro fixtures. Today there are 8, and `rename-symbol` / `extract-constant` / `refactor-function` all test the same path (rename-ish edits). Keep 5 representatives covering distinct shapes: a flag addition, a typed error, a zod schema, a bugfix (failing test), a null-handling edge case.

**Files:**
- Delete: `packages/bench/fixtures/rename-symbol/`
- Delete: `packages/bench/fixtures/extract-constant/`
- Delete: `packages/bench/fixtures/refactor-function/`
- Create: `packages/bench/fixtures/add-cli-flag/meta.yaml`
- Create: `packages/bench/fixtures/add-typed-error/meta.yaml`
- Create: `packages/bench/fixtures/add-zod-schema/meta.yaml`
- Create: `packages/bench/fixtures/fix-failing-vitest/meta.yaml`
- Create: `packages/bench/fixtures/handle-null-input/meta.yaml`
- Modify: `packages/bench/src/fixtures.ts` (load + expose `meta`)
- Create: `packages/bench/tests/fixture-meta.test.ts`

- [ ] **Step 1: Write failing test enforcing fixture counts + meta.**

Create `packages/bench/tests/fixture-meta.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

describe("fixture meta & coverage", () => {
  it("has exactly 5 micro + 5 medium + 3 large fixtures", async () => {
    const ids = await listFixtures();
    const metas = await Promise.all(
      ids.map(async (id) => (await loadFixture(id)).meta),
    );
    const counts = { micro: 0, medium: 0, large: 0 };
    for (const m of metas) counts[m.category] += 1;
    expect(counts).toEqual({ micro: 5, medium: 5, large: 3 });
  });

  it("every fixture declares a supported language", async () => {
    const supported = new Set([
      "ts", "js", "py", "go", "rust", "java", "csharp",
      "cpp", "c", "ruby", "php", "swift", "kotlin",
    ]);
    for (const id of await listFixtures()) {
      const fx = await loadFixture(id);
      expect(supported.has(fx.meta.language)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test — expect failure** (`.meta` does not exist on `Fixture`).

Run: `pnpm --filter @amase/bench test -- fixture-meta.test.ts`

- [ ] **Step 3: Delete the three redundant micro fixtures.**

```bash
rm -rf packages/bench/fixtures/rename-symbol
rm -rf packages/bench/fixtures/extract-constant
rm -rf packages/bench/fixtures/refactor-function
```

- [ ] **Step 4: Add `meta.yaml` to each retained micro fixture.**

Create `packages/bench/fixtures/add-cli-flag/meta.yaml`:

```yaml
category: micro
language: ts
summary: Add a --dry-run flag to the CLI.
```

Create `packages/bench/fixtures/add-typed-error/meta.yaml`:

```yaml
category: micro
language: ts
summary: Replace a string throw with a typed Error subclass.
```

Create `packages/bench/fixtures/add-zod-schema/meta.yaml`:

```yaml
category: micro
language: ts
summary: Add a zod schema for an existing interface and use it to parse input.
```

Create `packages/bench/fixtures/fix-failing-vitest/meta.yaml`:

```yaml
category: micro
language: ts
summary: Locate and fix the bug that causes the shipped vitest to fail.
```

Create `packages/bench/fixtures/handle-null-input/meta.yaml`:

```yaml
category: micro
language: ts
summary: Guard a function against null/undefined input without changing callers.
```

- [ ] **Step 5: Update `Fixture` loader to include `meta`.**

Replace `packages/bench/src/fixtures.ts` with:

```typescript
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

export const FixtureCategorySchema = z.enum(["micro", "medium", "large"]);
export type FixtureCategory = z.infer<typeof FixtureCategorySchema>;

export const FixtureLanguageSchema = z.enum([
  "ts", "js", "py", "go", "rust", "java", "csharp",
  "cpp", "c", "ruby", "php", "swift", "kotlin",
]);
export type FixtureLanguage = z.infer<typeof FixtureLanguageSchema>;

export const FixtureMetaSchema = z.object({
  category: FixtureCategorySchema,
  language: FixtureLanguageSchema,
  summary: z.string().min(1),
});
export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;

export interface Fixture {
  id: string;
  prompt: string;
  meta: FixtureMeta;
  beforeTree: Map<string, string>;
  expectedPatch: string;
  testsDir: string;
}

export async function listFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function readTree(
  root: string,
  acc = new Map<string, string>(),
  rel = "",
): Promise<Map<string, string>> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await readTree(root, acc, relPath);
    else acc.set(relPath, await readFile(join(root, relPath), "utf8"));
  }
  return acc;
}

export async function loadFixture(id: string): Promise<Fixture> {
  const dir = join(FIXTURES_DIR, id);
  await stat(dir);
  const prompt = await readFile(join(dir, "prompt.md"), "utf8");
  const metaRaw = await readFile(join(dir, "meta.yaml"), "utf8");
  const meta = FixtureMetaSchema.parse(parseYaml(metaRaw));
  const beforeTree = await readTree(join(dir, "before"));
  const expectedPatch = await readFile(join(dir, "expected.patch"), "utf8");
  return {
    id,
    prompt,
    meta,
    beforeTree,
    expectedPatch,
    testsDir: join(dir, "tests"),
  };
}
```

- [ ] **Step 6: Add `yaml` dependency.**

Run: `pnpm --filter @amase/bench add yaml`
Expected: `yaml` added to `packages/bench/package.json` dependencies.

- [ ] **Step 7: Run test — micro count will still be wrong (5 micro exist, but 0 medium + 0 large).**

Run: `pnpm --filter @amase/bench test -- fixture-meta.test.ts`
Expected: fail on count assertion `{micro:5, medium:0, large:0}` ≠ `{5,5,3}`. **This failure is expected until Task 4.** Mark the `.skip` line so CI stays green until then: change the `counts` test to `it.skip("has exactly 5 micro + 5 medium + 3 large fixtures", …)` with a TODO comment `TODO(Task 4): un-skip when medium+large fixtures land.`

- [ ] **Step 8: Run the language-support test alone to verify the loader works.**

Run: `pnpm --filter @amase/bench test -- fixture-meta.test.ts -t "supported language"`
Expected: pass (all 5 retained micros have `language: ts`).

- [ ] **Step 9: Verify build.**

Run: `pnpm build`
Expected: clean.

- [ ] **Step 10: Commit.**

```bash
git add -A packages/bench
git commit -m "feat(bench): cull redundant micros, add meta.yaml + category/language loader"
```

---

## Task 4: Author 5 medium + 3 large fixtures

**Why:** Phase A's thesis — AMASE earns its complexity on non-trivial work — cannot be tested on micros alone.

Each fixture follows the same structure as the existing ones:
- `prompt.md` — the task prompt (same prompt both stacks receive).
- `before/` — the initial workspace, must include a minimal `package.json` so vitest can run inside it.
- `expected.patch` — reference patch (reported only; not a gate).
- `tests/` — behavioral tests that must pass.
- `meta.yaml` — category + language + summary.

**Fixture list (author each in one sub-commit; use one task-level commit if preferred):**

| ID | Category | What |
|---|---|---|
| `add-http-endpoint` | medium | Add `GET /health` to an existing minimal express-style router with a supertest-style test verifying status 200 and `{ok: true}` body. |
| `add-validated-endpoint-with-zod` | medium | Add `POST /items` that parses body with a zod schema, persists to an in-memory store, returns 201. Invalid body returns 400. |
| `migrate-component-prop-shape` | medium | A component consumes `{title, body}`; migrate to `{heading, content}` across caller + component + snapshot test. |
| `add-cli-subcommand` | medium | Existing CLI has `greet <name>`; add `farewell <name>` sharing the same arg parser. Tests verify both commands' stdout. |
| `rename-package-export` | medium | Rename an export from `runAll` to `runQueue` across package, re-exporter, and 2 consumers; tests import by new name. |
| `build-rate-limiter-middleware` | large | Implement a token-bucket rate limiter middleware with configurable `{limit, windowMs}`; tests cover allow, deny, refill, and concurrent usage. |
| `add-pagination-to-list-endpoint` | large | Extend `/items` list endpoint with `?page=&pageSize=` query support, bounded pageSize, stable ordering, and meta fields in response. Tests cover 4 cases. |
| `add-new-validator-to-pipeline` | large | In a small validator-pipeline project, add a `no-any` validator that rejects patches containing `any` type. Wire into registry + run order. Tests cover accept + reject paths. |

**Files (create 8 directories × ~5 files each):**

- [ ] **Step 1: For each fixture above, create the directory with the four required files + `meta.yaml`.**

Use this as the template for each fixture. For `add-http-endpoint`:

`packages/bench/fixtures/add-http-endpoint/meta.yaml`:

```yaml
category: medium
language: ts
summary: Add a GET /health endpoint to the existing router, returning status 200 with {ok:true}.
```

`packages/bench/fixtures/add-http-endpoint/prompt.md`:

```markdown
Add a `GET /health` endpoint to `src/router.ts`. It must respond with HTTP 200
and a JSON body `{"ok": true}`. Do not regress any existing routes.
The tests under `tests/` will execute the router and check the response.
```

`packages/bench/fixtures/add-http-endpoint/before/package.json`:

```json
{
  "name": "fixture-add-http-endpoint",
  "type": "module",
  "private": true,
  "devDependencies": { "vitest": "*" }
}
```

`packages/bench/fixtures/add-http-endpoint/before/src/router.ts`:

```typescript
export type Handler = (req: { method: string; path: string }) => {
  status: number;
  body: unknown;
};

const routes: Array<{ method: string; path: string; handler: Handler }> = [
  {
    method: "GET",
    path: "/ping",
    handler: () => ({ status: 200, body: "pong" }),
  },
];

export function handle(req: { method: string; path: string }) {
  const r = routes.find((x) => x.method === req.method && x.path === req.path);
  if (!r) return { status: 404, body: "not found" };
  return r.handler(req);
}
```

`packages/bench/fixtures/add-http-endpoint/tests/health.test.ts`:

```typescript
import { expect, test } from "vitest";
import { handle } from "../src/router.js";

test("GET /health returns 200 {ok:true}", () => {
  const res = handle({ method: "GET", path: "/health" });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test("GET /ping still works", () => {
  const res = handle({ method: "GET", path: "/ping" });
  expect(res.status).toBe(200);
  expect(res.body).toBe("pong");
});
```

`packages/bench/fixtures/add-http-endpoint/expected.patch`:

```diff
--- a/src/router.ts
+++ b/src/router.ts
@@
 const routes: Array<{ method: string; path: string; handler: Handler }> = [
   {
     method: "GET",
     path: "/ping",
     handler: () => ({ status: 200, body: "pong" }),
   },
+  {
+    method: "GET",
+    path: "/health",
+    handler: () => ({ status: 200, body: { ok: true } }),
+  },
 ];
```

For the remaining 7 fixtures, each follows the exact structure above (`meta.yaml`, `prompt.md`, `before/package.json`, `before/src/...`, `tests/*.test.ts`, `expected.patch`). Author each as a separate sub-commit. Per-fixture concrete contract:

**`add-validated-endpoint-with-zod`** (medium)
- `before/src/router.ts`: the router from `add-http-endpoint`, plus an in-memory `store: Item[] = []`.
- `before/src/item.ts`: exports `type Item = { id: string; name: string; qty: number }` (no zod import yet).
- `prompt.md`: "Add `POST /items` that parses the request body with a zod schema, assigns a UUID id, appends to the store, returns status 201 with the created item. Invalid bodies (missing `name` or non-number `qty`) return status 400."
- `tests/items.test.ts`: three tests — create valid item (expect 201 + body has id + name + qty); missing name (expect 400); negative qty (expect 400).
- `expected.patch`: adds a `zod` import, defines `CreateItemSchema`, registers the route.

**`migrate-component-prop-shape`** (medium)
- `before/src/card.ts`: `export function Card({ title, body }: { title: string; body: string }) { return \`\${title}: \${body}\`; }`
- `before/src/page.ts`: imports `Card`, calls it with `{ title: "Hi", body: "World" }`.
- `prompt.md`: "Rename the `Card` component's props from `{title, body}` to `{heading, content}`. Update all callers. Do not regress rendering behaviour."
- `tests/card.test.ts`: asserts `Card({heading:"Hi",content:"World"})` returns `"Hi: World"` and that `page.ts`'s exported `renderPage()` still returns that string.
- `expected.patch`: renames in `card.ts`, updates `page.ts`.

**`add-cli-subcommand`** (medium)
- `before/src/cli.ts`: a `run(argv: string[])` that handles `greet <name>` returning `"Hello, <name>!"` and returns `"unknown command"` otherwise.
- `prompt.md`: "Add a `farewell <name>` subcommand that returns `\"Goodbye, <name>!\"`. Share argument parsing with `greet` — do not duplicate."
- `tests/cli.test.ts`: `run(["greet","Ada"]) === "Hello, Ada!"`; `run(["farewell","Ada"]) === "Goodbye, Ada!"`; missing name returns an error string.
- `expected.patch`: refactors to a shared name-extractor, adds the `farewell` branch.

**`rename-package-export`** (medium)
- `before/src/queue.ts`: `export function runAll(jobs: (() => void)[]) { for (const j of jobs) j(); }`
- `before/src/index.ts`: `export { runAll } from "./queue.js";`
- `before/src/consumer-a.ts` and `before/src/consumer-b.ts`: both import `runAll` from `"./index.js"` and call it.
- `prompt.md`: "Rename the public export `runAll` to `runQueue` across the package. Update every caller. Keep behaviour identical."
- `tests/queue.test.ts`: imports `runQueue` from `../src/index.js`; asserts it executes jobs in order. Imports `consumerA()` and `consumerB()` and asserts they still run.
- `expected.patch`: rename in all four files.

**`build-rate-limiter-middleware`** (large)
- `before/src/router.ts`: the router shape from `add-http-endpoint`.
- `before/src/middleware.ts`: an empty `export function applyMiddleware(/* … */) {}` stub (no limiter yet).
- `prompt.md`: "Implement a token-bucket rate limiter middleware with options `{ limit: number; windowMs: number }`. It must allow the first `limit` requests within any rolling `windowMs`, reject further requests in that window with HTTP 429, and refill as time passes. Wire it into the router so `GET /ping` is rate-limited."
- `tests/rate-limiter.test.ts`: four cases — allow within limit; reject when exceeded; refill after window advance (use a mock clock); independent buckets per route key.
- `expected.patch`: a `TokenBucket` class + middleware wiring + `Date.now()` injection for testability.

**`add-pagination-to-list-endpoint`** (large)
- `before/src/router.ts`: plus a `GET /items` that returns the full `store` array as JSON.
- `before/src/store.ts`: exports a `store: Item[]` populated with 25 items at module load.
- `prompt.md`: "Extend `GET /items` with `?page=<n>&pageSize=<k>` query support. Defaults: `page=1`, `pageSize=10`. Cap `pageSize` at 50. Response shape: `{ items, page, pageSize, total }`. Ordering must be stable (by `id`)."
- `tests/items-list.test.ts`: four cases — default paging returns 10 items; `?page=2&pageSize=5` returns items 6–10; `pageSize=999` caps to 50; response includes `total: 25`.
- `expected.patch`: parses query, slices store, clamps `pageSize`, builds response.

**`add-new-validator-to-pipeline`** (large)
- `before/src/pipeline.ts`: a `Validator = (patch: Patch) => { ok: boolean; reason?: string }` interface plus a `runPipeline(validators, patch)` that short-circuits on first failure.
- `before/src/validators/schema.ts`: a trivial validator that checks `patch.path` is a string.
- `before/src/validators/registry.ts`: exports `defaultValidators = [schemaValidator]`.
- `prompt.md`: "Add a `noAnyValidator` that rejects any patch whose `content` field contains the substring `: any` or `as any`. Register it in the default pipeline so it runs after `schema`."
- `tests/pipeline.test.ts`: three cases — clean patch passes; patch containing `: any` fails with reason mentioning `no-any`; patch failing schema still fails before reaching `no-any`.
- `expected.patch`: new validator file + registry update.

**Note on language choice for fixtures:** All 8 new fixtures use `language: ts` to match the existing infra. Non-TS fixtures arrive in Phase B when multi-language validators land.

- [ ] **Step 2: Un-skip the count test from Task 3.**

Modify `packages/bench/tests/fixture-meta.test.ts`: remove the `.skip` and the TODO comment added in Task 3 Step 7.

- [ ] **Step 3: Run fixture-meta test.**

Run: `pnpm --filter @amase/bench test -- fixture-meta.test.ts`
Expected: both tests pass — counts are `{5,5,3}` and every fixture has a supported language.

- [ ] **Step 4: Smoke-run fixture tests stand-alone.**

Apply each fixture's `expected.patch` to its `before/` tree into a temp dir, then run vitest against it, to verify the reference patch does pass the test. For each fixture, run:

```bash
node scripts/smoke-apply-expected.mjs packages/bench/fixtures/<id>
```

If `scripts/smoke-apply-expected.mjs` does not exist, create it as a helper:

`scripts/smoke-apply-expected.mjs`:

```javascript
#!/usr/bin/env node
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fxDir = process.argv[2];
if (!fxDir) {
  console.error("usage: smoke-apply-expected.mjs <fixture-dir>");
  process.exit(2);
}
const work = mkdtempSync(join(tmpdir(), "amase-fx-"));
cpSync(join(fxDir, "before"), work, { recursive: true });
cpSync(join(fxDir, "tests"), join(work, "tests"), { recursive: true });
const patch = readFileSync(join(fxDir, "expected.patch"), "utf8");
writeFileSync(join(work, ".patch"), patch);
try {
  execSync("git init -q && git add -A && git commit -q -m base", { cwd: work });
  execSync("git apply --whitespace=nowarn .patch", { cwd: work });
} catch (e) {
  console.error("patch failed:", e.message);
  process.exit(1);
}
execSync(
  `pnpm exec vitest run --root "${work}" --config packages/bench/vitest.fixture.config.ts --reporter=dot`,
  { stdio: "inherit" },
);
console.log("ok:", fxDir);
```

Make it executable:

```bash
chmod +x scripts/smoke-apply-expected.mjs
```

Run for each of the 8 new fixtures; all must print `ok: ...`. Fix any fixture whose reference patch does not make tests green before committing. A fixture whose reference patch fails its own tests is a broken fixture.

- [ ] **Step 5: Verify build.**

Run: `pnpm build`
Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add -A packages/bench/fixtures scripts/smoke-apply-expected.mjs packages/bench/tests/fixture-meta.test.ts
git commit -m "feat(bench): add 5 medium + 3 large fixtures with reference patches"
```

---

## Task 5: Add typecheck step to the pass gate

**Why:** Spec A.1 requires `tsc --noEmit` + fixture tests. Today only vitest runs. A patch that compiles-away a type error gets "pass" today but shouldn't.

**Files:**
- Create: `packages/bench/src/typecheck-gate.ts`
- Modify: `packages/bench/src/adapters/amase.ts` (call typecheck before `runFixtureTests`)
- Modify: `packages/bench/src/adapters/superpowers.ts` (same)
- Create: `packages/bench/tests/typecheck-gate.test.ts`

- [ ] **Step 1: Write failing test for the typecheck gate.**

Create `packages/bench/tests/typecheck-gate.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTypecheck } from "../src/typecheck-gate.js";

function makeWs(files: Record<string, string>) {
  const d = mkdtempSync(join(tmpdir(), "tcgate-"));
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(d, rel), content);
  }
  return d;
}

describe("runTypecheck", () => {
  it("passes on a clean TS workspace", async () => {
    const ws = makeWs({
      "package.json": JSON.stringify({ name: "t", type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
        },
        include: ["**/*.ts"],
      }),
      "index.ts": "export const x: number = 1;\n",
    });
    const res = await runTypecheck(ws, "ts");
    expect(res.ok).toBe(true);
  });

  it("fails on a TS workspace with a type error", async () => {
    const ws = makeWs({
      "package.json": JSON.stringify({ name: "t", type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
        },
        include: ["**/*.ts"],
      }),
      "index.ts": 'export const x: number = "not a number";\n',
    });
    const res = await runTypecheck(ws, "ts");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not assignable|Type/);
  });
});
```

- [ ] **Step 2: Run test — fail (missing module).**

Run: `pnpm --filter @amase/bench test -- typecheck-gate.test.ts`

- [ ] **Step 3: Implement `typecheck-gate.ts`.**

Create `packages/bench/src/typecheck-gate.ts`:

```typescript
import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { FixtureLanguage } from "./fixtures.js";

const TYPECHECK_TIMEOUT_MS = 60_000;

export interface TypecheckResult {
  ok: boolean;
  error?: string;
}

async function run(
  cmd: string,
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    exec(
      cmd,
      { cwd, timeout: TYPECHECK_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (!err) return resolve({ code: 0, stdout, stderr, timedOut: false });
        const e = err as Error & { code?: number | string; killed?: boolean };
        const code =
          typeof e.code === "number" ? e.code : Number.isFinite(Number(e.code)) ? Number(e.code) : 1;
        resolve({ code, stdout, stderr, timedOut: e.killed === true });
      },
    );
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runTypecheck(
  workspace: string,
  language: FixtureLanguage,
): Promise<TypecheckResult> {
  // For Phase A, only ts/js fixtures exist. Non-TS languages return ok:true
  // (the language-specific typecheck arrives in Phase B).
  if (language !== "ts" && language !== "js") {
    return { ok: true };
  }
  // Prefer the fixture's own tsconfig; fall back to a minimal --noEmit if absent.
  const hasTsconfig = await exists(join(workspace, "tsconfig.json"));
  const cmd = hasTsconfig
    ? "pnpm exec tsc --noEmit -p tsconfig.json"
    : "pnpm exec tsc --noEmit --target ES2022 --module ES2022 --moduleResolution bundler --strict --allowImportingTsExtensions --skipLibCheck **/*.ts";
  const r = await run(cmd, workspace);
  if (r.code === 0) return { ok: true };
  const tail = (r.stderr || r.stdout).trim().slice(-700);
  return {
    ok: false,
    error: r.timedOut
      ? `typecheck-timeout-${TYPECHECK_TIMEOUT_MS}ms`
      : tail || `typecheck-exit-${r.code}`,
  };
}
```

- [ ] **Step 4: Run test — pass.**

Run: `pnpm --filter @amase/bench test -- typecheck-gate.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Wire the gate into the amase adapter.**

Modify `packages/bench/src/adapters/amase.ts`. After `runFixtureTests` is called, hoist it inside a helper that runs typecheck first. Replace the block starting at "Execute fixture tests against the produced workspace":

```typescript
      // Pass gate = typecheck + fixture tests
      const tcResult = await runTypecheck(paths.workspace, fx.meta.language);
      if (!tcResult.ok) {
        pass = false;
        error = error ?? `typecheck: ${tcResult.error ?? "failed"}`;
      } else {
        const testResult = await runFixtureTests(paths.workspace);
        pass = testResult.pass;
        if (!pass && !error) error = testResult.error;
      }
```

Add at top of file:
```typescript
import { runTypecheck } from "../typecheck-gate.js";
```

- [ ] **Step 6: Wire the gate into the superpowers adapter.**

Modify `packages/bench/src/adapters/superpowers.ts`. Replace `const testResult = await runFixtureTests(workspace); pass = testResult.pass; if (!pass && !error) error = testResult.error;` with:

```typescript
    const tcResult = await runTypecheck(workspace, fx.meta.language);
    if (!tcResult.ok) {
      pass = false;
      error = error ?? `typecheck: ${tcResult.error ?? "failed"}`;
    } else {
      const testResult = await runFixtureTests(workspace);
      pass = testResult.pass;
      if (!pass && !error) error = testResult.error;
    }
```

Add the same import line.

- [ ] **Step 7: Verify build + all tests.**

Run: `pnpm build && pnpm --filter @amase/bench test`
Expected: clean build; all tests pass.

- [ ] **Step 8: Commit.**

```bash
git add packages/bench/src/typecheck-gate.ts packages/bench/src/adapters/amase.ts \
        packages/bench/src/adapters/superpowers.ts packages/bench/tests/typecheck-gate.test.ts
git commit -m "feat(bench): typecheck + fixture-test pass gate on both adapters"
```

---

## Task 6: Rewrite runner for N=3 sampling, model forcing, fairness modes

**Files:**
- Modify: `packages/bench/src/runner.ts`
- Create: `packages/bench/tests/runner-sampling.test.ts`

- [ ] **Step 1: Write failing test.**

Create `packages/bench/tests/runner-sampling.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import * as amaseMod from "../src/adapters/amase.js";
import * as spMod from "../src/adapters/superpowers.js";
import { runBench } from "../src/runner.js";
import type { BenchResult, RunOpts } from "../src/types.js";

function fakeResult(taskId: string, stack: "amase" | "superpowers", opts: RunOpts): BenchResult {
  return {
    runId: opts.runId,
    timestamp: "2026-04-21T00:00:00.000Z",
    taskId,
    stack,
    model: opts.model,
    runSeq: opts.runSeq,
    pass: true,
    tokensIn: 10,
    tokensOut: 5,
    tokensCached: 0,
    validatorFailures: 0,
    wallMs: 100,
    diffSimilarity: 0.5,
    retries: 0,
  };
}

describe("runBench sampling", () => {
  it("runs N=3 per (task, stack) when samples=3", async () => {
    const amaseSpy = vi
      .spyOn(amaseMod, "runAmase")
      .mockImplementation((fx, o) => Promise.resolve(fakeResult(fx.id, "amase", o)));
    const spSpy = vi
      .spyOn(spMod, "runSuperpowers")
      .mockImplementation((fx, o) => Promise.resolve(fakeResult(fx.id, "superpowers", o)));
    const results = await runBench({
      stacks: ["amase", "superpowers"],
      tasks: ["add-cli-flag"],
      samples: 3,
      model: "claude-sonnet-4-6",
      fairness: "primary",
      outDir: undefined,
    });
    expect(results).toHaveLength(6); // 1 task × 2 stacks × 3 samples
    expect(results.map((r) => r.runSeq).sort()).toEqual([1, 1, 2, 2, 3, 3]);
    expect(amaseSpy).toHaveBeenCalledTimes(3);
    expect(spSpy).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test — fail (runner signature doesn't accept `samples/model/fairness`).**

Run: `pnpm --filter @amase/bench test -- runner-sampling.test.ts`

- [ ] **Step 3: Rewrite `packages/bench/src/runner.ts`:**

```typescript
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runAmase } from "./adapters/amase.js";
import { runSuperpowers } from "./adapters/superpowers.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { BenchResult, Fairness, Stack } from "./types.js";

export interface RunConfig {
  stacks: Stack[];
  tasks?: string[];
  live?: boolean;
  outDir?: string;
  samples: number;
  model: string;
  fairness: Fairness;
}

export async function runBench(cfg: RunConfig): Promise<BenchResult[]> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = cfg.outDir ?? join(process.cwd(), "bench/results");
  if (cfg.outDir !== undefined) await mkdir(outDir, { recursive: true });
  const outFile = cfg.outDir !== undefined ? join(outDir, `${runId}.jsonl`) : null;

  const allIds = cfg.tasks ?? (await listFixtures());
  const results: BenchResult[] = [];

  for (const id of allIds) {
    const fx = await loadFixture(id);
    for (let seq = 1; seq <= cfg.samples; seq++) {
      const perStack = await Promise.all(
        cfg.stacks.map(async (stack) => {
          const opts = {
            runId,
            runSeq: seq,
            model: cfg.model,
            fairness: cfg.fairness,
            live: cfg.live,
          };
          return stack === "amase"
            ? await runAmase(fx, opts)
            : await runSuperpowers(fx, opts);
        }),
      );
      for (const result of perStack) {
        results.push(result);
        if (outFile) await appendFile(outFile, `${JSON.stringify(result)}\n`);
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Run test — pass.**

Run: `pnpm --filter @amase/bench test -- runner-sampling.test.ts`
Expected: pass.

- [ ] **Step 5: Verify full test suite + build.**

Run: `pnpm build && pnpm --filter @amase/bench test`
Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add packages/bench/src/runner.ts packages/bench/tests/runner-sampling.test.ts
git commit -m "feat(bench): N-sample runner with model + fairness knobs"
```

---

## Task 7: AMASE adapter — force model, capture cached + validator-failure metrics

**Files:**
- Modify: `packages/bench/src/adapters/amase.ts`
- Modify: `packages/llm/src/anthropic.ts` (add optional `model` constructor arg; fallback to existing default)
- Verify: decision log emits a `llm.call` event with `tokensCached` or equivalent — if not, extend `llm.ts` to surface cache tokens into the log.

- [ ] **Step 1: Inspect current `AnthropicClient` constructor.**

Run: `grep -n "class AnthropicClient" -A 30 packages/llm/src/anthropic.ts`

- [ ] **Step 2: Verify whether cache-read tokens are already logged.**

Run: `grep -rn "cache_read_input_tokens\|tokensCached\|cache_creation" packages/llm/src packages/core/src packages/memory/src`
Expected: note which files log tokens. If `tokensCached` is not emitted into the `llm.call` event, proceed to Step 3. If it is, skip to Step 5.

- [ ] **Step 3: Extend `AnthropicClient` to accept a `model` override and surface cache tokens.**

Open `packages/llm/src/anthropic.ts`. Adjust the constructor signature to:

```typescript
constructor(opts: { model?: string } = {}) {
  this.model = opts.model ?? process.env.AMASE_MODEL ?? "claude-sonnet-4-6";
  // ...existing init
}
```

In the call site that records usage, ensure cache tokens flow into the returned result. Anthropic's SDK returns `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`. Pass both up to the caller (as `tokensCached = cache_read_input_tokens`) so the bench can attribute them.

- [ ] **Step 4: Update the decision-log `llm.call` event shape (in `packages/core` wherever the event is emitted) to include `tokensCached` as an optional number.** (Search: `event: "llm.call"`.)

- [ ] **Step 5: In `packages/bench/src/adapters/amase.ts`:**

Replace the LLM construction line:

```typescript
    const llm: LlmClient = opts.live
      ? new AnthropicClient()
      : new StubLlmClient(buildStubResponder(workspace, fx.prompt, contextFiles));
```

with:

```typescript
    const llm: LlmClient = opts.live
      ? new AnthropicClient({ model: opts.model })
      : new StubLlmClient(buildStubResponder(workspace, fx.prompt, contextFiles));
```

In the decision-log aggregation loop, extend:

```typescript
let tokensCached = 0;
let validatorFailures = 0;
// ...
for (const entry of entries) {
  if (entry.event === "llm.call") {
    const data = entry.data as {
      tokensIn?: number; tokensOut?: number; tokensCached?: number;
    };
    tokensIn += data.tokensIn ?? 0;
    tokensOut += data.tokensOut ?? 0;
    tokensCached += data.tokensCached ?? 0;
  }
  if (entry.event === "node.retried") retries += 1;
  if (entry.event === "validator.failed") validatorFailures += 1;
}
```

In the returned object, replace the `tokensCached: 0` shim (from Task 2) with `tokensCached` and `validatorFailures: 0` shim with `validatorFailures`.

- [ ] **Step 6: Verify no `validator.failed` event exists yet in the decision log** (if not, the counter stays at 0, which is correct for Phase A — real attribution lands in Phase C). Run: `grep -rn 'validator.failed\|"validator.ran"' packages/core/src packages/validators/src` — if the event name is different (e.g., `validator.ran` with `outcome: "failed"`), adjust the filter:

```typescript
  if (entry.event === "validator.ran" || entry.event === "validator.failed") {
    const data = entry.data as { outcome?: string };
    if (data.outcome === "failed") validatorFailures += 1;
  }
```

- [ ] **Step 7: Run bench tests to ensure nothing regressed.**

Run: `pnpm --filter @amase/bench test`
Expected: all pass.

- [ ] **Step 8: Run a stub-mode bench smoke to sanity-check the new fields.**

Run: `pnpm --filter @amase/bench build && node packages/bench/dist/cli.js run --stacks=amase --samples=1 --model=claude-sonnet-4-6 --fairness=primary --tasks=add-cli-flag`
Expected: the last JSONL line in `bench/results/` contains `"tokensCached":` and `"model":"claude-sonnet-4-6"` and `"runSeq":1`.

- [ ] **Step 9: Commit.**

```bash
git add packages/llm/src/anthropic.ts packages/bench/src/adapters/amase.ts packages/core/src
git commit -m "feat(bench): force model + capture cached tokens & validator failures on amase adapter"
```

---

## Task 8: Superpowers adapter — force model, capture cache tokens

**Files:**
- Modify: `packages/bench/src/adapters/superpowers.ts`

- [ ] **Step 1: Confirm `claude` CLI supports a `--model` flag by running:**

```bash
claude --help 2>&1 | grep -iE "model"
```

Expected: a `--model <id>` option exists. If not, the fallback is to set `ANTHROPIC_MODEL` env var for the child process. Both paths are implemented below.

- [ ] **Step 2: Update the command construction and usage parsing.**

In `packages/bench/src/adapters/superpowers.ts`:

Replace the `const command = "claude --print …"` line with:

```typescript
    const modelFlag = `--model ${opts.model}`;
    const command =
      `claude --print ${modelFlag} --output-format=stream-json --verbose --permission-mode=bypassPermissions`;
```

And set the env:

```typescript
      const child = exec(
        command,
        {
          cwd: workspace,
          env: { ...process.env, ANTHROPIC_MODEL: opts.model },
          maxBuffer: 10 * 1024 * 1024,
        },
        // ...
```

Extend `extractUsage` to capture `cache_read_input_tokens`:

```typescript
function extractUsage(obj: unknown): { in: number; out: number; cached: number } {
  let i = 0;
  let o = 0;
  let c = 0;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const r = v as Record<string, unknown>;
    if (typeof r.input_tokens === "number" && typeof r.output_tokens === "number") {
      i += r.input_tokens;
      o += r.output_tokens;
      if (typeof r.cache_read_input_tokens === "number") c += r.cache_read_input_tokens;
    }
    for (const k of Object.keys(r)) visit(r[k]);
  };
  visit(obj);
  return { in: i, out: o, cached: c };
}
```

Add `let tokensCached = 0;` near `let tokensIn = 0;`, then accumulate `tokensCached += u.cached` in the stream-parse loop. In the returned object, replace the `tokensCached: 0` shim from Task 2 with `tokensCached`.

- [ ] **Step 3: Confirm `validatorFailures: 0` stays 0 for the superpowers stack** (it has no validator pipeline). That is correct per the spec — the column will show `0` for superpowers rows.

- [ ] **Step 4: Build + test.**

Run: `pnpm build && pnpm --filter @amase/bench test`
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add packages/bench/src/adapters/superpowers.ts
git commit -m "feat(bench): force model + capture cache tokens on superpowers adapter"
```

---

## Task 9: Rewrite reporter for headline report with confidence intervals

**Files:**
- Modify: `packages/bench/src/reporter.ts`
- Create: `packages/bench/tests/reporter.test.ts`

- [ ] **Step 1: Write failing test.**

Create `packages/bench/tests/reporter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { reportHeadline } from "../src/reporter.js";
import type { BenchResult } from "../src/types.js";

function row(overrides: Partial<BenchResult>): BenchResult {
  return {
    runId: "r1",
    timestamp: "2026-04-21T00:00:00.000Z",
    taskId: "t1",
    stack: "amase",
    model: "claude-sonnet-4-6",
    runSeq: 1,
    pass: true,
    tokensIn: 100,
    tokensOut: 50,
    tokensCached: 0,
    validatorFailures: 0,
    wallMs: 1000,
    diffSimilarity: 0,
    retries: 0,
    ...overrides,
  };
}

describe("reportHeadline", () => {
  it("returns verdict=ok and positive deltas when AMASE is faster + cheaper", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e", "f", "g"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, wallMs: 1000, tokensIn: 500, tokensOut: 200 }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, wallMs: 2000, tokensIn: 1200, tokensOut: 500 }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("ok");
    expect(h.wallMs.delta).toBeGreaterThan(0.4); // ~50% faster
    expect(h.tokens.delta).toBeGreaterThan(0.4);  // ~58% fewer tokens
  });

  it("returns regression when AMASE fails tasks", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, pass: false }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, pass: true }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("regression");
  });

  it("returns insufficient_signal when fewer than 5 tasks fully green", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("insufficient_signal");
  });

  it("returns fail_targets when deltas are below 30%", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e", "f", "g"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, wallMs: 900, tokensIn: 900, tokensOut: 400 }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, wallMs: 1000, tokensIn: 1000, tokensOut: 450 }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("fail_targets");
  });
});
```

- [ ] **Step 2: Run test — fail (current reporter has different signature).**

Run: `pnpm --filter @amase/bench test -- reporter.test.ts`

- [ ] **Step 3: Replace `packages/bench/src/reporter.ts`:**

```typescript
import { mean, stdev, welchCI95, welchPValueTwoSided } from "./stats.js";
import {
  type BenchResult,
  type Fairness,
  type HeadlineReport,
} from "./types.js";

const WALL_MS_TARGET = 0.3; // ≥30% faster
const TOKEN_TARGET = 0.3; // ≤70% token use == ≥30% fewer tokens

export interface ReportOpts {
  fairness: Fairness;
  samplesPerCell: number;
}

function deltaFraction(amase: number[], sp: number[]) {
  const mA = mean(amase);
  const mS = mean(sp);
  const delta = mS === 0 ? 0 : (mS - mA) / mS; // positive = AMASE better
  // CI on the delta: use CI on (sp - amase), scaled by mS.
  const [ciLo, ciHi] = welchCI95(sp, amase);
  const ci95: [number, number] =
    mS === 0 ? [0, 0] : [ciLo / mS, ciHi / mS];
  const pValue = welchPValueTwoSided(amase, sp);
  return {
    amase: { mean: mA, stdev: amase.length >= 2 ? stdev(amase) : 0 },
    superpowers: { mean: mS, stdev: sp.length >= 2 ? stdev(sp) : 0 },
    delta,
    ci95,
    pValue,
  };
}

export function reportHeadline(
  results: BenchResult[],
  opts: ReportOpts,
): HeadlineReport {
  const byTaskStack = new Map<string, BenchResult[]>();
  const key = (r: BenchResult) => `${r.taskId}::${r.stack}`;
  for (const r of results) {
    const k = key(r);
    const arr = byTaskStack.get(k) ?? [];
    arr.push(r);
    byTaskStack.set(k, arr);
  }

  const taskIds = [...new Set(results.map((r) => r.taskId))];
  const notes: string[] = [];

  // A task "fully green" if every sample for both stacks passed.
  const fullyGreenTasks = taskIds.filter((tid) => {
    const a = byTaskStack.get(`${tid}::amase`) ?? [];
    const s = byTaskStack.get(`${tid}::superpowers`) ?? [];
    return a.length > 0 && s.length > 0 && a.every((r) => r.pass) && s.every((r) => r.pass);
  });

  const amasePassRate =
    results.filter((r) => r.stack === "amase" && r.pass).length /
    Math.max(1, results.filter((r) => r.stack === "amase").length);
  const spPassRate =
    results.filter((r) => r.stack === "superpowers" && r.pass).length /
    Math.max(1, results.filter((r) => r.stack === "superpowers").length);

  if (amasePassRate < spPassRate) {
    return {
      fairness: opts.fairness,
      samplesPerCell: opts.samplesPerCell,
      tasks: taskIds.length,
      bothPassedAll: fullyGreenTasks.length,
      wallMs: emptyCompare(),
      tokens: emptyCompare(),
      passRate: { amase: amasePassRate, superpowers: spPassRate },
      verdict: "regression",
      notes: [`AMASE pass rate ${amasePassRate.toFixed(2)} < superpowers ${spPassRate.toFixed(2)}`],
    };
  }

  if (fullyGreenTasks.length < 5) {
    return {
      fairness: opts.fairness,
      samplesPerCell: opts.samplesPerCell,
      tasks: taskIds.length,
      bothPassedAll: fullyGreenTasks.length,
      wallMs: emptyCompare(),
      tokens: emptyCompare(),
      passRate: { amase: amasePassRate, superpowers: spPassRate },
      verdict: "insufficient_signal",
      notes: [`Only ${fullyGreenTasks.length} task(s) fully green in both stacks; need >=5.`],
    };
  }

  const amaseWall: number[] = [];
  const spWall: number[] = [];
  const amaseTok: number[] = [];
  const spTok: number[] = [];
  for (const tid of fullyGreenTasks) {
    for (const r of byTaskStack.get(`${tid}::amase`) ?? []) {
      amaseWall.push(r.wallMs);
      amaseTok.push(r.tokensIn + r.tokensOut);
    }
    for (const r of byTaskStack.get(`${tid}::superpowers`) ?? []) {
      spWall.push(r.wallMs);
      spTok.push(r.tokensIn + r.tokensOut);
    }
  }

  const wall = deltaFraction(amaseWall, spWall);
  const tokens = deltaFraction(amaseTok, spTok);

  const hitTargets = wall.delta >= WALL_MS_TARGET && tokens.delta >= TOKEN_TARGET;
  const verdict: HeadlineReport["verdict"] = hitTargets ? "ok" : "fail_targets";

  return {
    fairness: opts.fairness,
    samplesPerCell: opts.samplesPerCell,
    tasks: taskIds.length,
    bothPassedAll: fullyGreenTasks.length,
    wallMs: wall,
    tokens,
    passRate: { amase: amasePassRate, superpowers: spPassRate },
    verdict,
    notes: hitTargets
      ? []
      : [
          `wallMs delta ${(wall.delta * 100).toFixed(1)}% (target ≥30%)`,
          `token delta ${(tokens.delta * 100).toFixed(1)}% (target ≥30%)`,
        ],
  };
}

function emptyCompare() {
  return {
    amase: { mean: 0, stdev: 0 },
    superpowers: { mean: 0, stdev: 0 },
    delta: 0,
    ci95: [0, 0] as [number, number],
    pValue: 1,
  };
}
```

- [ ] **Step 4: Run reporter tests.**

Run: `pnpm --filter @amase/bench test -- reporter.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Build + all tests.**

Run: `pnpm build && pnpm --filter @amase/bench test`
Expected: green.

- [ ] **Step 6: Commit.**

```bash
git add packages/bench/src/reporter.ts packages/bench/tests/reporter.test.ts
git commit -m "feat(bench): headline reporter with Welch CI + target gates"
```

---

## Task 10: CLI flags — samples, model, fairness, tasks

**Files:**
- Modify: `packages/bench/src/cli.ts`

- [ ] **Step 1: Replace `packages/bench/src/cli.ts` with:**

```typescript
#!/usr/bin/env node
import { join } from "node:path";
import { reportHeadline } from "./reporter.js";
import { runBench } from "./runner.js";
import type { Fairness, Stack } from "./types.js";

function getArg(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd !== "run") {
    console.error(
      "usage: amase-bench run [--stacks=amase,superpowers] [--samples=3] " +
        "[--model=claude-sonnet-4-6] [--fairness=primary|secondary|both] " +
        "[--tasks=id1,id2] [--live]",
    );
    process.exit(2);
  }

  const stacks = (getArg(args, "stacks") ?? "amase,superpowers").split(",") as Stack[];
  const samples = Number(getArg(args, "samples") ?? "3");
  if (!Number.isFinite(samples) || samples < 1) {
    console.error("--samples must be a positive integer");
    process.exit(2);
  }
  const model = getArg(args, "model") ?? "claude-sonnet-4-6";
  const fairnessArg = (getArg(args, "fairness") ?? "primary") as "primary" | "secondary" | "both";
  const tasks = getArg(args, "tasks")?.split(",");
  const live = args.includes("--live");
  const outDir = join(process.cwd(), "bench/results");

  const modes: Fairness[] =
    fairnessArg === "both" ? ["primary", "secondary"] : [fairnessArg];

  for (const fairness of modes) {
    console.error(`# fairness=${fairness}`);
    const results = await runBench({
      stacks, tasks, live, samples, model, fairness, outDir,
    });
    const report = reportHeadline(results, { fairness, samplesPerCell: samples });
    console.log(JSON.stringify(report, null, 2));
    if (fairness === "primary" && report.verdict !== "ok") {
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Build + manual smoke (stub mode).**

Run: `pnpm build && node packages/bench/dist/cli.js run --stacks=amase --samples=1 --model=claude-sonnet-4-6 --tasks=add-cli-flag`
Expected: JSON with `verdict` and `fairness: "primary"` printed to stdout. (Verdict may be `insufficient_signal` since stub mode + 1 task won't pass all targets — that's fine.)

- [ ] **Step 3: Commit.**

```bash
git add packages/bench/src/cli.ts
git commit -m "feat(bench): CLI flags for samples/model/fairness/tasks"
```

---

## Task 11: Secondary fairness — "in-practice" mode

**Why:** Spec A.3 requires two reports. Primary forces same model. Secondary lets each stack use its preferred config: AMASE with its router, superpowers with whatever model the user's `claude` CLI session has active.

**Files:**
- Modify: `packages/bench/src/adapters/amase.ts` — ignore `opts.model` when `opts.fairness === "secondary"` (fall back to the router / env).
- Modify: `packages/bench/src/adapters/superpowers.ts` — when `opts.fairness === "secondary"`, omit the `--model` flag (let CLI use its configured default) and record the observed model from the stream (`message.model` field in the first assistant event).
- Modify: `packages/bench/src/cli.ts` — already loops over modes from Task 10; no further change needed.

- [ ] **Step 1: Modify the AMASE adapter.**

In `packages/bench/src/adapters/amase.ts`, replace the LLM construction:

```typescript
    const llm: LlmClient = opts.live
      ? opts.fairness === "primary"
        ? new AnthropicClient({ model: opts.model })
        : new AnthropicClient() // router / env-driven in secondary
      : new StubLlmClient(buildStubResponder(workspace, fx.prompt, contextFiles));
```

In the returned row, replace `model: opts.model` with:

```typescript
    model: opts.fairness === "primary" ? opts.model : (process.env.AMASE_MODEL ?? "router"),
```

- [ ] **Step 2: Modify the superpowers adapter.**

Replace `const command = \`claude --print ${modelFlag} …\`` with:

```typescript
    const modelFlag = opts.fairness === "primary" ? `--model ${opts.model}` : "";
    const command =
      `claude --print ${modelFlag} --output-format=stream-json --verbose --permission-mode=bypassPermissions`;
```

Observe the model from the stream. Add a variable `let observedModel: string | undefined;` and extend the stream-parse loop:

```typescript
      try {
        const ev = JSON.parse(trimmed) as Record<string, unknown>;
        const u = extractUsage(ev);
        tokensIn += u.in;
        tokensOut += u.out;
        tokensCached += u.cached;
        if (!observedModel) {
          const msg = ev.message as { model?: string } | undefined;
          if (msg?.model) observedModel = msg.model;
        }
      } catch {
        // non-JSON line — ignore
      }
```

In the returned row, replace `model: opts.model` with:

```typescript
    model:
      opts.fairness === "primary"
        ? opts.model
        : (observedModel ?? "unknown"),
```

- [ ] **Step 3: Build + existing tests.**

Run: `pnpm build && pnpm --filter @amase/bench test`
Expected: green.

- [ ] **Step 4: Manual smoke in both modes (stub path — live requires credits).**

Run: `node packages/bench/dist/cli.js run --stacks=amase --samples=1 --model=claude-sonnet-4-6 --fairness=both --tasks=add-cli-flag`
Expected: two JSON reports printed, one per fairness mode.

- [ ] **Step 5: Commit.**

```bash
git add packages/bench/src/adapters/amase.ts packages/bench/src/adapters/superpowers.ts
git commit -m "feat(bench): secondary fairness mode (in-practice model selection)"
```

---

## Task 12: Add `bench` docs (how to run locally, what the report means)

**Files:**
- Create: `docs/bench/README.md`
- Modify: `README.md` (repo root — add a "Benchmarks" pointer section)

- [ ] **Step 1: Write `docs/bench/README.md`.**

```markdown
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

Single task for iteration (cheap):

```bash
node packages/bench/dist/cli.js run --tasks=add-cli-flag --samples=1 --live
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
```

- [ ] **Step 2: Add a pointer from repo `README.md`.**

At the end of the README's existing "Next" section, append:

```markdown
## Benchmarks

See [`docs/bench/README.md`](docs/bench/README.md) for the bench runner, headline interpretation, and local/CI invocation.
```

- [ ] **Step 3: Commit.**

```bash
git add docs/bench/README.md README.md
git commit -m "docs(bench): how to run locally + verdict glossary"
```

---

## Task 13: GitHub Actions workflow — bench as CI gate

**Files:**
- Create: `.github/workflows/bench.yml`

- [ ] **Step 1: Verify whether the repo already has workflows.**

Run: `ls .github/workflows 2>/dev/null`

- [ ] **Step 2: Create `.github/workflows/bench.yml`:**

```yaml
name: bench

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      samples:
        description: "Samples per cell"
        required: false
        default: "3"
      fairness:
        description: "primary | secondary | both"
        required: false
        default: "primary"

jobs:
  bench:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - name: Install Claude CLI (for superpowers adapter)
        run: npm install -g @anthropic-ai/claude-code
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm -r test
      - name: Bench (primary fairness)
        if: ${{ env.ANTHROPIC_API_KEY != '' }}
        run: |
          node packages/bench/dist/cli.js run \
            --samples=${{ github.event.inputs.samples || '3' }} \
            --model=claude-sonnet-4-6 \
            --fairness=${{ github.event.inputs.fairness || 'primary' }} \
            --live
      - name: Upload JSONL results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: bench-results-${{ github.run_id }}
          path: bench/results/*.jsonl
```

Design notes:

- The bench step is gated by presence of `ANTHROPIC_API_KEY` so PRs from forks (which don't receive the secret) do not fail the job — they skip the bench and still pass `pnpm test`. PRs from the upstream repo run the bench as a gate.
- `pnpm -r test` covers unit tests in every package (including the new bench tests). Bench-as-gate runs separately after the unit suite is clean.
- Results are uploaded as an artifact so regressions are diffable from the UI.
- On `pnpm-lock.yaml` drift, `--frozen-lockfile` fails fast.

- [ ] **Step 3: Verify workflow YAML parses.**

Run (optional, if `actionlint` is available): `actionlint .github/workflows/bench.yml`

If `actionlint` is not installed, open the file and check indentation manually.

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/bench.yml
git commit -m "ci(bench): run headline bench on PRs + main, gate on ANTHROPIC_API_KEY"
```

---

## Task 14: End-to-end acceptance — run live bench, confirm targets or document blockers

**Why:** This is the Phase A acceptance gate. Everything above is necessary infrastructure; this task is where we prove the 30%/30% claim — or identify the specific Phase A gap that prevents it, so Phase C can start with clear leverage points.

**Files:**
- Create: `docs/bench/headline-2026-04-21.md` (or whatever date the run lands)

- [ ] **Step 1: Ensure `ANTHROPIC_API_KEY` is set and credits are sufficient.**

Run: `node -e "console.log(!!process.env.ANTHROPIC_API_KEY)"`
Expected: `true`. (Note: v2 design committed to live Sonnet; a dry-run on one task first is prudent to catch billing issues before a full 13-task × 3-sample × 2-stack = 78-run suite.)

- [ ] **Step 2: One-task dry-run in primary fairness.**

Run:
```bash
node packages/bench/dist/cli.js run \
  --tasks=add-cli-flag --samples=1 \
  --model=claude-sonnet-4-6 --fairness=primary --live
```
Expected: both stacks produce a row with non-zero `tokensIn`/`tokensOut`, and at least AMASE produces `tokensCached > 0` after the first pass (cache warmup may keep the first request at 0 — acceptable).

- [ ] **Step 3: Full primary-fairness bench.**

Run:
```bash
node packages/bench/dist/cli.js run \
  --samples=3 --model=claude-sonnet-4-6 --fairness=primary --live \
  2>&1 | tee bench/results/headline-primary-$(date -u +%Y%m%dT%H%M%SZ).log
```

Save the JSON report emitted on stdout alongside the log.

- [ ] **Step 4: If `verdict === "ok"`, write `docs/bench/headline-<date>.md` with the JSON report and a one-paragraph narrative.** The narrative must state:
  - Model used on both sides.
  - Samples per cell.
  - `wallMs.delta` and `tokens.delta` with their 95% CI.
  - Any tasks that failed on either side (and why, if obvious).

- [ ] **Step 5: If `verdict !== "ok"`, write the same document, and add a "Phase A gaps identified" section listing the specific tasks where AMASE lagged, with token/time deltas.** Do **not** retroactively tune thresholds to manufacture a pass — a `fail_targets` verdict is useful information for Phase C (observability will tell us why).

- [ ] **Step 6: Secondary-fairness run (optional for acceptance; informational).**

Run:
```bash
node packages/bench/dist/cli.js run \
  --samples=3 --fairness=secondary --live \
  2>&1 | tee bench/results/headline-secondary-$(date -u +%Y%m%dT%H%M%SZ).log
```

Append its summary to the headline doc as "Secondary / in-practice" section.

- [ ] **Step 7: Commit results + headline doc.**

```bash
git add bench/results/ docs/bench/headline-*.md
git commit -m "bench: first live Sonnet headline run ($(date -u +%Y-%m-%d))"
```

---

## Task 15: Guardrail tests — prevent Phase A regressions

**Why:** After all the above, lock in what we've built so Phase C/B don't silently break it.

**Files:**
- Create: `packages/bench/tests/adapter-contract.test.ts`
- Modify: `.github/workflows/bench.yml` — add a job that runs `pnpm -r test` with no secrets (so forks still protect the schema).

- [ ] **Step 1: Write a contract test that both adapters return a `BenchResult` passing `BenchResultSchema.parse` when given a trivial fixture.**

Create `packages/bench/tests/adapter-contract.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { runAmase } from "../src/adapters/amase.js";
import { loadFixture } from "../src/fixtures.js";
import { BenchResultSchema } from "../src/types.js";

describe("adapter contract", () => {
  it("amase adapter (stub mode) returns a schema-valid BenchResult", async () => {
    const fx = await loadFixture("add-cli-flag");
    const r = await runAmase(fx, {
      runId: "test",
      runSeq: 1,
      model: "stub",
      fairness: "primary",
      live: false,
    });
    expect(() => BenchResultSchema.parse(r)).not.toThrow();
    expect(r.stack).toBe("amase");
    expect(r.runSeq).toBe(1);
  }, 60_000);
});
```

Note: no equivalent test for the superpowers adapter — it requires the `claude` CLI binary on PATH, which fork PRs don't reliably have.

- [ ] **Step 2: Run the test.**

Run: `pnpm build && pnpm --filter @amase/bench test -- adapter-contract.test.ts`
Expected: pass.

- [ ] **Step 3: Add a unit-only job to `.github/workflows/bench.yml` that runs on every PR including forks.**

Modify `.github/workflows/bench.yml` — add a second job before `bench`:

```yaml
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm -r test
```

And change the `bench` job to `needs: unit`.

- [ ] **Step 4: Build + run all tests.**

Run: `pnpm build && pnpm -r test`
Expected: green across all packages.

- [ ] **Step 5: Commit.**

```bash
git add packages/bench/tests/adapter-contract.test.ts .github/workflows/bench.yml
git commit -m "test(bench): adapter contract test + fork-safe unit job"
```

---

## Acceptance criteria (Phase A — recap)

- [ ] `pnpm build` clean across all 8 packages.
- [ ] `pnpm -r test` green; total test count increases by ≥8 files (stats, types, fixture-meta, typecheck-gate, runner-sampling, reporter, adapter-contract) + existing tests.
- [ ] `packages/bench/fixtures/` contains exactly 5 micro + 5 medium + 3 large fixtures (`fixture-meta.test.ts` enforces this).
- [ ] `BenchResult` includes `model`, `runSeq`, `tokensCached`, `validatorFailures`.
- [ ] `HeadlineReport` emitted by the reporter matches `HeadlineReportSchema`.
- [ ] `node packages/bench/dist/cli.js run --samples=3 --model=claude-sonnet-4-6 --fairness=primary --live` executes without runner-side errors.
- [ ] A `docs/bench/headline-*.md` document exists recording the first live Sonnet headline with `verdict`, `wallMs.delta`, `tokens.delta`, and 95% CIs.
- [ ] `.github/workflows/bench.yml` runs on PRs; unit job protects forks; bench job is gated on a present secret and on unit success.
- [ ] Headline verdict is `ok` OR the doc explicitly enumerates the Phase-A gaps preventing it. (Either outcome ends Phase A; Phase C begins with that evidence.)

## Out of scope (deferred)

- **Phase C** — decision-log v2 schema, `amase trace` CLI, gap-metrics dashboard, router/cache diagnostics. Tracked in a separate plan.
- **Phase B** — tiered validation, top-10 language validators, sandboxed worktree, secret redaction, prompt-injection markers, budgets. Tracked in a separate plan after Phase C completes.
