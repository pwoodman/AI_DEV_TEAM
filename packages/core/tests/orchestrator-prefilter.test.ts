import { expect, test } from "vitest";
import { isSingleFilePath } from "../src/orchestrator.js";

test("isSingleFilePath: single file path returns the path", () => {
  expect(isSingleFilePath(["src/router.ts"])).toBe("src/router.ts");
});

test("isSingleFilePath: directory path (trailing slash, no extension) returns null", () => {
  expect(isSingleFilePath(["src/"])).toBeNull();
});

test("isSingleFilePath: multiple paths returns null", () => {
  expect(isSingleFilePath(["src/router.ts", "src/types.ts"])).toBeNull();
});

test("isSingleFilePath: empty array returns null", () => {
  expect(isSingleFilePath([])).toBeNull();
});
