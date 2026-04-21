import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPatches, ensureSandbox } from "../src/index.js";

describe("applyPatches", () => {
  it("creates files including nested directories", async () => {
    const ws = await mkdtemp(join(tmpdir(), "sbx-"));
    await ensureSandbox(ws);
    await applyPatches(ws, [{ path: "src/nested/a.ts", op: "create", content: "A" }]);
    expect(await readFile(join(ws, "src/nested/a.ts"), "utf8")).toBe("A");
  });

  it("modifies files", async () => {
    const ws = await mkdtemp(join(tmpdir(), "sbx-"));
    await ensureSandbox(ws);
    await writeFile(join(ws, "a.ts"), "old", "utf8");
    await applyPatches(ws, [{ path: "a.ts", op: "modify", content: "new" }]);
    expect(await readFile(join(ws, "a.ts"), "utf8")).toBe("new");
  });

  it("deletes files; missing deletes are silent", async () => {
    const ws = await mkdtemp(join(tmpdir(), "sbx-"));
    await ensureSandbox(ws);
    await writeFile(join(ws, "a.ts"), "x", "utf8");
    await applyPatches(ws, [
      { path: "a.ts", op: "delete", content: "" },
      { path: "never.ts", op: "delete", content: "" },
    ]);
    await expect(readFile(join(ws, "a.ts"), "utf8")).rejects.toThrow();
  });
});
