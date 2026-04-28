import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextAssembler } from "../src/context-assembler.js";

async function makeWorkspace(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "amase-ca-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(abs.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
    await writeFile(abs, content);
  }
  return dir;
}

test("build() returns files within budget", async () => {
  const ws = await makeWorkspace({ "src/a.ts": "x".repeat(500), "src/b.ts": "y".repeat(500) });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/"], 1_000);
    const totalBytes = files.reduce((s, f) => s + f.slice.length, 0);
    expect(totalBytes).toBeLessThanOrEqual(1_000);
    expect(files.length).toBeGreaterThan(0);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() returns empty array for empty allowedPaths", async () => {
  const ws = await mkdtemp(join(tmpdir(), "amase-ca-empty-"));
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, [], 16_000);
    expect(files).toHaveLength(0);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() respects budget strictly — stops adding files once full", async () => {
  const ws = await makeWorkspace({
    "src/a.ts": "a".repeat(800),
    "src/b.ts": "b".repeat(800),
    "src/c.ts": "c".repeat(800),
  });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/"], 1_000);
    const totalBytes = files.reduce((s, f) => s + f.slice.length, 0);
    expect(totalBytes).toBeLessThanOrEqual(1_000);
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});

test("build() returns path and slice for each file", async () => {
  const ws = await makeWorkspace({ "src/foo.ts": "export const x = 1;" });
  try {
    const ca = new ContextAssembler();
    const files = await ca.build(ws, ["src/foo.ts"], 16_000);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[0].slice).toContain("export const x = 1;");
  } finally {
    await rm(ws, { recursive: true, force: true });
  }
});
