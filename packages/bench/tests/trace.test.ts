import { expect, test } from "vitest";
import { renderTrace } from "../src/trace.js";
import type { DecisionLogEntry } from "@amase/contracts";

function e(event: string, nodeId: string, data: Record<string, unknown> = {}, ts = "2026-01-01T00:00:00.000Z"): DecisionLogEntry {
  return { ts, dagId: "dag-1", runId: "run-1", nodeId, event: event as DecisionLogEntry["event"], data };
}

const minimalEntries: DecisionLogEntry[] = [
  e("run.started", "<run>", { totalNodes: 2 }, "2026-01-01T00:00:00.000Z"),
  e("node.started", "n1", {}, "2026-01-01T00:00:00.100Z"),
  e("agent.llm.response", "n1", { tokensIn: 100, tokensOut: 50, tokensCached: 200, latencyMs: 800 }, "2026-01-01T00:00:00.900Z"),
  e("node.completed", "n1", {}, "2026-01-01T00:00:01.000Z"),
  e("node.started", "n2", {}, "2026-01-01T00:00:00.200Z"),
  e("agent.llm.response", "n2", { tokensIn: 80, tokensOut: 40, tokensCached: 100, latencyMs: 600 }, "2026-01-01T00:00:00.800Z"),
  e("node.completed", "n2", {}, "2026-01-01T00:00:01.100Z"),
  e("run.completed", "<run>", {}, "2026-01-01T00:00:01.200Z"),
];

test("renderTrace includes WATERFALL header", () => {
  const out = renderTrace(minimalEntries);
  expect(out).toContain("WATERFALL");
});

test("renderTrace includes TOKEN TABLE header", () => {
  const out = renderTrace(minimalEntries);
  expect(out).toContain("TOKEN TABLE");
});

test("renderTrace shows node IDs in token table", () => {
  const out = renderTrace(minimalEntries);
  expect(out).toContain("n1");
  expect(out).toContain("n2");
});

test("renderTrace shows GAP METRICS", () => {
  const out = renderTrace(minimalEntries);
  expect(out).toContain("GAP METRICS");
  expect(out).toContain("parallelism");
});

test("renderTrace shows retry section when retry present", () => {
  const withRetry = [
    ...minimalEntries,
    e("node.retried", "n1", { attempt: 1 }, "2026-01-01T00:00:00.500Z"),
  ];
  const out = renderTrace(withRetry);
  expect(out).toContain("RETRY");
  expect(out).toContain("n1");
});

test("renderTrace empty entries returns short message", () => {
  const out = renderTrace([]);
  expect(out).toContain("no entries");
});
