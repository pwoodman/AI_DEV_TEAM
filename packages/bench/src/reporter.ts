import type { BenchResult, Stack } from "./types.js";

// ---------------------------------------------------------------------------
// Legacy headline (kept for programmatic callers)
// ---------------------------------------------------------------------------
export type Headline =
  | { status: "insufficient_signal"; bothPassed: number }
  | { status: "regression"; passRateDelta: number }
  | { status: "ok"; tokenDelta: number; timeDelta: number; passRateDelta: number; bothPassed: number };

export function reportHeadline(results: BenchResult[]): Headline {
  const byTask = new Map<string, { amase?: BenchResult; superpowers?: BenchResult }>();
  for (const r of results) {
    const entry = byTask.get(r.taskId) ?? {};
    if (r.stack === "amase" || r.stack === "superpowers") entry[r.stack] = r;
    byTask.set(r.taskId, entry);
  }
  let amasePassed = 0;
  let spPassed = 0;
  let tokenA = 0;
  let tokenS = 0;
  let timeA = 0;
  let timeS = 0;
  let bothPassed = 0;
  const total = byTask.size;
  for (const [, { amase, superpowers }] of byTask) {
    if (amase?.pass) amasePassed++;
    if (superpowers?.pass) spPassed++;
    if (amase?.pass && superpowers?.pass) {
      bothPassed++;
      tokenA += amase.tokensIn + amase.tokensOut;
      tokenS += superpowers.tokensIn + superpowers.tokensOut;
      timeA += amase.wallMs;
      timeS += superpowers.wallMs;
    }
  }
  const passRateDelta = total === 0 ? 0 : (amasePassed - spPassed) / total;
  if (passRateDelta < 0) return { status: "regression", passRateDelta };
  if (bothPassed < 5) return { status: "insufficient_signal", bothPassed };
  return {
    status: "ok",
    tokenDelta: tokenS === 0 ? 0 : (tokenS - tokenA) / tokenS,
    timeDelta: timeS === 0 ? 0 : (timeS - timeA) / timeS,
    passRateDelta,
    bothPassed,
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
        const errLine = `  [${s}] ${d.error.replace(/\[[^m]*m/g, "").slice(0, NAME_W + DESC_W - 6).trim()}`;
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
