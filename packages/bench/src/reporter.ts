import { mean, stdev, welchCI95, welchPValueTwoSided } from "./stats.js";
import type { BenchResult, Fairness, HeadlineReport, Stack } from "./types.js";

const WALL_MS_TARGET = 0.3; // ≥30% faster
const TOKEN_TARGET = 0.3;   // ≤70% token use == ≥30% fewer tokens

export interface ReportOpts {
  fairness: Fairness;
  samplesPerCell: number;
}

function deltaFraction(amase: number[], sp: number[]) {
  const mA = mean(amase);
  const mS = mean(sp);
  const delta = mS === 0 ? 0 : (mS - mA) / mS; // positive = AMASE better
  const [ciLo, ciHi] = welchCI95(sp, amase);
  const ci95: [number, number] = mS === 0 ? [0, 0] : [ciLo / mS, ciHi / mS];
  const pValue = welchPValueTwoSided(amase, sp);
  return {
    amase: { mean: mA, stdev: amase.length >= 2 ? stdev(amase) : 0 },
    superpowers: { mean: mS, stdev: sp.length >= 2 ? stdev(sp) : 0 },
    delta,
    ci95,
    pValue,
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

// ---------------------------------------------------------------------------
// Full comparison table
// ---------------------------------------------------------------------------
interface TaskSummary {
  id: string;
  description: string;
  stacks: Partial<Record<Stack, { pass: boolean; tokens: number; wallMs: number; retries: number; error?: string }>>;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "n/a";
  const d = ((b - a) / b) * 100;
  return `${d >= 0 ? "−" : "+"}${Math.abs(d).toFixed(1)}%`;
}

export function printTable(results: BenchResult[], descriptions: Map<string, string>): void {
  // Group by taskId
  const byTask = new Map<string, TaskSummary>();
  for (const r of results) {
    if (!byTask.has(r.taskId)) {
      byTask.set(r.taskId, { id: r.taskId, description: descriptions.get(r.taskId) ?? "", stacks: {} });
    }
    const ts = byTask.get(r.taskId)!;
    ts.stacks[r.stack] = {
      pass: r.pass,
      tokens: r.tokensIn + r.tokensOut,
      wallMs: r.wallMs,
      retries: r.retries,
      error: r.error,
    };
  }

  const tasks = [...byTask.values()].sort((a, b) => a.id.localeCompare(b.id));
  const stacks = [...new Set(results.map((r) => r.stack))] as Stack[];

  // Column widths
  const NAME_W = 38;
  const DESC_W = 44;
  const STACK_W = 22; // "✓  10.2k  68.3s  r:0"

  const hr = `${"─".repeat(NAME_W + 1)}┼${"─".repeat(DESC_W + 2)}┼${stacks.map(() => "─".repeat(STACK_W + 2)).join("┼")}`;
  const top = `${"─".repeat(NAME_W + 1)}┬${"─".repeat(DESC_W + 2)}┬${stacks.map(() => "─".repeat(STACK_W + 2)).join("┬")}`;
  const bot = `${"─".repeat(NAME_W + 1)}┴${"─".repeat(DESC_W + 2)}┴${stacks.map(() => "─".repeat(STACK_W + 2)).join("┴")}`;

  const stackHeader = (s: Stack) => pad(`${s}  pass  tokens  time`, STACK_W);
  const headerLeft = `${pad("task", NAME_W)} │ ${pad("description", DESC_W)} │ ${stacks.map(stackHeader).join(" │ ")}`;

  console.log(`\n┌${top}┐`);
  console.log(`│ ${headerLeft} │`);
  console.log(`├${hr}┤`);

  // Totals accumulators
  const totals: Partial<Record<Stack, { pass: number; total: number; tokens: number; ms: number }>> = {};
  for (const s of stacks) totals[s] = { pass: 0, total: 0, tokens: 0, ms: 0 };

  for (const t of tasks) {
    const nameCol = pad(t.id, NAME_W);
    const descCol = pad(t.description.slice(0, DESC_W), DESC_W);

    const stackCols = stacks.map((s) => {
      const d = t.stacks[s];
      if (!d) return pad("—", STACK_W);
      const mark = d.pass ? "✓" : "✗";
      const retry = d.retries > 0 ? ` r:${d.retries}` : "";
      const cell = `${mark}  ${fmtTokens(d.tokens).padStart(6)}  ${fmtMs(d.wallMs).padStart(6)}${retry}`;
      // accumulate
      const acc = totals[s]!;
      acc.total++;
      if (d.pass) acc.pass++;
      acc.tokens += d.tokens;
      acc.ms += d.wallMs;
      return pad(cell, STACK_W);
    });

    console.log(`│ ${nameCol} │ ${descCol} │ ${stackCols.join(" │ ")} │`);

    // If task failed on any stack, show truncated error underneath
    for (const s of stacks) {
      const d = t.stacks[s];
      if (d && !d.pass && d.error) {
        const errLine = `  [${s}] ${d.error.replace(/\[[^m]*m/g, "").slice(0, NAME_W + DESC_W - 6).trim()}`;
        console.log(`│ ${pad(errLine, NAME_W + DESC_W + 3 + stacks.length * (STACK_W + 3))} │`);
      }
    }
  }

  // Totals row
  console.log(`├${hr}┤`);
  const totalStackCols = stacks.map((s) => {
    const acc = totals[s];
    if (!acc) return pad("—", STACK_W);
    return pad(`${acc.pass}/${acc.total}  ${fmtTokens(acc.tokens).padStart(6)}  ${fmtMs(acc.ms).padStart(6)}`, STACK_W);
  });
  console.log(`│ ${pad("TOTALS", NAME_W)} │ ${pad("", DESC_W)} │ ${totalStackCols.join(" │ ")} │`);
  console.log(`└${bot}┘`);

  // Delta summary (amase vs each other stack)
  const amase = totals.amase;
  if (amase) {
    console.log();
    for (const s of stacks.filter((x) => x !== "amase")) {
      const other = totals[s];
      if (!other) continue;
      console.log(
        `amase vs ${s}: tokens ${pct(amase.tokens, other.tokens)} (${fmtTokens(amase.tokens)} vs ${fmtTokens(other.tokens)})` +
          `  time ${pct(amase.ms, other.ms)} (${fmtMs(amase.ms)} vs ${fmtMs(other.ms)})` +
          `  pass ${amase.pass}/${amase.total} vs ${other.pass}/${other.total}`,
      );
    }
  }
  console.log();
}
