import { describe, expect, it } from "vitest";
import { typescriptAdapter } from "../../src/adapters/typescript.js";

describe("typescriptAdapter", () => {
  it("has correct language and extensions", () => {
    expect(typescriptAdapter.language).toBe("typescript");
    expect(typescriptAdapter.extensions).toContain(".ts");
    expect(typescriptAdapter.extensions).toContain(".tsx");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await typescriptAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await typescriptAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("lint result has a durationMs", async () => {
    const result = await typescriptAdapter.lint([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("typecheck result has a durationMs", async () => {
    const result = await typescriptAdapter.typecheck([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("test result has a durationMs", async () => {
    const result = await typescriptAdapter.test([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
