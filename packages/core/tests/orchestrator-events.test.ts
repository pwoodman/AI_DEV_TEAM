import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildAgentRegistry } from "@amase/agents";
import { StubLlmClient } from "@amase/llm";
import { DecisionLog, DAGStore } from "@amase/memory";
import { schemaValidator, patchSafetyValidator } from "@amase/validators";
import { Orchestrator } from "../src/orchestrator.js";

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "amase-events-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "stub.ts"), "export const x = 1;\n");
  return dir;
}

test("execute emits run.started and run.completed", async () => {
  const workspace = await makeWorkspace();
  const llm = new StubLlmClient(async () =>
    JSON.stringify({
      taskId: "t",
      patches: [{ path: "src/out.ts", op: "create", content: "export const y = 2;\n" }],
      notes: "stub",
    })
  );
  const agents = buildAgentRegistry(llm);
  const store = new DAGStore();
  let capturedLogPath = "";
  const orch = new Orchestrator({
    agents,
    validators: [schemaValidator, patchSafetyValidator],
    store,
    makeDecisionLog: (p) => {
      capturedLogPath = p;
      return new DecisionLog(p);
    },
    deploymentReadiness: false,
  });

  const { dagId } = await orch.plan({ request: "add a constant y", workspacePath: workspace });
  await orch.execute(dagId, {});

  const raw = await readFile(capturedLogPath, "utf8");
  const events = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { event: string });
  const eventTypes = events.map((e) => e.event);

  expect(eventTypes).toContain("run.started");
  expect(eventTypes).toContain("run.completed");
}, 30_000);
