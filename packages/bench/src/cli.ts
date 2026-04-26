#!/usr/bin/env node
import { printTable, reportHeadline } from "./reporter.js";
import { runBench } from "./runner.js";
import { listFixtures, loadFixture } from "./fixtures.js";
import type { Stack } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === "run") {
    const stacks = (
      args.find((a) => a.startsWith("--stacks="))?.split("=")[1] ?? "amase,superpowers"
    ).split(",") as Stack[];
    const live = args.includes("--live");
    const tasksArg = args.find((a) => a.startsWith("--tasks="))?.split("=")[1];
    const tasks = tasksArg ? tasksArg.split(",") : undefined;
    const results = await runBench({ stacks, live, tasks });

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
    // Also emit the JSON headline for programmatic consumers / CI gates
    console.log(JSON.stringify(reportHeadline(results), null, 2));
    return;
  }
  console.error("usage: amase-bench run [--stacks=amase,stock] [--tasks=id1,id2] [--live]");
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
