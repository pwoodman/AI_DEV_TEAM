import { describe, expect, it } from "vitest";
import { diffSimilarity } from "../src/diff-similarity.js";

describe("diffSimilarity", () => {
  it("returns 1.0 for identical patches", () => {
    const p = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n";
    expect(diffSimilarity(p, p)).toBe(1);
  });
  it("returns <1 for differing patches", () => {
    const a = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n";
    const b = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+different\n";
    const s = diffSimilarity(a, b);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
  it("returns 0 when inputs share nothing", () => {
    expect(diffSimilarity("abc", "xyz")).toBeLessThan(0.2);
  });
});
