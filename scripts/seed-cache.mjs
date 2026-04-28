import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const CACHE_DIR = join(root, ".amase", "bench-cache");
await mkdir(CACHE_DIR, { recursive: true });

// Load prompts from fixtures so cache keys match exactly
import { loadFixture } from "../packages/bench/dist/fixtures.js";

const srcFile = process.argv[2];
if (!srcFile) {
  console.error("usage: node scripts/seed-cache.mjs <results-file>");
  process.exit(2);
}

const lines = (await readFile(srcFile, "utf8")).trim().split("\n");
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.stack !== "superpowers") continue;
  const fx = await loadFixture(r.taskId);
  const key = createHash("sha256")
    .update(`${r.taskId}:superpowers:claude-sonnet-4-6:primary:${fx.prompt}`)
    .digest("hex")
    .slice(0, 16);
  const outPath = join(CACHE_DIR, `${key}.json`);
  await writeFile(outPath, JSON.stringify(r));
  console.log("cached", r.taskId, "->", key, "pass=", r.pass);
}
