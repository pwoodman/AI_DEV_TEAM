import { expect, test } from "vitest";
import { computeGapMetrics } from "../src/gap-metrics.js";
import type { DecisionLogEntry } from "@amase/contracts";

function entry(event: string, nodeId: string, data: Record<string, unknown> = {}, ts = "2026-01-01T00:00:00.000Z"): DecisionLogEntry {
  return {
    ts,
    dagId: "dag-1",
    runId: "run-1",
    nodeId,
    event: event as DecisionLogEntry["event"],
    data,
  };
}

test("parallelism factor: single node roughly matches duration/runWall", () => {
  const entries: DecisionLogEntry[] = [
    entry("run.started", "<run>", { totalNodes: 1 }, "2026-01-01T00:00:00.000Z"),
    entry("node.started", "n1", {}, "2026-01-01T00:00:00.100Z"),
    entry("node.completed", "n1", {}, "2026-01-01T00:00:02.100Z"),
    entry("run.completed", "<run>", {}, "2026-01-01T00:00:02.200Z"),
  ];
  const m = computeGapMetrics(entries);
  // node wall = 2000ms, run wall = 2200ms → factor ≈ 0.91
  expect(m.parallelismFactor).toBeCloseTo(2000 / 2200, 2);
});

test("parallelism factor: two parallel nodes gives factor > 1", () => {
  const entries: DecisionLogEntry[] = [
    entry("run.started", "<run>", {}, "2026-01-01T00:00:00.000Z"),
    entry("node.started", "n1", {}, "2026-01-01T00:00:00.100Z"),
    entry("node.started", "n2", {}, "2026-01-01T00:00:00.200Z"),
    entry("node.completed", "n1", {}, "2026-01-01T00:00:02.100Z"),
    entry("node.completed", "n2", {}, "2026-01-01T00:00:02.300Z"),
    entry("run.completed", "<run>", {}, "2026-01-01T00:00:02.500Z"),
  ];
  const m = computeGapMetrics(entries);
  // n1 wall = 2000ms, n2 wall = 2100ms, run wall = 2500ms → (2000+2100)/2500 ≈ 1.64
  expect(m.parallelismFactor).toBeCloseTo((2000 + 2100) / 2500, 1);
  expect(m.parallelismFactor).toBeGreaterThan(1);
});

test("retry rate: no retries → 0", () => {
  const entries: DecisionLogEntry[] = [
    entry("node.started", "n1"),
    entry("node.completed", "n1"),
    entry("node.started", "n2"),
    entry("node.completed", "n2"),
  ];
  const m = computeGapMetrics(entries);
  expect(m.retryRate).toBe(0);
});

test("retry rate: one of two nodes retried → 0.5", () => {
  const entries: DecisionLogEntry[] = [
    entry("node.started", "n1"),
    entry("node.retried", "n1"),
    entry("node.completed", "n1"),
    entry("node.started", "n2"),
    entry("node.completed", "n2"),
  ];
  const m = computeGapMetrics(entries);
  expect(m.retryRate).toBe(0.5);
});

test("cacheHitRatio: tokensIn=100 tokensCached=200 → 200/300 ≈ 0.67", () => {
  const entries: DecisionLogEntry[] = [
    entry("agent.llm.response", "n1", { tokensIn: 100, tokensOut: 50, tokensCached: 200 }),
  ];
  const m = computeGapMetrics(entries);
  expect(m.cacheHitRatio).toBeCloseTo(200 / 300, 2);
});

test("cacheHitRatio: no cache reads → 0", () => {
  const entries: DecisionLogEntry[] = [
    entry("agent.llm.response", "n1", { tokensIn: 100, tokensOut: 50, tokensCached: 0 }),
  ];
  const m = computeGapMetrics(entries);
  expect(m.cacheHitRatio).toBe(0);
});

test("flags.lowParallelism set when parallelismFactor < 0.5", () => {
  const entries: DecisionLogEntry[] = [
    entry("run.started", "<run>", {}, "2026-01-01T00:00:00.000Z"),
    entry("node.started", "n1", {}, "2026-01-01T00:00:00.500Z"),
    entry("node.completed", "n1", {}, "2026-01-01T00:00:01.000Z"),
    entry("run.completed", "<run>", {}, "2026-01-01T00:00:02.000Z"),
  ];
  const m = computeGapMetrics(entries);
  // node wall = 500ms, run wall = 2000ms → factor = 0.25
  expect(m.parallelismFactor).toBeCloseTo(0.25, 2);
  expect(m.flags.lowParallelism).toBe(true);
});

test("flags.highRetryRate set when retryRate > 0.15", () => {
  const entries: DecisionLogEntry[] = [];
  for (const id of ["n1", "n2", "n3", "n4"]) {
    entries.push(entry("node.started", id));
    if (id !== "n4") entries.push(entry("node.retried", id));
    entries.push(entry("node.completed", id));
  }
  const m = computeGapMetrics(entries);
  expect(m.flags.highRetryRate).toBe(true);
});
