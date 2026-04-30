import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/spawn-command.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../src/spawn-command.js";
import { csharpAdapter } from "../src/adapters/csharp.js";

const mockSpawn = spawnCommand as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

test("csharpAdapter has correct language and extensions", () => {
  expect(csharpAdapter.language).toBe("csharp");
  expect(csharpAdapter.extensions).toContain(".cs");
});

test("csharpAdapter.lint returns ok when files empty", async () => {
  const result = await csharpAdapter.lint([], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).not.toHaveBeenCalled();
});

test("csharpAdapter.lint returns ok when dotnet format --verify-no-changes exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await csharpAdapter.lint(["src/Foo.cs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith(
    "dotnet",
    expect.arrayContaining(["format", "--verify-no-changes"]),
    "/ws",
  );
});

test("csharpAdapter.lint returns failure when dotnet format exits 1", async () => {
  mockSpawn.mockResolvedValue({ code: 1, stdout: "Formatting issues found.\n", stderr: "" });
  const result = await csharpAdapter.lint(["src/Foo.cs"], "/ws");
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
});

test("csharpAdapter.typecheck returns ok when dotnet build exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "Build succeeded.", stderr: "" });
  const result = await csharpAdapter.typecheck(["src/Foo.cs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith(
    "dotnet",
    expect.arrayContaining(["build"]),
    "/ws",
  );
});

test("csharpAdapter.typecheck parses Roslyn error output", async () => {
  mockSpawn.mockResolvedValue({
    code: 1,
    stdout: "src/Foo.cs(10,5): error CS0103: The name 'x' does not exist\n",
    stderr: "",
  });
  const result = await csharpAdapter.typecheck(["src/Foo.cs"], "/ws");
  expect(result.ok).toBe(false);
  expect(result.issues[0]?.file).toBe("src/Foo.cs");
  expect(result.issues[0]?.line).toBe(10);
});

test("csharpAdapter.test returns ok when dotnet test exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "Passed!", stderr: "" });
  const result = await csharpAdapter.test(["src/Foo.cs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith(
    "dotnet",
    expect.arrayContaining(["test"]),
    "/ws",
  );
});
