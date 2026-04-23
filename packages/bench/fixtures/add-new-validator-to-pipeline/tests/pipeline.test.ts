import { expect, test } from "vitest";
import { runPipeline } from "../src/pipeline.js";
import { defaultValidators } from "../src/validators/registry.js";

test("clean patch passes all validators", () => {
  const result = runPipeline(defaultValidators, {
    path: "src/foo.ts",
    content: "export const x = 1;",
  });
  expect(result).toEqual({ ok: true });
});

test("patch with ': any' is rejected with reason containing 'no-any'", () => {
  const result = runPipeline(defaultValidators, {
    path: "src/foo.ts",
    content: "export const x: any = 1;",
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toContain("no-any");
  }
});

test("schema validator runs first: empty path returns schema reason even if content has ': any'", () => {
  const result = runPipeline(defaultValidators, {
    path: "",
    content: "export const x: any = 1;",
  });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toContain("schema");
    expect(result.reason).not.toContain("no-any");
  }
});
