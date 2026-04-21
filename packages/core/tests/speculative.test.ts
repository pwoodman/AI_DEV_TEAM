import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TaskGraph, TaskNode } from "@amase/contracts";
import { DAGStore } from "@amase/memory";
import { isBlockedByQuestion, runScheduler } from "../src/index.js";

describe("isBlockedByQuestion", () => {
  it("is false when blockedDecisions is empty", () => {
    const n: TaskNode = {
      id: "n1",
      kind: "backend",
      goal: "g",
      dependsOn: [],
      allowedPaths: ["src/"],
      decisionId: "q1",
    };
    expect(isBlockedByQuestion(n, new Set(), new Map([[n.id, n]]))).toBe(false);
  });

  it("returns true when node carries a blocked decisionId", () => {
    const n: TaskNode = {
      id: "n1",
      kind: "backend",
      goal: "g",
      dependsOn: [],
      allowedPaths: ["src/"],
      decisionId: "q1",
    };
    expect(isBlockedByQuestion(n, new Set(["q1"]), new Map([[n.id, n]]))).toBe(true);
  });

  it("returns true transitively via dependsOn", () => {
    const a: TaskNode = {
      id: "a",
      kind: "backend",
      goal: "g",
      dependsOn: [],
      allowedPaths: ["src/"],
      decisionId: "q1",
    };
    const b: TaskNode = {
      id: "b",
      kind: "backend",
      goal: "g",
      dependsOn: ["a"],
      allowedPaths: ["src/"],
    };
    const byId = new Map([
      ["a", a],
      ["b", b],
    ]);
    expect(isBlockedByQuestion(b, new Set(["q1"]), byId)).toBe(true);
  });

  it("returns false for unrelated node", () => {
    const n: TaskNode = {
      id: "n2",
      kind: "backend",
      goal: "g",
      dependsOn: [],
      allowedPaths: ["src/"],
    };
    expect(isBlockedByQuestion(n, new Set(["q1"]), new Map([[n.id, n]]))).toBe(false);
  });
});

describe("scheduler speculative execution", () => {
  it("runs unblocked siblings while a blocked node waits, then picks it up on signal", async () => {
    const graph: TaskGraph = {
      dagId: "spec1",
      request: "r",
      workspacePath: "/tmp",
      createdAt: new Date().toISOString(),
      nodes: [
        {
          id: "n1",
          kind: "backend",
          goal: "blocked",
          dependsOn: [],
          allowedPaths: ["src/"],
          decisionId: "q1",
        },
        { id: "n2", kind: "backend", goal: "unblocked", dependsOn: [], allowedPaths: ["src/"] },
        { id: "n3", kind: "backend", goal: "depends on n2", dependsOn: ["n2"], allowedPaths: ["src/"] },
      ],
    };
    const dir = await mkdtemp(join(tmpdir(), "spec-"));
    const store = new DAGStore();
    await store.put(graph, join(dir, "dag.json"));

    const blocked = new Set<string>(["q1"]);
    const emitter = new EventEmitter();
    const byId = new Map<string, TaskNode>(graph.nodes.map((n) => [n.id, n]));
    const ranBefore: Record<string, boolean> = {};
    const runOrder: string[] = [];

    const schedulerDone = runScheduler(
      "spec1",
      store,
      async (node) => {
        runOrder.push(node.id);
        // record state snapshot as of n2 completion
        if (node.id === "n2") ranBefore["n1-before-n2"] = runOrder.includes("n1");
        await new Promise((r) => setTimeout(r, 10));
        return "completed";
      },
      {
        isBlocked: (n) => isBlockedByQuestion(n, blocked, byId),
        blockedChanged: emitter,
      },
    );

    // Give scheduler time to run n2 and n3 while n1 stays blocked.
    await new Promise((r) => setTimeout(r, 80));
    const snapshot1 = store.get("spec1")!;
    expect(snapshot1.nodes.find((n) => n.id === "n2")?.status).toBe("completed");
    expect(snapshot1.nodes.find((n) => n.id === "n3")?.status).toBe("completed");
    expect(snapshot1.nodes.find((n) => n.id === "n1")?.status).toBeUndefined();

    // Answer the question: unblock and signal.
    blocked.delete("q1");
    emitter.emit("change");

    await schedulerDone;

    const final = store.get("spec1")!;
    expect(final.nodes.find((n) => n.id === "n1")?.status).toBe("completed");
    expect(runOrder).toContain("n1");
    // n1 should have been last (it waited)
    expect(runOrder[runOrder.length - 1]).toBe("n1");
  });
});
