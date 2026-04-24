import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInput, TaskGraph } from "@amase/contracts";
import { DAGStore, DecisionLog } from "@amase/memory";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../src/index.js";

function makeGraph(workspacePath: string, allowedPaths: string[]): TaskGraph {
  return {
    dagId: "placeholder",
    request: "do thing",
    workspacePath,
    createdAt: new Date().toISOString(),
    nodes: [
      {
        id: "n1",
        kind: "backend",
        goal: "implement",
        dependsOn: [],
        allowedPaths,
      },
    ],
  };
}

function makeOrchestrator(
  graphFactory: () => TaskGraph,
  onBackendRun?: (input: AgentInput) => void,
): Orchestrator {
  const architect = {
    run: async (input: AgentInput) => {
      const graph = graphFactory();
      return {
        output: {
          taskId: input.taskId,
          patches: [
            {
              path: ".amase/task-graph.json",
              op: "create" as const,
              content: JSON.stringify(graph),
            },
          ],
          notes: "plan",
        },
      };
    },
  };

  const backend = {
    run: async (input: AgentInput) => {
      onBackendRun?.(input);
      return {
        output: {
          taskId: input.taskId,
          patches: [],
          notes: "ok",
        },
        metrics: {
          taskId: input.taskId,
          kind: "backend" as const,
          tokensIn: 1,
          tokensOut: 1,
          durationMs: 1,
          model: "stub",
        },
      };
    },
  };

  const agents = {
    architect,
    backend,
    frontend: backend,
    refactor: backend,
    "test-gen": backend,
    qa: backend,
    "ui-test": backend,
    security: backend,
    deployment: backend,
  } as unknown as Record<string, never>;

  return new Orchestrator({
    agents: agents as never,
    validators: [],
    store: new DAGStore(),
    makeDecisionLog: (p) => new DecisionLog(p),
    deploymentReadiness: false,
  });
}

describe("Orchestrator planning and context scoping", () => {
  it("repairs empty allowedPaths using workspace defaults", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "amase-plan-"));
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(workspace, "package.json"), '{"name":"x"}\n', "utf8");

    const orchestrator = makeOrchestrator(() => makeGraph(workspace, []));
    const { graph } = await orchestrator.plan({
      request: "add endpoint",
      workspacePath: workspace,
    });
    expect(graph.nodes[0]?.allowedPaths.length).toBeGreaterThan(0);
    expect(graph.nodes[0]?.allowedPaths).toContain("src/");
  });

  it("loads context files from node.allowedPaths (not full workspace)", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "amase-scope-"));
    await mkdir(join(workspace, "src"), { recursive: true });
    await mkdir(join(workspace, "docs"), { recursive: true });
    await writeFile(join(workspace, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(join(workspace, "docs", "guide.md"), "# not code\n", "utf8");

    let seenPaths: string[] = [];
    const orchestrator = makeOrchestrator(
      () => makeGraph(workspace, ["src/"]),
      (input) => {
        seenPaths = input.context.files.map((f) => f.path);
      },
    );

    const { dagId } = await orchestrator.plan({
      request: "touch src only",
      workspacePath: workspace,
    });
    await orchestrator.execute(dagId);

    expect(seenPaths).toContain("src/a.ts");
    expect(seenPaths).not.toContain("docs/guide.md");
  });
});
