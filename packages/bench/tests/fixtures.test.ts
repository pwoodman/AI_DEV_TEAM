import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

const EXPECTED_IDS = [
  "add-audit-log",
  "add-cli-flag",
  "add-cli-subcommand",
  "add-http-endpoint",
  "add-new-validator-to-pipeline",
  "add-pagination-to-list-endpoint",
  "add-typed-error",
  "add-validated-endpoint-with-zod",
  "add-zod-schema",
  "build-rate-limiter-middleware",
  "fix-failing-vitest",
  "handle-null-input",
  "migrate-component-prop-shape",
  "rename-package-export",
];

describe("fixtures", () => {
  it("lists all curated fixtures", async () => {
    const names = await listFixtures();
    expect(names).toEqual(EXPECTED_IDS);
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
