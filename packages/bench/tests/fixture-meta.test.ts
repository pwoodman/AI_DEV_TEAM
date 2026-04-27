import { describe, expect, it } from "vitest";
import { listFixtures, loadFixture } from "../src/fixtures.js";

describe("fixture meta & coverage", () => {
  it("has exactly 5 micro + 5 medium + 6 large + 2 xl fixtures", async () => {
    const ids = await listFixtures();
    const metas = await Promise.all(ids.map(async (id) => (await loadFixture(id)).meta));
    const counts = { micro: 0, medium: 0, large: 0, xl: 0 };
    for (const m of metas) {
      const cat = m.category as keyof typeof counts;
      counts[cat] += 1;
    }
    expect(counts).toEqual({ micro: 5, medium: 5, large: 6, xl: 2 });
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
