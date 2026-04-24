import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export const FixtureCategorySchema = z.enum(["micro", "medium", "large"]);
export type FixtureCategory = z.infer<typeof FixtureCategorySchema>;

export const FixtureLanguageSchema = z.enum([
  "ts",
  "js",
  "py",
  "go",
  "rust",
  "java",
  "csharp",
  "cpp",
  "c",
  "ruby",
  "php",
  "swift",
  "kotlin",
]);
export type FixtureLanguage = z.infer<typeof FixtureLanguageSchema>;

export const FixtureMetaSchema = z.object({
  category: FixtureCategorySchema,
  language: FixtureLanguageSchema,
  summary: z.string().min(1),
});
export type FixtureMeta = z.infer<typeof FixtureMetaSchema>;

export interface Fixture {
  id: string;
  prompt: string;
  meta: FixtureMeta;
  beforeTree: Map<string, string>;
  expectedPatch: string;
  testsDir: string;
}

export async function listFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function readTree(
  root: string,
  acc = new Map<string, string>(),
  rel = "",
): Promise<Map<string, string>> {
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
  const metaRaw = await readFile(join(dir, "meta.yaml"), "utf8");
  const meta = FixtureMetaSchema.parse(parseYaml(metaRaw));
  const beforeTree = await readTree(join(dir, "before"));
  const expectedPatch = await readFile(join(dir, "expected.patch"), "utf8");
  return {
    id,
    prompt,
    meta,
    beforeTree,
    expectedPatch,
    testsDir: join(dir, "tests"),
  };
}
