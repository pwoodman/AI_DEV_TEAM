import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

describe("fixtures", () => {
  it("lists at least two fixtures", async () => {
    const names = await listFixtures();
    expect(names).toContain("add-zod-schema");
    expect(names).toContain("fix-failing-vitest");
  });

  it("loads a fixture with prompt, before tree, expected patch, tests", async () => {
    const fx = await loadFixture("add-zod-schema");
    expect(fx.prompt.length).toBeGreaterThan(10);
    expect(fx.beforeTree.size).toBeGreaterThan(0);
    expect(fx.expectedPatch.length).toBeGreaterThan(0);
    expect(fx.testsDir).toContain("add-zod-schema");
    expect(fx.testsDir).toContain("tests");
  });
});
