import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export interface Fixture {
  id: string;
  prompt: string;
  beforeTree: Map<string, string>;
  expectedPatch: string;
  testsDir: string;
}

export async function listFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readTree(root: string, acc = new Map<string, string>(), rel = ""): Promise<Map<string, string>> {
  const entries = await readdir(join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await readTree(root, acc, relPath);
    else acc.set(relPath, await readFile(join(root, relPath), "utf8"));
  }
  return acc;
}

export async function loadFixture(id: string): Promise<Fixture> {
  const dir = join(FIXTURES_DIR, id);
  await stat(dir);
  const prompt = await readFile(join(dir, "prompt.md"), "utf8");
  const beforeTree = await readTree(join(dir, "before"));
  const expectedPatch = await readFile(join(dir, "expected.patch"), "utf8");
  return { id, prompt, beforeTree, expectedPatch, testsDir: join(dir, "tests") };
}
