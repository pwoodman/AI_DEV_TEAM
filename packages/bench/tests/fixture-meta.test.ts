import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

describe("fixture meta & coverage", () => {
  it("has exactly 5 micro + 5 medium + 3 large fixtures", async () => {
    const ids = await listFixtures();
    const metas = await Promise.all(ids.map(async (id) => (await loadFixture(id)).meta));
    const counts = { micro: 0, medium: 0, large: 0 };
    for (const m of metas) counts[m.category] += 1;
    expect(counts).toEqual({ micro: 5, medium: 5, large: 3 });
  });

  it("every fixture declares a supported language", async () => {
    const supported = new Set([
      "ts",
      "js",
      "py",
      "go",
      "rust",
      "java",
      "csharp",
      "cpp",
      "c",
      "ruby",
      "php",
      "swift",
      "kotlin",
    ]);
    for (const id of await listFixtures()) {
      const fx = await loadFixture(id);
      expect(supported.has(fx.meta.language)).toBe(true);
    }
  });
});
