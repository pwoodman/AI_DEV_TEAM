import { expect, test } from "vitest";
import { DecisionLogEntrySchema } from "../src/validation.js";

test("run.started parses", () => {
  const entry = DecisionLogEntrySchema.parse({
    ts: "2026-01-01T00:00:00.000Z",
    dagId: "dag-1",
    runId: "run-1",
    nodeId: "<run>",
    event: "run.started",
    data: { totalNodes: 3 },
  });
  expect(entry.event).toBe("run.started");
});

test("node.enqueued parses", () => {
  const entry = DecisionLogEntrySchema.parse({
    ts: "2026-01-01T00:00:00.000Z",
    dagId: "dag-1",
    runId: "run-1",
    nodeId: "n1",
    event: "node.enqueued",
    data: { agentKind: "backend", depsReady: 0 },
  });
  expect(entry.event).toBe("node.enqueued");
});

test("agent.llm.response parses", () => {
  const entry = DecisionLogEntrySchema.parse({
    ts: "2026-01-01T00:00:00.000Z",
    dagId: "dag-1",
    runId: "run-1",
    nodeId: "n1",
    event: "agent.llm.response",
    data: { tokensIn: 100, tokensOut: 50, tokensCached: 200, latencyMs: 1200, model: "claude-sonnet-4-6" },
  });
  expect(entry.event).toBe("agent.llm.response");
});

test("run.completed parses", () => {
  const entry = DecisionLogEntrySchema.parse({
    ts: "2026-01-01T00:00:00.000Z",
    dagId: "dag-1",
    runId: "run-1",
    nodeId: "<run>",
    event: "run.completed",
    data: { outcome: "ok", totalTokens: 1000, wallMs: 8000 },
  });
  expect(entry.event).toBe("run.completed");
});

test("old events still parse", () => {
  const entry = DecisionLogEntrySchema.parse({
    ts: "2026-01-01T00:00:00.000Z",
    dagId: "dag-1",
    runId: "run-1",
    nodeId: "n1",
    event: "node.started",
    data: {},
  });
  expect(entry.event).toBe("node.started");
});
