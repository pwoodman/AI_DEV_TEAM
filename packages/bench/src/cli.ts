#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DecisionLogEntrySchema } from "@amase/contracts";
import { printTable, reportHeadline } from "./reporter.js";
import { renderTrace } from "./trace.js";
import { runBench } from "./runner.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { Fairness, Stack } from "./types.js";

function getArg(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function cmdTrace(args: string[]): Promise<void> {
  const decisionsPath = args[1];
  if (!decisionsPath) {
    console.error("usage: amase-bench trace <path/to/decisions.jsonl>");
    process.exit(2);
  }
  let raw: string;
  try {
    raw = await readFile(decisionsPath, "utf8");
  } catch {
    console.error(`cannot read: ${decisionsPath}`);
    process.exit(1);
    return;
  }
  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return DecisionLogEntrySchema.parse(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  process.stdout.write(renderTrace(entries));
}

async function cmdRun(args: string[]): Promise<void> {
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

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "trace") {
    await cmdTrace(args);
    return;
  }

  if (cmd === "run") {
    await cmdRun(args);
    return;
  }

  console.error(
    "usage:\n" +
      "  amase-bench run [--stacks=amase,superpowers] [--samples=3] " +
      "[--model=claude-sonnet-4-6] [--fairness=primary|secondary|both] " +
      "[--tasks=id1,id2] [--live]\n" +
      "  amase-bench trace <path/to/decisions.jsonl>",
  );
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
