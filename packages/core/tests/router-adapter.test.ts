import { expect, test } from "vitest";
import type { TaskNode } from "@amase/contracts";
import { routeNode } from "../src/router.js";

// @amase/validators auto-registers typescript, python, and go adapters at
// module-load time via its index.ts side effect — no manual beforeAll needed.

function makeNode(kind: string, language = "typescript"): TaskNode {
  return {
    id: "n1",
    kind: kind as TaskNode["kind"],
    goal: "do something",
    allowedPaths: ["src/"],
    dependsOn: [],
    language: language as TaskNode["language"],
  };
}

test("routeNode attaches typescript adapter for typescript language", () => {
  const result = routeNode(makeNode("backend", "typescript"));
  expect(result.adapter).not.toBeNull();
  expect(result.adapter?.language).toBe("typescript");
});

test("routeNode returns adapter null for unknown language", () => {
  const result = routeNode(makeNode("backend", "cobol"));
  expect(result.adapter).toBeNull();
});

test("routeNode returns adapter null for skip", () => {
  const result = routeNode(makeNode("frontend"), { skipFrontend: true });
  expect(result.adapter).toBeNull();
});
