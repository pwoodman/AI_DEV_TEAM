import { Orchestrator } from "@amase/core";
import { DAGStore, DecisionLog } from "@amase/memory";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerQuestionTools } from "../src/question-tools.js";

describe("registerQuestionTools", () => {
  it("registers amase_clarify and amase_answer tools on the server", () => {
    const orchestrator = new Orchestrator({
      agents: {} as never,
      validators: [],
      store: new DAGStore(),
      makeDecisionLog: (p) => new DecisionLog(p),
    });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const registered: string[] = [];
    const originalTool = server.tool.bind(server);
    // Spy on registration by delegating to the real method but recording name.
    (server as unknown as { tool: typeof server.tool }).tool = ((
      name: string,
      ...rest: unknown[]
    ) => {
      registered.push(name);
      return (originalTool as unknown as (...args: unknown[]) => unknown)(name, ...rest);
    }) as unknown as typeof server.tool;

    registerQuestionTools(server, orchestrator);

    expect(registered).toContain("amase_clarify");
    expect(registered).toContain("amase_answer");
  });
});
