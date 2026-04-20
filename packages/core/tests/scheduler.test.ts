import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TaskGraph } from "@amase/contracts";
import { DAGStore } from "@amase/memory";
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
    for (const n of store.get("d1")!.nodes) expect(n.status).toBe("completed");
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
    const result = store.get("d3")!;
    expect(result.nodes.find((n) => n.id === "a")?.status).toBe("failed");
    expect(result.nodes.find((n) => n.id === "b")?.status).toBeUndefined();
  });
});
