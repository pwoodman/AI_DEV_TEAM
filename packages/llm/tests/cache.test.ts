import { describe, expect, it } from "vitest";
import { buildCachedSystem } from "../src/cache.js";

describe("buildCachedSystem", () => {
  it("produces ephemeral cache_control on each block", () => {
    const blocks = buildCachedSystem([{ text: "a" }, { text: "b" }]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" });
  });
  it("omits cache_control when cacheable: false", () => {
    const blocks = buildCachedSystem([{ text: "a", cacheable: false }]);
    expect(blocks[0].cache_control).toBeUndefined();
  });
});
