import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../src/spawn-command.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../src/spawn-command.js";
import { rustAdapter } from "../src/adapters/rust.js";

const mockSpawn = spawnCommand as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

test("rustAdapter has correct language and extensions", () => {
  expect(rustAdapter.language).toBe("rust");
  expect(rustAdapter.extensions).toContain(".rs");
});

test("rustAdapter.lint returns ok when files empty", async () => {
  const result = await rustAdapter.lint([], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).not.toHaveBeenCalled();
});

test("rustAdapter.lint returns ok when cargo clippy exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await rustAdapter.lint(["src/main.rs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("cargo", expect.arrayContaining(["clippy"]), "/ws");
});

test("rustAdapter.lint returns failure when cargo clippy exits 1", async () => {
  mockSpawn.mockResolvedValue({ code: 1, stdout: "error[E0001]: msg\n --> src/main.rs:5:1", stderr: "" });
  const result = await rustAdapter.lint(["src/main.rs"], "/ws");
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
});

test("rustAdapter.typecheck returns ok when cargo check exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await rustAdapter.typecheck(["src/main.rs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("cargo", expect.arrayContaining(["check"]), "/ws");
});

test("rustAdapter.test returns ok when cargo test exits 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "test result: ok.", stderr: "" });
  const result = await rustAdapter.test(["src/main.rs"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("cargo", expect.arrayContaining(["test"]), "/ws");
});
