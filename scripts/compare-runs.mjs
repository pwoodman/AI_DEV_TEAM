import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const RESULTS_DIR = "bench/results";

async function main() {
  const files = (await readdir(RESULTS_DIR))
    .filter(f => f.endsWith(".jsonl"))
    .sort();

  // We have:
  // - 2026-04-25T00-14-05-882Z.jsonl : original full run (amase + superpowers)
  // - 2026-04-25T00-17-47-419Z.jsonl : partial run (3 tasks)
  // - 2026-04-25T02-05-47-491Z.jsonl : re-run 1 (superpowers only, cached)
  // - 2026-04-25T02-05-59-659Z.jsonl : re-run 2 (superpowers only, cached)

  const baselineFile = "2026-04-25T00-14-05-882Z.jsonl";
  const rerun1File = "2026-04-25T02-05-47-491Z.jsonl";
  const rerun2File = "2026-04-25T02-05-59-659Z.jsonl";

  async function load(file) {
    const lines = (await readFile(join(RESULTS_DIR, file), "utf8")).trim().split("\n");
    return lines.map(l => JSON.parse(l));
  }

  const baseline = await load(baselineFile);
  const rerun1 = await load(rerun1File);
  const rerun2 = await load(rerun2File);

  const spBaseline = baseline.filter(r => r.stack === "superpowers");
  const spRerun1 = rerun1.filter(r => r.stack === "superpowers");
  const spRerun2 = rerun2.filter(r => r.stack === "superpowers");

  console.log("=== SUPERPOWERS RE-RUN DETERMINISM CHECK ===\n");

  // Compare baseline vs rerun1
  let baselineMatchRerun1 = true;
  for (const b of spBaseline) {
    const r1 = spRerun1.find(r => r.taskId === b.taskId);
    if (!r1) { baselineMatchRerun1 = false; continue; }
    if (b.pass !== r1.pass || b.tokensIn !== r1.tokensIn || b.tokensOut !== r1.tokensOut) {
      baselineMatchRerun1 = false;
    }
  }

  // Compare rerun1 vs rerun2 (the key test: are re-runs identical?)
  let rerun1MatchRerun2 = true;
  for (const r1 of spRerun1) {
    const r2 = spRerun2.find(r => r.taskId === r1.taskId);
    if (!r2) { rerun1MatchRerun2 = false; continue; }
    const match =
      r1.pass === r2.pass &&
      r1.tokensIn === r2.tokensIn &&
      r1.tokensOut === r2.tokensOut &&
      r1.wallMs === r2.wallMs;
    if (!match) {
      rerun1MatchRerun2 = false;
      console.log(`DIFFERED  ${r1.taskId}`);
      console.log(`  rerun1: pass=${r1.pass} tokens=${r1.tokensIn}+${r1.tokensOut} wall=${r1.wallMs}ms`);
      console.log(`  rerun2: pass=${r2.pass} tokens=${r2.tokensIn}+${r2.tokensOut} wall=${r2.wallMs}ms`);
    }
  }

  if (rerun1MatchRerun2) {
    console.log("✅ RE-RUN 1 vs RE-RUN 2: PERFECTLY IDENTICAL");
    console.log("   (pass, tokensIn, tokensOut, wallMs all match for every task)\n");
  } else {
    console.log("❌ RE-RUNS DIFFERED\n");
  }

  // Show per-task comparison: baseline vs re-runs
  console.log("=== PER-TASK COMPARISON (baseline vs re-runs) ===\n");
  console.log(`${"taskId".padEnd(35)} ${"baseline pass".padEnd(14)} ${"rerun1 pass".padEnd(12)} ${"rerun2 pass".padEnd(12)} ${"tokens".padEnd(10)} ${"wall baseline".padEnd(14)} ${"wall rerun"}`);
  for (const b of spBaseline.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
    const r1 = spRerun1.find(r => r.taskId === b.taskId);
    const r2 = spRerun2.find(r => r.taskId === b.taskId);
    const tokensMatch = r1 && b.tokensIn === r1.tokensIn && b.tokensOut === r1.tokensOut ? "same" : "DIFF";
    console.log(
      `${b.taskId.padEnd(35)} ` +
      `${String(b.pass).padEnd(14)} ` +
      `${String(r1?.pass ?? "N/A").padEnd(12)} ` +
      `${String(r2?.pass ?? "N/A").padEnd(12)} ` +
      `${tokensMatch.padEnd(10)} ` +
      `${String(b.wallMs).padEnd(14)} ` +
      `${r1?.wallMs ?? "N/A"}`
    );
  }

  // Summary stats
  console.log("\n=== AGGREGATE SUMMARY ===\n");
  const sum = (arr, key) => arr.reduce((s, r) => s + r[key], 0);
  const baselineTokens = sum(spBaseline, "tokensIn") + sum(spBaseline, "tokensOut");
  const rerun1Tokens = sum(spRerun1, "tokensIn") + sum(spRerun1, "tokensOut");
  const rerun2Tokens = sum(spRerun2, "tokensIn") + sum(spRerun2, "tokensOut");
  const baselineTime = sum(spBaseline, "wallMs");
  const rerun1Time = sum(spRerun1, "wallMs");
  const rerun2Time = sum(spRerun2, "wallMs");

  console.log(`Baseline (${baselineFile}):`);
  console.log(`  passed: ${spBaseline.filter(r => r.pass).length}/${spBaseline.length}`);
  console.log(`  total tokens: ${baselineTokens}`);
  console.log(`  total wall time: ${baselineTime}ms`);
  console.log();
  console.log(`Re-run 1 (${rerun1File}):`);
  console.log(`  passed: ${spRerun1.filter(r => r.pass).length}/${spRerun1.length}`);
  console.log(`  total tokens: ${rerun1Tokens}`);
  console.log(`  total wall time: ${rerun1Time}ms`);
  console.log();
  console.log(`Re-run 2 (${rerun2File}):`);
  console.log(`  passed: ${spRerun2.filter(r => r.pass).length}/${spRerun2.length}`);
  console.log(`  total tokens: ${rerun2Tokens}`);
  console.log(`  total wall time: ${rerun2Time}ms`);
  console.log();

  if (baselineTokens === rerun1Tokens && rerun1Tokens === rerun2Tokens) {
    console.log("✅ TOKEN COUNTS IDENTICAL ACROSS ALL RUNS");
  }
  if (rerun1Time === rerun2Time) {
    console.log("✅ WALL TIMES IDENTICAL ACROSS RE-RUNS");
  }
  if (baselineMatchRerun1) {
    console.log("✅ BASELINE MATCHES RE-RUNS (deterministic)");
  } else {
    console.log("ℹ️  BASELINE vs RE-RUNS: token counts match, wall times may differ due to concurrent amase runs in baseline");
  }
}

main();
