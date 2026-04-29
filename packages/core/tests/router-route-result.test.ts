import { expect, test } from "vitest";
import type { TaskNode } from "@amase/contracts";
import { routeNode } from "../src/router.js";

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

test("frontend gets 8000 budget, ui-tests, no security", () => {
  const result = routeNode(makeNode("frontend"));
  expect(result.agent).toBe("frontend");
  expect(result.contextBudget).toBe(8_000);
  expect(result.allowedValidators).not.toContain("security");
  expect(result.allowedValidators).toContain("ui-tests");
  expect(result.allowedValidators).toContain("lang-adapter");
});

test("backend gets 16000 budget and includes security", () => {
  const result = routeNode(makeNode("backend"));
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("security");
  expect(result.allowedValidators).toContain("schema");
  expect(result.allowedValidators).toContain("lang-adapter");
});

test("refactor gets 28000 budget", () => {
  const result = routeNode(makeNode("refactor"));
  expect(result.contextBudget).toBe(28_000);
});

test("qa gets schema+patch-safety only", () => {
  const result = routeNode(makeNode("qa"));
  expect(result.allowedValidators).toEqual(["schema", "patch-safety"]);
});

test("non-TS language drops ui-tests", () => {
  const result = routeNode(makeNode("ui-test", "python"));
  expect(result.allowedValidators).not.toContain("ui-tests");
});

test("skip opts return skip agent with zero budget and empty validators", () => {
  const result = routeNode(makeNode("frontend"), { skipFrontend: true });
  expect(result.agent).toBe("skip");
  expect(result.contextBudget).toBe(0);
  expect(result.allowedValidators).toHaveLength(0);
});
