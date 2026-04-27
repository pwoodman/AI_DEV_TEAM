import type { DecisionLogEntry } from "@amase/contracts";
import { computeGapMetrics } from "./gap-metrics.js";

const BAR_WIDTH = 40;

function padRight(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

export function renderTrace(entries: DecisionLogEntry[]): string {
  if (entries.length === 0) return "no entries\n";

  const lines: string[] = [];

  const runStart = entries.find((e) => e.event === "run.started");
  const runEnd = entries.find((e) => e.event === "run.completed");
  const t0 = runStart ? new Date(runStart.ts).getTime() : new Date(entries[0].ts).getTime();
  const tEnd = runEnd ? new Date(runEnd.ts).getTime() : new Date(entries[entries.length - 1].ts).getTime();
  const runWallMs = tEnd - t0;

  // ── WATERFALL ────────────────────────────────────────────────────────────────
  lines.push("═".repeat(70));
  lines.push("  WATERFALL");
  lines.push("═".repeat(70));

  const nodeIds = [...new Set(entries.filter((e) => !e.nodeId.startsWith("<")).map((e) => e.nodeId))];
  const nodeStart = new Map<string, number>();
  const nodeEnd = new Map<string, number>();

  for (const e of entries) {
    if (e.nodeId.startsWith("<")) continue;
    const t = new Date(e.ts).getTime();
    if (e.event === "node.started" && !nodeStart.has(e.nodeId)) nodeStart.set(e.nodeId, t);
    if (e.event === "node.completed" || e.event === "node.failed") nodeEnd.set(e.nodeId, t);
  }

  const safeRunWall = runWallMs > 0 ? runWallMs : 1;
  lines.push(`  ${"run".padEnd(12)} ${"[" + "█".repeat(BAR_WIDTH) + "]"}  ${runWallMs}ms total`);
  for (const id of nodeIds) {
    const start = nodeStart.get(id) ?? t0;
    const end = nodeEnd.get(id) ?? tEnd;
    const offset = start - t0;
    const duration = end - start;
    const leadPad = Math.min(BAR_WIDTH - 1, Math.round((offset / safeRunWall) * BAR_WIDTH));
    const barLen = Math.max(1, Math.min(BAR_WIDTH - leadPad, Math.round((duration / safeRunWall) * BAR_WIDTH)));
    const bar = " ".repeat(leadPad) + "▓".repeat(barLen) + " ".repeat(Math.max(0, BAR_WIDTH - leadPad - barLen));
    lines.push(`  ${padRight(id, 12)} [${bar}]  ${duration}ms`);
  }

  // ── TOKEN TABLE ──────────────────────────────────────────────────────────────
  lines.push("");
  lines.push("═".repeat(70));
  lines.push("  TOKEN TABLE");
  lines.push("═".repeat(70));
  lines.push(`  ${"node".padEnd(14)} ${padLeft("in", 8)} ${padLeft("out", 8)} ${padLeft("cached", 10)} ${padLeft("hit%", 7)}`);
  lines.push("  " + "─".repeat(50));

  const llmByNode = new Map<string, { tokensIn: number; tokensOut: number; tokensCached: number }>();
  for (const e of entries) {
    if (e.event !== "agent.llm.response") continue;
    const cur = llmByNode.get(e.nodeId) ?? { tokensIn: 0, tokensOut: 0, tokensCached: 0 };
    cur.tokensIn += typeof e.data.tokensIn === "number" ? e.data.tokensIn : 0;
    cur.tokensOut += typeof e.data.tokensOut === "number" ? e.data.tokensOut : 0;
    cur.tokensCached += typeof e.data.tokensCached === "number" ? e.data.tokensCached : 0;
    llmByNode.set(e.nodeId, cur);
  }

  let sumIn = 0, sumOut = 0, sumCached = 0;
  for (const id of nodeIds) {
    const t = llmByNode.get(id) ?? { tokensIn: 0, tokensOut: 0, tokensCached: 0 };
    const hitPct = t.tokensIn + t.tokensCached > 0
      ? ((t.tokensCached / (t.tokensIn + t.tokensCached)) * 100).toFixed(0) + "%"
      : "—";
    lines.push(`  ${padRight(id, 14)} ${padLeft(String(t.tokensIn), 8)} ${padLeft(String(t.tokensOut), 8)} ${padLeft(String(t.tokensCached), 10)} ${padLeft(hitPct, 7)}`);
    sumIn += t.tokensIn; sumOut += t.tokensOut; sumCached += t.tokensCached;
  }
  const totalHitPct = sumIn + sumCached > 0
    ? ((sumCached / (sumIn + sumCached)) * 100).toFixed(0) + "%"
    : "—";
  lines.push("  " + "─".repeat(50));
  lines.push(`  ${"TOTAL".padEnd(14)} ${padLeft(String(sumIn), 8)} ${padLeft(String(sumOut), 8)} ${padLeft(String(sumCached), 10)} ${padLeft(totalHitPct, 7)}`);

  // ── RETRY HOTSPOTS ───────────────────────────────────────────────────────────
  const retriedNodes = new Map<string, number>();
  for (const e of entries) {
    if (e.event === "node.retried") {
      retriedNodes.set(e.nodeId, (retriedNodes.get(e.nodeId) ?? 0) + 1);
    }
  }
  if (retriedNodes.size > 0) {
    lines.push("");
    lines.push("═".repeat(70));
    lines.push("  RETRY HOTSPOTS");
    lines.push("═".repeat(70));
    for (const [id, count] of retriedNodes.entries()) {
      lines.push(`  ${id}: ${count} retry(ies)`);
    }
  }

  // ── GAP METRICS ──────────────────────────────────────────────────────────────
  const gaps = computeGapMetrics(entries);
  lines.push("");
  lines.push("═".repeat(70));
  lines.push("  GAP METRICS");
  lines.push("═".repeat(70));
  lines.push(`  parallelism factor : ${gaps.parallelismFactor.toFixed(2)}${gaps.flags.lowParallelism ? "  ⚠ LOW (<0.5)" : ""}`);
  lines.push(`  retry rate         : ${(gaps.retryRate * 100).toFixed(0)}%${gaps.flags.highRetryRate ? "  ⚠ HIGH (>15%)" : ""}`);
  lines.push(`  cache-hit ratio    : ${(gaps.cacheHitRatio * 100).toFixed(0)}%${gaps.flags.lowCacheHit ? "  ⚠ LOW (<50%)" : ""}`);
  lines.push(`  single-validator   : ${(gaps.singleValidatorShare * 100).toFixed(0)}%${gaps.flags.singleValidatorDominant ? "  ⚠ DOMINANT (>60%)" : ""}`);

  return lines.join("\n") + "\n";
}
