import { expect, test } from "vitest";
import type { TaskNode } from "@amase/contracts";
import { routeNodeWithMode } from "../src/router.js";

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

test("baseline: backend returns full validator list and 16000 budget", () => {
  const result = routeNodeWithMode(makeNode("backend"), {}, "baseline");
  expect(result.agent).toBe("backend");
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("schema");
  expect(result.allowedValidators).toContain("lang-adapter");
  expect(result.allowedValidators).toContain("ui-tests");
  expect(result.allowedValidators).toContain("security");
});

test("option-a: frontend gets 8000 budget and no security/ui-tests", () => {
  const result = routeNodeWithMode(makeNode("frontend"), {}, "option-a");
  expect(result.agent).toBe("frontend");
  expect(result.contextBudget).toBe(8_000);
  expect(result.allowedValidators).not.toContain("security");
  expect(result.allowedValidators).not.toContain("ui-tests");
  expect(result.allowedValidators).toContain("lang-adapter");
});

test("option-a: backend gets 16000 budget and includes security", () => {
  const result = routeNodeWithMode(makeNode("backend"), {}, "option-a");
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("security");
});

test("option-a: refactor gets 28000 budget", () => {
  const result = routeNodeWithMode(makeNode("refactor"), {}, "option-a");
  expect(result.contextBudget).toBe(28_000);
});

test("option-a: qa gets schema+patch-safety only", () => {
  const result = routeNodeWithMode(makeNode("qa"), {}, "option-a");
  expect(result.allowedValidators).toEqual(["schema", "patch-safety"]);
});

test("option-a: non-TS language drops ui-tests from ui-test node", () => {
  const result = routeNodeWithMode(makeNode("ui-test", "python"), {}, "option-a");
  expect(result.allowedValidators).not.toContain("ui-tests");
});

test("option-a: skip opts return skip agent with empty validators", () => {
  const result = routeNodeWithMode(makeNode("frontend"), { skipFrontend: true }, "option-a");
  expect(result.agent).toBe("skip");
  expect(result.contextBudget).toBe(0);
  expect(result.allowedValidators).toHaveLength(0);
});

test("option-b: same budgets and validators as option-a", () => {
  const result = routeNodeWithMode(makeNode("backend"), {}, "option-b");
  expect(result.contextBudget).toBe(16_000);
  expect(result.allowedValidators).toContain("security");
});

test("option-c: backend gets 4000 bytes (1000 tokens x 4)", () => {
  const result = routeNodeWithMode(makeNode("backend"), {}, "option-c");
  expect(result.contextBudget).toBe(4_000);
});

test("option-c: refactor gets 7200 bytes (1800 tokens x 4)", () => {
  const result = routeNodeWithMode(makeNode("refactor"), {}, "option-c");
  expect(result.contextBudget).toBe(7_200);
});
