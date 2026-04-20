import { describe, expect, it } from "vitest";
import type { TaskNode } from "@amase/contracts";
import { routeNode } from "../src/index.js";

function node(kind: TaskNode["kind"]): TaskNode {
  return { id: "n", kind, goal: "g", dependsOn: [], allowedPaths: ["src/"] };
}

describe("routeNode", () => {
  it("defaults to node.kind when no opts", () => {
    for (const k of ["backend", "frontend", "refactor", "test-gen", "qa", "ui-test"] as const) {
      expect(routeNode(node(k))).toBe(k);
    }
  });

  it("skipFrontend skips frontend + ui-test", () => {
    expect(routeNode(node("frontend"), { skipFrontend: true })).toBe("skip");
    expect(routeNode(node("ui-test"), { skipFrontend: true })).toBe("skip");
    expect(routeNode(node("backend"), { skipFrontend: true })).toBe("backend");
  });

  it("skipBackend skips backend only", () => {
    expect(routeNode(node("backend"), { skipBackend: true })).toBe("skip");
    expect(routeNode(node("frontend"), { skipBackend: true })).toBe("frontend");
  });

  it("refactorOnly keeps refactor + qa", () => {
    expect(routeNode(node("refactor"), { refactorOnly: true })).toBe("refactor");
    expect(routeNode(node("qa"), { refactorOnly: true })).toBe("qa");
    expect(routeNode(node("backend"), { refactorOnly: true })).toBe("skip");
    expect(routeNode(node("frontend"), { refactorOnly: true })).toBe("skip");
  });
});
