import type { AgentInput } from "@amase/contracts";
import { StubLlmClient } from "@amase/llm";
import { describe, expect, it } from "vitest";
import { BackendAgent, buildAgentRegistry } from "../src/index.js";

const input: AgentInput = {
  taskId: "t1",
  kind: "backend",
  goal: "add health",
  context: { files: [] },
  constraints: { maxTokens: 1024, timeoutMs: 10_000, allowedPaths: ["src/"] },
};

describe("BaseAgent.run", () => {
  it("extracts JSON from fenced code block", async () => {
    const llm = new StubLlmClient(
      () =>
        `Sure.\n\`\`\`json\n${JSON.stringify({
          taskId: "t1",
          patches: [{ path: "src/a.ts", op: "create", content: "x" }],
          notes: "ok",
        })}\n\`\`\``,
    );
    const agent = new BackendAgent(llm);
    const { output, metrics } = await agent.run(input);
    expect(output.patches[0]?.path).toBe("src/a.ts");
    expect(metrics.kind).toBe("backend");
  });

  it("extracts JSON without fence", async () => {
    const llm = new StubLlmClient(() =>
      JSON.stringify({
        taskId: "t1",
        patches: [],
        notes: "bare",
      }),
    );
    const { output } = await new BackendAgent(llm).run(input);
    expect(output.notes).toBe("bare");
  });

  it("injects taskId if missing in response", async () => {
    const llm = new StubLlmClient(() => JSON.stringify({ patches: [], notes: "no-id" }));
    const { output } = await new BackendAgent(llm).run(input);
    expect(output.taskId).toBe("t1");
  });

  it("rejects output failing schema validation", async () => {
    const llm = new StubLlmClient(() =>
      JSON.stringify({
        taskId: "t1",
        patches: [{ path: "", op: "create", content: "" }],
        notes: "x",
      }),
    );
    await expect(new BackendAgent(llm).run(input)).rejects.toThrow();
  });

  it("rejects invalid input", async () => {
    const llm = new StubLlmClient(() => "{}");
    const agent = new BackendAgent(llm);
    await expect(
      agent.run({ ...input, constraints: { ...input.constraints, allowedPaths: [] } }),
    ).rejects.toThrow();
  });
});

describe("buildAgentRegistry", () => {
  it("returns all agent kinds", () => {
    const llm = new StubLlmClient(() => "{}");
    const reg = buildAgentRegistry(llm);
    expect(Object.keys(reg).sort()).toEqual(
      [
        "architect",
        "backend",
        "deployment",
        "frontend",
        "qa",
        "refactor",
        "security",
        "test-gen",
        "ui-test",
      ].sort(),
    );
  });
});
