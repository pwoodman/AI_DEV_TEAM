import type { DecisionLogEntry } from "@amase/contracts";

export interface GapMetrics {
  /** sum(nodeWallMs) / runWallMs — >1 means good parallelism, <0.5 is a flag */
  parallelismFactor: number;
  /** fraction of unique nodes that had at least one retry */
  retryRate: number;
  /** tokensCached / (tokensIn + tokensCached) across all agent.llm.response events */
  cacheHitRatio: number;
  /** fraction of validator failures dominated by a single validator */
  singleValidatorShare: number;
  flags: {
    lowParallelism: boolean;
    highRetryRate: boolean;
    lowCacheHit: boolean;
    singleValidatorDominant: boolean;
  };
}

export function computeGapMetrics(entries: DecisionLogEntry[]): GapMetrics {
  // --- Parallelism factor ---
  const runStartEntry = entries.find((e) => e.event === "run.started");
  const runEndEntry = entries.find((e) => e.event === "run.completed");
  const runWallMs =
    runStartEntry && runEndEntry
      ? new Date(runEndEntry.ts).getTime() - new Date(runStartEntry.ts).getTime()
      : 0;

  const nodeWalls = new Map<string, { start?: number; end?: number }>();
  for (const e of entries) {
    if (e.nodeId.startsWith("<")) continue;
    if (e.event === "node.started") {
      const existing = nodeWalls.get(e.nodeId) ?? {};
      if (!existing.start) nodeWalls.set(e.nodeId, { ...existing, start: new Date(e.ts).getTime() });
    } else if (e.event === "node.completed" || e.event === "node.failed") {
      const existing = nodeWalls.get(e.nodeId) ?? {};
      nodeWalls.set(e.nodeId, { ...existing, end: new Date(e.ts).getTime() });
    }
  }
  let sumNodeWallMs = 0;
  for (const { start, end } of nodeWalls.values()) {
    if (start !== undefined && end !== undefined) sumNodeWallMs += end - start;
  }
  const parallelismFactor = runWallMs > 0 ? sumNodeWallMs / runWallMs : 0;

  // --- Retry rate ---
  const nodesWithRetries = new Set<string>();
  const allNodes = new Set<string>();
  for (const e of entries) {
    if (e.nodeId.startsWith("<")) continue;
    if (e.event === "node.started" || e.event === "node.completed" || e.event === "node.failed") {
      allNodes.add(e.nodeId);
    }
    if (e.event === "node.retried") {
      nodesWithRetries.add(e.nodeId);
      allNodes.add(e.nodeId);
    }
  }
  const retryRate = allNodes.size > 0 ? nodesWithRetries.size / allNodes.size : 0;

  // --- Cache-hit ratio ---
  let totalTokensIn = 0;
  let totalTokensCached = 0;
  for (const e of entries) {
    if (e.event === "agent.llm.response") {
      totalTokensIn += typeof e.data.tokensIn === "number" ? e.data.tokensIn : 0;
      totalTokensCached += typeof e.data.tokensCached === "number" ? e.data.tokensCached : 0;
    }
  }
  const cacheHitRatio =
    totalTokensIn + totalTokensCached > 0
      ? totalTokensCached / (totalTokensIn + totalTokensCached)
      : 0;

  // --- Single-validator share ---
  const validatorFailCounts = new Map<string, number>();
  for (const e of entries) {
    if (e.event === "validator.failed") {
      const name = typeof e.data.validator === "string" ? e.data.validator : "unknown";
      validatorFailCounts.set(name, (validatorFailCounts.get(name) ?? 0) + 1);
    }
  }
  const totalFailures = [...validatorFailCounts.values()].reduce((a, b) => a + b, 0);
  const maxFailures = Math.max(0, ...[...validatorFailCounts.values()]);
  const singleValidatorShare = totalFailures > 0 ? maxFailures / totalFailures : 0;

  return {
    parallelismFactor,
    retryRate,
    cacheHitRatio,
    singleValidatorShare,
    flags: {
      lowParallelism: parallelismFactor < 0.5 && runWallMs > 0,
      highRetryRate: retryRate > 0.15,
      lowCacheHit: cacheHitRatio < 0.5 && totalTokensIn + totalTokensCached > 0,
      singleValidatorDominant: singleValidatorShare > 0.6,
    },
  };
}
