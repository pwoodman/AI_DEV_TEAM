import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentRegistry } from "../packages/agents/dist/index.js";
import { Orchestrator } from "../packages/core/dist/index.js";
import { StubLlmClient } from "../packages/llm/dist/index.js";
import { DAGStore, DecisionLog, runPaths } from "../packages/memory/dist/index.js";
import { patchSafetyValidator, schemaValidator } from "../packages/validators/dist/index.js";

const workspacePath = await mkdtemp(join(tmpdir(), "amase-smoke-"));
console.log("workspace:", workspacePath);

const responder = (req) => {
  const isArchitect = req.system.includes("Architect Agent");
  if (isArchitect) {
    const graph = {
      dagId: "will-be-overwritten",
      request: "add health endpoint",
      workspacePath,
      createdAt: new Date().toISOString(),
      nodes: [
        {
          id: "n1",
          kind: "backend",
          goal: "add /health returning 200 OK",
          dependsOn: [],
          allowedPaths: ["src/"],
        },
        {
          id: "n2",
          kind: "test-gen",
          goal: "unit test for /health",
          dependsOn: ["n1"],
          allowedPaths: ["src/"],
        },
      ],
    };
    return JSON.stringify({
      taskId: "bootstrap",
      patches: [{ path: ".amase/task-graph.json", op: "create", content: JSON.stringify(graph) }],
      notes: "decomposed",
    });
  }
  // Backend + test-gen stub responses
  const goalLine = req.user.match(/"goal":\s*"([^"]+)"/)?.[1] ?? "";
  const file = goalLine.includes("unit test") ? "src/health.test.ts" : "src/health.ts";
  return JSON.stringify({
    taskId: "t",
    patches: [
      {
        path: file,
        op: "create",
        content: `// ${goalLine}\nexport const health = () => ({ status: 'ok' });\n`,
      },
    ],
    notes: "stub patch",
  });
};

const llm = new StubLlmClient(responder);
const agents = buildAgentRegistry(llm);
const store = new DAGStore();
const orchestrator = new Orchestrator({
  agents,
  validators: [schemaValidator, patchSafetyValidator],
  store,
  makeDecisionLog: (p) => new DecisionLog(p),
});

const { dagId, graph } = await orchestrator.plan({
  request: "add /health endpoint with test",
  workspacePath,
});
console.log("planned:", dagId, graph.nodes.map((n) => `${n.id}[${n.kind}]`).join(", "));

const { runId } = await orchestrator.execute(dagId);
console.log("ran:", runId);

const final = store.get(dagId);
console.log("nodes:", final.nodes.map((n) => `${n.id}:${n.status}`).join(", "));

const decisions = await readFile(runPaths(workspacePath, dagId).decisions, "utf8");
const events = decisions
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l).event);
console.log("events:", events.join(" -> "));
