import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

const EXPECTED_IDS = [
  "add-cli-flag",
  "add-typed-error",
  "add-zod-schema",
  "extract-constant",
  "fix-failing-vitest",
  "handle-null-input",
  "refactor-function",
  "rename-symbol",
];

describe("fixtures", () => {
  it("lists all eight fixtures", async () => {
    const names = await listFixtures();
    for (const id of EXPECTED_IDS) {
      expect(names).toContain(id);
    }
    expect(names.length).toBe(EXPECTED_IDS.length);
  });

  it("loads a fixture with prompt, before tree, expected patch, tests", async () => {
    const fx = await loadFixture("add-zod-schema");
    expect(fx.prompt.length).toBeGreaterThan(10);
    expect(fx.beforeTree.size).toBeGreaterThan(0);
    expect(fx.expectedPatch.length).toBeGreaterThan(0);
    expect(fx.testsDir).toContain("add-zod-schema");
    expect(fx.testsDir).toContain("tests");
  });

  it("loads every fixture successfully", async () => {
    for (const id of EXPECTED_IDS) {
      const fx = await loadFixture(id);
      expect(fx.id).toBe(id);
      expect(fx.prompt.length).toBeGreaterThan(10);
      expect(fx.beforeTree.size).toBeGreaterThan(0);
      expect(fx.expectedPatch.length).toBeGreaterThan(0);
    }
  });
});
