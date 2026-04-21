import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { runAmase } from "./adapters/amase.js";
import { runSuperpowers } from "./adapters/superpowers.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { BenchResult, Stack } from "./types.js";

export interface RunConfig {
  stacks: Stack[];
  tasks?: string[];
  live?: boolean;
  outDir?: string;
}

export async function runBench(cfg: RunConfig): Promise<BenchResult[]> {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = cfg.outDir ?? join(process.cwd(), "bench/results");
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, `${runId}.jsonl`);

  const allIds = cfg.tasks ?? (await listFixtures());
  const results: BenchResult[] = [];
  for (const id of allIds) {
    const fx = await loadFixture(id);
    for (const stack of cfg.stacks) {
      const opts = { runId, live: cfg.live };
      const result = stack === "amase" ? await runAmase(fx, opts) : await runSuperpowers(fx, opts);
      results.push(result);
      await appendFile(outFile, JSON.stringify(result) + "\n");
    }
  }
  return results;
}
