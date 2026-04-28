import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RESULTS_DIR = "bench/results";
const AMASE_FILE = "2026-04-25T02-26-27-675Z.jsonl";
const SP_FILE = "2026-04-25T00-14-05-882Z.jsonl";

async function load(file) {
  const lines = (await readFile(join(RESULTS_DIR, file), "utf8")).trim().split("\n");
  return lines.map(l => JSON.parse(l));
}

async function main() {
  const amaseResults = (await load(AMASE_FILE)).filter(r => r.stack === "amase");
  const spResults = (await load(SP_FILE)).filter(r => r.stack === "superpowers");

  const amasePassed = amaseResults.filter(r => r.pass).length;
  const spPassed = spResults.filter(r => r.pass).length;

  const amaseTokens = amaseResults.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const spTokens = spResults.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);

  const amaseTime = amaseResults.reduce((s, r) => s + r.wallMs, 0);
  const spTime = spResults.reduce((s, r) => s + r.wallMs, 0);

  // both-passed subset for meaningful comparison
  const bothPassedTaskIds = amaseResults
    .filter(a => a.pass && spResults.find(s => s.taskId === a.taskId)?.pass)
    .map(a => a.taskId);

  const amaseBothTokens = amaseResults
    .filter(r => bothPassedTaskIds.includes(r.taskId))
    .reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const spBothTokens = spResults
    .filter(r => bothPassedTaskIds.includes(r.taskId))
    .reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const amaseBothTime = amaseResults
    .filter(r => bothPassedTaskIds.includes(r.taskId))
    .reduce((s, r) => s + r.wallMs, 0);
  const spBothTime = spResults
    .filter(r => bothPassedTaskIds.includes(r.taskId))
    .reduce((s, r) => s + r.wallMs, 0);

  console.log("=== LIVE AMASE vs CACHED SUPERPOWERS ===\n");
  console.log(`AMASE run:   ${AMASE_FILE} (LIVE)`);
  console.log(`SP run:      ${SP_FILE} (cached baseline)`);
  console.log(`Tasks:       ${amaseResults.length}`);
  console.log();

  console.log("┌─────────────────────┬──────────────┬──────────────┐");
  console.log("│ Metric              │ AMASE        │ superpowers  │");
  console.log("├─────────────────────┼──────────────┼──────────────┤");
  console.log(`│ Passed              │ ${String(amasePassed + "/" + amaseResults.length).padEnd(12)} │ ${String(spPassed + "/" + spResults.length).padEnd(12)} │`);
  console.log(`│ Pass rate           │ ${String((amasePassed / amaseResults.length * 100).toFixed(1) + "%").padEnd(12)} │ ${String((spPassed / spResults.length * 100).toFixed(1) + "%").padEnd(12)} │`);
  console.log(`│ Total tokens        │ ${String(amaseTokens).padEnd(12)} │ ${String(spTokens).padEnd(12)} │`);
  console.log(`│ Total wall time     │ ${String(amaseTime + "ms").padEnd(12)} │ ${String(spTime + "ms").padEnd(12)} │`);
  console.log(`│ Avg tokens/task     │ ${String(Math.round(amaseTokens / amaseResults.length)).padEnd(12)} │ ${String(Math.round(spTokens / spResults.length)).padEnd(12)} │`);
  console.log(`│ Avg wall ms/task    │ ${String(Math.round(amaseTime / amaseResults.length)).padEnd(12)} │ ${String(Math.round(spTime / spResults.length)).padEnd(12)} │`);
  console.log("└─────────────────────┴──────────────┴──────────────┘");
  console.log();

  // On tasks BOTH passed (fair comparison)
  console.log(`=== BOTH-PASSED SUBSET (${bothPassedTaskIds.length} tasks) ===\n`);
  console.log(`Tasks: ${bothPassedTaskIds.join(", ") || "none"}`);
  console.log();
  if (bothPassedTaskIds.length > 0) {
    console.log("┌─────────────────────┬──────────────┬──────────────┐");
    console.log("│ Metric              │ AMASE        │ superpowers  │");
    console.log("├─────────────────────┼──────────────┼──────────────┤");
    console.log(`│ Total tokens        │ ${String(amaseBothTokens).padEnd(12)} │ ${String(spBothTokens).padEnd(12)} │`);
    console.log(`│ Total wall time     │ ${String(amaseBothTime + "ms").padEnd(12)} │ ${String(spBothTime + "ms").padEnd(12)} │`);
    console.log(`│ Avg tokens/task     │ ${String(Math.round(amaseBothTokens / bothPassedTaskIds.length)).padEnd(12)} │ ${String(Math.round(spBothTokens / bothPassedTaskIds.length)).padEnd(12)} │`);
    console.log(`│ Avg wall ms/task    │ ${String(Math.round(amaseBothTime / bothPassedTaskIds.length)).padEnd(12)} │ ${String(Math.round(spBothTime / bothPassedTaskIds.length)).padEnd(12)} │`);
    console.log("└─────────────────────┴──────────────┴──────────────┘");
    console.log();

    const tokenDelta = spBothTokens === 0 ? 0 : (spBothTokens - amaseBothTokens) / spBothTokens;
    const timeDelta = spBothTime === 0 ? 0 : (spBothTime - amaseBothTime) / spBothTime;
    console.log("=== DELTAS (positive = AMASE better) ===\n");
    console.log(`Token delta:  ${(tokenDelta * 100).toFixed(1)}%  (${spBothTokens - amaseBothTokens} fewer tokens)`);
    console.log(`Time delta:   ${(timeDelta * 100).toFixed(1)}%  (${spBothTime - amaseBothTime}ms faster)`);
    console.log();
    if (tokenDelta >= 0.3 && timeDelta >= 0.3) {
      console.log("✅ AMASE meets targets on both-passed subset: ≥30% faster, ≤70% tokens");
    } else {
      console.log("❌ AMASE does not meet targets on both-passed subset yet.");
    }
  }

  // Per-task breakdown
  console.log("\n=== PER-TASK BREAKDOWN ===\n");
  console.log(`${"taskId".padEnd(35)} ${"amase".padEnd(6)} ${"sp".padEnd(5)} ${"a-tokens".padEnd(9)} ${"sp-tokens".padEnd(10)} ${"a-ms".padEnd(7)} ${"sp-ms"}`);
  for (const a of amaseResults.sort((x, y) => x.taskId.localeCompare(y.taskId))) {
    const s = spResults.find(r => r.taskId === a.taskId);
    const both = a.pass && s?.pass ? "*" : " ";
    console.log(
      `${both}${a.taskId.padEnd(34)} ` +
      `${String(a.pass).padEnd(6)} ` +
      `${String(s?.pass ?? "N/A").padEnd(5)} ` +
      `${String(a.tokensIn + a.tokensOut).padEnd(9)} ` +
      `${String((s?.tokensIn ?? 0) + (s?.tokensOut ?? 0)).padEnd(10)} ` +
      `${String(a.wallMs).padEnd(7)} ` +
      `${s?.wallMs ?? "N/A"}`
    );
  }
  console.log("\n* = both passed (fair comparison)");

  // Failed tasks detail
  const failed = amaseResults.filter(r => !r.pass);
  if (failed.length > 0) {
    console.log("\n=== AMASE FAILURES ===\n");
    for (const f of failed) {
      console.log(`${f.taskId}: tokens=${f.tokensIn + f.tokensOut} ms=${f.wallMs}`);
      if (f.error) console.log(`  error: ${f.error.substring(0, 120)}`);
    }
  }
}

main();
