import { beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../src/spawn-command.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../src/spawn-command.js";
import { nextjsAdapter } from "../src/adapters/nextjs.js";
import { detectWorkspaceFramework } from "../src/language-detector.js";

const mockSpawn = spawnCommand as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

// --- Adapter ---

test("nextjsAdapter has correct language", () => {
  expect(nextjsAdapter.language).toBe("nextjs");
});

test("nextjsAdapter.lint returns ok when files empty", async () => {
  const result = await nextjsAdapter.lint([], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).not.toHaveBeenCalled();
});

test("nextjsAdapter.lint calls next lint and returns ok on exit 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await nextjsAdapter.lint(["src/app/page.tsx"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("npx", expect.arrayContaining(["next", "lint"]), "/ws");
});

test("nextjsAdapter.lint returns failure on exit 1", async () => {
  mockSpawn.mockResolvedValue({ code: 1, stdout: "./src/page.tsx\n  1:1  error  no-unused-vars", stderr: "" });
  const result = await nextjsAdapter.lint(["src/page.tsx"], "/ws");
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
});

test("nextjsAdapter.typecheck calls tsc --noEmit and returns ok on exit 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  const result = await nextjsAdapter.typecheck(["src/page.tsx"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("npx", expect.arrayContaining(["tsc", "--noEmit"]), "/ws");
});

test("nextjsAdapter.test calls vitest and returns ok on exit 0", async () => {
  mockSpawn.mockResolvedValue({ code: 0, stdout: "✓ all tests passed", stderr: "" });
  const result = await nextjsAdapter.test(["src/page.tsx"], "/ws");
  expect(result.ok).toBe(true);
  expect(mockSpawn).toHaveBeenCalledWith("npx", expect.arrayContaining(["vitest", "run"]), "/ws");
});

// --- detectWorkspaceFramework ---

test("detectWorkspaceFramework returns 'nextjs' when next.config.js exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "amase-test-"));
  try {
    await writeFile(join(dir, "next.config.js"), "module.exports = {}");
    const result = await detectWorkspaceFramework(dir);
    expect(result).toBe("nextjs");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("detectWorkspaceFramework returns 'nextjs' when next.config.ts exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "amase-test-"));
  try {
    await writeFile(join(dir, "next.config.ts"), "export default {}");
    const result = await detectWorkspaceFramework(dir);
    expect(result).toBe("nextjs");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("detectWorkspaceFramework returns null when no config file found", async () => {
  const dir = await mkdtemp(join(tmpdir(), "amase-test-"));
  try {
    const result = await detectWorkspaceFramework(dir);
    expect(result).toBeNull();
  } finally {
    await rm(dir, { recursive: true });
  }
});
