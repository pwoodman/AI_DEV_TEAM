import { describe, expect, it } from "vitest";
import {
  AgentInputSchema,
  AgentOutputSchema,
  DecisionLogEntrySchema,
  FeatureRequestSchema,
  TaskGraphSchema,
  TaskNodeSchema,
  ValidationResultSchema,
} from "../src/index.js";

describe("AgentInput", () => {
  const valid = {
    taskId: "t1",
    kind: "backend",
    goal: "add /health",
    context: { files: [] },
    constraints: { maxTokens: 1024, timeoutMs: 10000, allowedPaths: ["src/"] },
  };

  it("parses valid input", () => {
    expect(AgentInputSchema.parse(valid)).toMatchObject({ taskId: "t1", kind: "backend" });
  });

  it("rejects unknown kind", () => {
    expect(() => AgentInputSchema.parse({ ...valid, kind: "bogus" })).toThrow();
  });

  it("requires at least one allowedPath", () => {
    expect(() =>
      AgentInputSchema.parse({ ...valid, constraints: { ...valid.constraints, allowedPaths: [] } }),
    ).toThrow();
  });

  it("rejects empty goal", () => {
    expect(() => AgentInputSchema.parse({ ...valid, goal: "" })).toThrow();
  });
});

describe("AgentOutput", () => {
  const valid = {
    taskId: "t1",
    patches: [{ path: "src/a.ts", op: "create", content: "x" }],
    notes: "done",
  };

  it("parses valid output", () => {
    expect(AgentOutputSchema.parse(valid).patches).toHaveLength(1);
  });

  it("rejects unknown op", () => {
    expect(() =>
      AgentOutputSchema.parse({
        ...valid,
        patches: [{ path: "src/a.ts", op: "nuke", content: "x" }],
      }),
    ).toThrow();
  });

  it("truncates notes to 2000 chars at parse time", () => {
    const parsed = AgentOutputSchema.parse({ ...valid, notes: "a".repeat(2500) });
    expect(parsed.notes).toHaveLength(2000);
  });
});

describe("TaskNode / TaskGraph", () => {
  const node = {
    id: "n1",
    kind: "backend",
    goal: "x",
    dependsOn: [],
    allowedPaths: ["src/"],
  };

  it("parses node", () => {
    expect(TaskNodeSchema.parse(node).id).toBe("n1");
  });

  it("parses graph with timestamp", () => {
    const g = TaskGraphSchema.parse({
      dagId: "d1",
      request: "r",
      workspacePath: "/tmp",
      nodes: [node],
      createdAt: new Date().toISOString(),
    });
    expect(g.nodes[0]?.kind).toBe("backend");
  });

  it("rejects bad createdAt", () => {
    expect(() =>
      TaskGraphSchema.parse({
        dagId: "d1",
        request: "r",
        workspacePath: "/tmp",
        nodes: [node],
        createdAt: "not-a-date",
      }),
    ).toThrow();
  });
});

describe("FeatureRequest", () => {
  it("requires non-empty request and workspacePath", () => {
    expect(() => FeatureRequestSchema.parse({ request: "", workspacePath: "/" })).toThrow();
    expect(() => FeatureRequestSchema.parse({ request: "x", workspacePath: "" })).toThrow();
  });
});

describe("ValidationResult", () => {
  it("parses with defaults", () => {
    const r = ValidationResultSchema.parse({ validator: "schema", ok: true, durationMs: 1 });
    expect(r.issues).toEqual([]);
  });
});

describe("DecisionLogEntry", () => {
  it("parses valid entry", () => {
    const e = DecisionLogEntrySchema.parse({
      ts: new Date().toISOString(),
      dagId: "d",
      runId: "r",
      nodeId: "n",
      event: "node.started",
    });
    expect(e.data).toEqual({});
  });

  it("rejects unknown event", () => {
    expect(() =>
      DecisionLogEntrySchema.parse({
        ts: new Date().toISOString(),
        dagId: "d",
        runId: "r",
        nodeId: "n",
        event: "whatever",
      }),
    ).toThrow();
  });
});
