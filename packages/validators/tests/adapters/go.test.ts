import { describe, expect, it } from "vitest";
import { goAdapter } from "../../src/adapters/go.js";

describe("goAdapter", () => {
  it("has correct language and extensions", () => {
    expect(goAdapter.language).toBe("go");
    expect(goAdapter.extensions).toContain(".go");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await goAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("typecheck returns ok:true for empty file list", async () => {
    const result = await goAdapter.typecheck([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await goAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("test returns ok:true for empty file list", async () => {
    const result = await goAdapter.test([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("all methods return a durationMs", async () => {
    const results = await Promise.all([
      goAdapter.lint([], process.cwd()),
      goAdapter.typecheck([], process.cwd()),
      goAdapter.format([], process.cwd()),
      goAdapter.test([], process.cwd()),
    ]);
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
