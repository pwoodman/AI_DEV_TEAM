import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "skills");

export async function loadGuide(skillId: string): Promise<string> {
  const path = join(SKILLS_DIR, ...skillId.split("/"), "guide.md");
  return await readFile(path, "utf8");
}
