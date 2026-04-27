import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { runAmase } from "./adapters/amase.js";
import { runStock } from "./adapters/stock.js";
import { runSuperpowers } from "./adapters/superpowers.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { BenchResult, Fairness, Stack } from "./types.js";

export interface RunConfig {
  stacks: Stack[];
  tasks?: string[];
  live?: boolean;
  outDir?: string;
  cacheDir?: string;
  samples?: number;    // default 3
  model?: string;      // default "claude-sonnet-4-6"
  fairness?: Fairness; // default "primary"
}

const CACHE_DIR = join(process.cwd(), "bench", "cache");

function treeHash(tree: Map<string, string>): string {
  return createHash("sha256")
    .update(JSON.stringify([...tree.entries()].sort()))
    .digest("hex")
    .slice(0, 8);
}

function cacheKey(taskId: string, stack: Stack, model: string, fairness: string, prompt: string, tree: Map<string, string>): string {
  const hash = createHash("sha256").update(`${taskId}:${stack}:${model}:${fairness}:${prompt}:${treeHash(tree)}`).digest("hex").slice(0, 16);
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
  const cacheDir = cfg.cacheDir ?? CACHE_DIR;
  const samples = cfg.samples ?? 3;
  const model = cfg.model ?? "claude-sonnet-4-6";
  const fairness = cfg.fairness ?? ("primary" as const);

  await mkdir(cacheDir, { recursive: true });

  let outFile: string | undefined;
  if (cfg.outDir !== undefined) {
    const outDir = cfg.outDir;
    await mkdir(outDir, { recursive: true });
    outFile = join(outDir, `${runId}.jsonl`);
  }

  const allIds = cfg.tasks ?? (await listFixtures());
  const results: BenchResult[] = [];

  for (const id of allIds) {
    const fx = await loadFixture(id);
    for (let seq = 1; seq <= samples; seq++) {
      const opts = { runId, runSeq: seq, model, fairness, live: cfg.live };
      const perStack = await Promise.all(
        cfg.stacks.map(async (stack) => {
          if (stack === "superpowers" || stack === "stock") {
            const key = cacheKey(fx.id, stack, model, fairness, fx.prompt, fx.beforeTree) + `-s${seq}`;
            const cached = await readCachedResult(key, cacheDir);
            if (cached) {
              const result: BenchResult = { ...cached, runId, runSeq: seq, timestamp: new Date().toISOString() };
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
        if (outFile !== undefined) {
          await appendFile(outFile, `${JSON.stringify(result)}\n`);
        }
      }
    }
  }
  return results;
}
