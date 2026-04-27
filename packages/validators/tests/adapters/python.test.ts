import { describe, expect, it } from "vitest";
import { pythonAdapter } from "../../src/adapters/python.js";

describe("pythonAdapter", () => {
  it("has correct language and extensions", () => {
    expect(pythonAdapter.language).toBe("python");
    expect(pythonAdapter.extensions).toContain(".py");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("typecheck returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.typecheck([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("test returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.test([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("all methods return a durationMs", async () => {
    const results = await Promise.all([
      pythonAdapter.lint([], process.cwd()),
      pythonAdapter.typecheck([], process.cwd()),
      pythonAdapter.format([], process.cwd()),
      pythonAdapter.test([], process.cwd()),
    ]);
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
