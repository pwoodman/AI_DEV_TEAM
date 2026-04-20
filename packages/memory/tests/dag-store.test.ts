import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { TaskGraph } from "@amase/contracts";
import { DAGStore } from "../src/index.js";

function graph(overrides: Partial<TaskGraph> = {}): TaskGraph {
  return {
    dagId: "d1",
    request: "r",
    workspacePath: "/tmp",
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "n1", kind: "backend", goal: "a", dependsOn: [], allowedPaths: ["src/"] },
      { id: "n2", kind: "test-gen", goal: "b", dependsOn: ["n1"], allowedPaths: ["src/"] },
    ],
    ...overrides,
  };
}

describe("DAGStore", () => {
  let store: DAGStore;
  let snap: string;

  beforeEach(async () => {
    store = new DAGStore();
    const dir = await mkdtemp(join(tmpdir(), "dag-"));
    snap = join(dir, "dag.json");
  });

  it("stores a graph and writes snapshot", async () => {
    await store.put(graph(), snap);
    expect(store.get("d1")?.nodes).toHaveLength(2);
    const text = await readFile(snap, "utf8");
    expect(JSON.parse(text).dagId).toBe("d1");
  });

  it("readyNodes returns only nodes without pending deps", async () => {
    await store.put(graph(), snap);
    expect(store.readyNodes("d1").map((n) => n.id)).toEqual(["n1"]);
    await store.updateNode("d1", "n1", { status: "completed" });
    expect(store.readyNodes("d1").map((n) => n.id)).toEqual(["n2"]);
  });

  it("does not return nodes already running", async () => {
    await store.put(graph(), snap);
    await store.updateNode("d1", "n1", { status: "running" });
    expect(store.readyNodes("d1")).toEqual([]);
  });

  it("throws on unknown node/dag", async () => {
    await expect(store.updateNode("missing", "n1", { status: "completed" })).rejects.toThrow();
    await store.put(graph(), snap);
    await expect(store.updateNode("d1", "nope", { status: "completed" })).rejects.toThrow();
  });

  it("skipped deps count as satisfied", async () => {
    await store.put(graph(), snap);
    await store.updateNode("d1", "n1", { status: "skipped" });
    expect(store.readyNodes("d1").map((n) => n.id)).toEqual(["n2"]);
  });
});
