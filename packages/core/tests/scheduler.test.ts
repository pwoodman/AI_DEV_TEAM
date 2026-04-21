import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskGraph } from "@amase/contracts";
import { DAGStore } from "@amase/memory";
import { describe, expect, it } from "vitest";
import { runScheduler } from "../src/index.js";

async function newStore(graph: TaskGraph) {
  const dir = await mkdtemp(join(tmpdir(), "sched-"));
  const store = new DAGStore();
  await store.put(graph, join(dir, "dag.json"));
  return store;
}

describe("runScheduler", () => {
  it("runs independent nodes concurrently", async () => {
    const graph: TaskGraph = {
      dagId: "d1",
      request: "r",
      workspacePath: "/tmp",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "a", kind: "backend", goal: "a", dependsOn: [], allowedPaths: ["src/"] },
        { id: "b", kind: "backend", goal: "b", dependsOn: [], allowedPaths: ["src/"] },
        { id: "c", kind: "backend", goal: "c", dependsOn: [], allowedPaths: ["src/"] },
      ],
    };
    const store = await newStore(graph);
    let concurrent = 0;
    let peak = 0;
    await runScheduler("d1", store, async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent--;
      return "completed";
    });
    expect(peak).toBeGreaterThan(1);
    const dag = store.get("d1");
    expect(dag).toBeDefined();
    if (!dag) throw new Error("missing DAG d1");
    for (const n of dag.nodes) expect(n.status).toBe("completed");
  });

  it("respects dependsOn ordering", async () => {
    const graph: TaskGraph = {
      dagId: "d2",
      request: "r",
      workspacePath: "/tmp",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "a", kind: "backend", goal: "a", dependsOn: [], allowedPaths: ["src/"] },
        { id: "b", kind: "test-gen", goal: "b", dependsOn: ["a"], allowedPaths: ["src/"] },
      ],
    };
    const store = await newStore(graph);
    const order: string[] = [];
    await runScheduler("d2", store, async (n) => {
      order.push(`start:${n.id}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${n.id}`);
      return "completed";
    });
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("halts dependents when a node fails", async () => {
    const graph: TaskGraph = {
      dagId: "d3",
      request: "r",
      workspacePath: "/tmp",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "a", kind: "backend", goal: "a", dependsOn: [], allowedPaths: ["src/"] },
        { id: "b", kind: "test-gen", goal: "b", dependsOn: ["a"], allowedPaths: ["src/"] },
      ],
    };
    const store = await newStore(graph);
    await runScheduler("d3", store, async (n) => (n.id === "a" ? "failed" : "completed"));
    const result = store.get("d3");
    expect(result).toBeDefined();
    if (!result) throw new Error("missing DAG d3");
    expect(result.nodes.find((n) => n.id === "a")?.status).toBe("failed");
    expect(result.nodes.find((n) => n.id === "b")?.status).toBeUndefined();
  });

  it("split pools: agent-heavy work does not starve validator work", async () => {
    // 6 agent nodes + 3 validator nodes, all independent. With a single pool of
    // 2, validators would queue behind agents. With split pools {agent:2,
    // validator:2}, validators run in parallel with agents and finish early.
    const nodes = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `a${i}`,
        kind: "backend" as const,
        goal: "a",
        dependsOn: [],
        allowedPaths: ["src/"],
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `v${i}`,
        kind: "qa" as const,
        goal: "v",
        dependsOn: [],
        allowedPaths: ["src/"],
      })),
    ];
    const graph: TaskGraph = {
      dagId: "dpool",
      request: "r",
      workspacePath: "/tmp",
      createdAt: new Date().toISOString(),
      nodes,
    };
    const store = await newStore(graph);

    let agentConcurrent = 0;
    let validatorConcurrent = 0;
    let peakAgent = 0;
    let peakValidator = 0;
    let peakOverlap = 0;
    const firstValidatorFinish: { t?: number } = {};
    const lastAgentFinish: { t?: number } = {};
    const start = Date.now();

    await runScheduler(
      "dpool",
      store,
      async (n) => {
        const isAgent = n.id.startsWith("a");
        if (isAgent) {
          agentConcurrent++;
          peakAgent = Math.max(peakAgent, agentConcurrent);
        } else {
          validatorConcurrent++;
          peakValidator = Math.max(peakValidator, validatorConcurrent);
        }
        peakOverlap = Math.max(peakOverlap, agentConcurrent + validatorConcurrent);
        await new Promise((r) => setTimeout(r, isAgent ? 40 : 20));
        if (isAgent) {
          agentConcurrent--;
          lastAgentFinish.t = Date.now() - start;
        } else {
          validatorConcurrent--;
          if (firstValidatorFinish.t === undefined) firstValidatorFinish.t = Date.now() - start;
        }
        return "completed";
      },
      { pools: { agent: 2, validator: 2 } },
    );

    expect(peakAgent).toBeGreaterThanOrEqual(2);
    expect(peakValidator).toBeGreaterThanOrEqual(2);
    // Critical fairness claim: pools run in parallel, not serially.
    expect(peakOverlap).toBeGreaterThan(2);
    // A validator finishes before the last agent (would be impossible with
    // a single pool of 2 since agents would keep the pool saturated).
    expect(firstValidatorFinish.t ?? Infinity).toBeLessThan(lastAgentFinish.t ?? 0);
  });
});
