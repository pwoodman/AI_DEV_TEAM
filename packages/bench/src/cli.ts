#!/usr/bin/env node
import { join } from "node:path";
import { printTable, reportHeadline } from "./reporter.js";
import { runBench } from "./runner.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { Fairness, Stack } from "./types.js";

function getArg(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd !== "run") {
    console.error(
      "usage: amase-bench run [--stacks=amase,superpowers] [--samples=3] " +
        "[--model=claude-sonnet-4-6] [--fairness=primary|secondary|both] " +
        "[--tasks=id1,id2] [--live]",
    );
    process.exit(2);
  }

  const stacks = (getArg(args, "stacks") ?? "amase,superpowers").split(",") as Stack[];
  const samples = Number(getArg(args, "samples") ?? "3");
  if (!Number.isFinite(samples) || samples < 1) {
    console.error("--samples must be a positive integer");
    process.exit(2);
  }
  const model = getArg(args, "model") ?? "claude-sonnet-4-6";
  const fairnessArg = (getArg(args, "fairness") ?? "primary") as "primary" | "secondary" | "both";
  const tasks = getArg(args, "tasks")?.split(",");
  const live = args.includes("--live");
  const outDir = join(process.cwd(), "bench/results");

  const modes: Fairness[] =
    fairnessArg === "both" ? ["primary", "secondary"] : [fairnessArg];

  for (const fairness of modes) {
    console.error(`# fairness=${fairness}`);
    const results = await runBench({
      stacks, tasks, live, samples, model, fairness, outDir,
    });

    // Load descriptions for the table
    const ids = tasks ?? (await listFixtures());
    const descriptions = new Map<string, string>();
    for (const id of ids) {
      try {
        const fx = await loadFixture(id);
        descriptions.set(id, fx.meta.summary);
      } catch { /* skip */ }
    }

    printTable(results, descriptions);

    const report = reportHeadline(results, { fairness, samplesPerCell: samples });
    console.log(JSON.stringify(report, null, 2));
    if (fairness === "primary" && report.verdict !== "ok") {
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
