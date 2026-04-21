#!/usr/bin/env node
import { runBench } from "./runner.js";
import { reportHeadline } from "./reporter.js";
import type { Stack } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === "run") {
    const stacks = (args.find((a) => a.startsWith("--stacks="))?.split("=")[1] ?? "amase,superpowers").split(",") as Stack[];
    const live = args.includes("--live");
    const results = await runBench({ stacks, live });
    console.log(JSON.stringify(reportHeadline(results), null, 2));
    return;
  }
  console.error("usage: amase-bench run [--stacks=amase,superpowers] [--live]");
  process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
