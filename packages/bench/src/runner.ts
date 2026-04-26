import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { runAmase } from "./adapters/amase.js";
import { runStock } from "./adapters/stock.js";
import { runSuperpowers } from "./adapters/superpowers.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { BenchResult, Stack } from "./types.js";

export interface RunConfig {
  stacks: Stack[];
  tasks?: string[];
  live?: boolean;
  outDir?: string;
  cacheDir?: string;
}

const CACHE_DIR = join(process.cwd(), ".amase", "bench-cache");

function cacheKey(taskId: string, stack: Stack, model: string, fairness: string, prompt: string): string {
  const hash = createHash("sha256").update(`${taskId}:${stack}:${model}:${fairness}:${prompt}`).digest("hex").slice(0, 16);
  return hash;
}

async function readCachedResult(key: string, cacheDir: string): Promise<BenchResult | null> {
  try {
    const raw = await readFile(join(cacheDir, `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as BenchResult;
    // Validate minimal shape
    if (parsed && typeof parsed.taskId === "string" && typeof parsed.pass === "boolean") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCachedResult(key: string, cacheDir: string, result: BenchResult): Promise<void> {
  await writeFile(join(cacheDir, `${key}.json`), JSON.stringify(result), "utf8");
}

export async function runBench(cfg: RunConfig): Promise<BenchResult[]> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = cfg.outDir ?? join(process.cwd(), "bench/results");
  const cacheDir = cfg.cacheDir ?? CACHE_DIR;
  await mkdir(outDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  const outFile = join(outDir, `${runId}.jsonl`);

  const allIds = cfg.tasks ?? (await listFixtures());
  const results: BenchResult[] = [];
  for (const id of allIds) {
    const fx = await loadFixture(id);
    const perStack = await Promise.all(
      cfg.stacks.map(async (stack) => {
        const model = "claude-sonnet-4-6";
        const fairness = "primary" as const;
        const opts = { runId, runSeq: 1, model, fairness, live: cfg.live };

        if (stack === "superpowers" || stack === "stock") {
          const key = cacheKey(fx.id, stack, model, fairness, fx.prompt);
          const cached = await readCachedResult(key, cacheDir);
          if (cached) {
            const result: BenchResult = { ...cached, runId, timestamp: new Date().toISOString() };
            return result;
          }
          const result = stack === "superpowers"
            ? await runSuperpowers(fx, opts)
            : await runStock(fx, opts);
          await writeCachedResult(key, cacheDir, result);
          return result;
        }

        return runAmase(fx, opts);
      }),
    );
    for (const result of perStack) {
      results.push(result);
      await appendFile(outFile, `${JSON.stringify(result)}\n`);
    }
  }
  return results;
}
