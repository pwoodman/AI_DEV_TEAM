import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/spawn-command.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../src/spawn-command.js";
import { javaAdapter } from "../src/adapters/java.js";

const mockSpawn = spawnCommand as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

test("javaAdapter has correct language and extensions", () => {
  expect(javaAdapter.language).toBe("java");
  expect(javaAdapter.extensions).toContain(".java");
});

test("javaAdapter.lint returns ok when files empty", async () => {
  const result = await javaAdapter.lint([], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).not.toHaveBeenCalled();
});

test("javaAdapter.lint returns ok when mvn checkstyle exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await javaAdapter.lint(["src/Foo.java"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("mvn", expect.arrayContaining(["checkstyle:check"]), "/ws");
});

test("javaAdapter.lint returns failure when mvn checkstyle exits 1", async () => {
  mockSpawn.mockResolvedValue({
    code: 1,
    stdout: "[ERROR] src/Foo.java:[10,5] (blocks) LeftCurly: '{' should be on previous line.\n",
    stderr: "",
  });
  const result = await javaAdapter.lint(["src/Foo.java"], "/ws");
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
});

test("javaAdapter.typecheck returns ok when mvn compile exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await javaAdapter.typecheck(["src/Foo.java"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("mvn", expect.arrayContaining(["compile"]), "/ws");
});

test("javaAdapter.test returns ok when mvn test exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "BUILD SUCCESS", stderr: "" });
  const result = await javaAdapter.test(["src/Foo.java"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("mvn", expect.arrayContaining(["test"]), "/ws");
});
