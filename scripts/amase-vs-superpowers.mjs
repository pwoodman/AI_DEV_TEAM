import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RESULTS_DIR = "bench/results";
const BASELINE_FILE = "2026-04-25T00-14-05-882Z.jsonl";

async function main() {
  const lines = (await readFile(join(RESULTS_DIR, BASELINE_FILE), "utf8"))
    .trim()
    .split("\n");
  const results = lines.map(l => JSON.parse(l));

  const amase = results.filter(r => r.stack === "amase");
  const sp = results.filter(r => r.stack === "superpowers");

  const amasePassed = amase.filter(r => r.pass).length;
  const spPassed = sp.filter(r => r.pass).length;

  const amaseTokens = amase.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const spTokens = sp.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);

  const amaseTime = amase.reduce((s, r) => s + r.wallMs, 0);
  const spTime = sp.reduce((s, r) => s + r.wallMs, 0);

  console.log("=== AMASE vs SUPERPOWERS COMPARISON ===\n");
  console.log(`Run: ${BASELINE_FILE}`);
  console.log(`Tasks: ${amase.length}\n`);

  console.log("┌─────────────────────┬──────────────┬──────────────┐");
  console.log("│ Metric              │ AMASE        │ superpowers  │");
  console.log("├─────────────────────┼──────────────┼──────────────┤");
  console.log(`│ Passed              │ ${String(amasePassed + "/" + amase.length).padEnd(12)} │ ${String(spPassed + "/" + sp.length).padEnd(12)} │`);
  console.log(`│ Pass rate           │ ${String((amasePassed / amase.length * 100).toFixed(1) + "%").padEnd(12)} │ ${String((spPassed / sp.length * 100).toFixed(1) + "%").padEnd(12)} │`);
  console.log(`│ Total tokens        │ ${String(amaseTokens).padEnd(12)} │ ${String(spTokens).padEnd(12)} │`);
  console.log(`│ Total wall time     │ ${String(amaseTime + "ms").padEnd(12)} │ ${String(spTime + "ms").padEnd(12)} │`);
  console.log(`│ Avg tokens/task     │ ${String(Math.round(amaseTokens / amase.length)).padEnd(12)} │ ${String(Math.round(spTokens / sp.length)).padEnd(12)} │`);
  console.log(`│ Avg wall ms/task    │ ${String(Math.round(amaseTime / amase.length)).padEnd(12)} │ ${String(Math.round(spTime / sp.length)).padEnd(12)} │`);
  console.log("└─────────────────────┴──────────────┴──────────────┘");
  console.log();

  const tokenDelta = spTokens === 0 ? 0 : (spTokens - amaseTokens) / spTokens;
  const timeDelta = spTime === 0 ? 0 : (spTime - amaseTime) / spTime;
  const passRateDelta = (amasePassed - spPassed) / amase.length;

  console.log("=== DELTAS (positive = AMASE better) ===\n");
  console.log(`Token delta:  ${(tokenDelta * 100).toFixed(1)}%  (${spTokens - amaseTokens} fewer tokens)`);
  console.log(`Time delta:   ${(timeDelta * 100).toFixed(1)}%  (${spTime - amaseTime}ms faster)`);
  console.log(`Pass delta:   ${(passRateDelta * 100).toFixed(1)}%  (${amasePassed - spPassed} fewer passes)`);
  console.log();

  console.log("=== PER-TASK BREAKDOWN ===\n");
  console.log(`${"taskId".padEnd(35)} ${"amase pass".padEnd(11)} ${"sp pass".padEnd(8)} ${"amase tokens".padEnd(13)} ${"sp tokens".padEnd(10)} ${"amase ms".padEnd(9)} ${"sp ms"}`);
  for (const a of amase.sort((x, y) => x.taskId.localeCompare(y.taskId))) {
    const s = sp.find(r => r.taskId === a.taskId);
    console.log(
      `${a.taskId.padEnd(35)} ` +
      `${String(a.pass).padEnd(11)} ` +
      `${String(s?.pass ?? "N/A").padEnd(8)} ` +
      `${String(a.tokensIn + a.tokensOut).padEnd(13)} ` +
      `${String((s?.tokensIn ?? 0) + (s?.tokensOut ?? 0)).padEnd(10)} ` +
      `${String(a.wallMs).padEnd(9)} ` +
      `${s?.wallMs ?? "N/A"}`
    );
  }

  console.log();
  if (amasePassed === 0) {
    console.log("⚠️  CRITICAL: AMASE passes 0 tasks. The system cannot be benchmarked for");
    console.log("   speed/token efficiency until it achieves functional correctness.");
    console.log("   Current headline: REGRESSION (passRateDelta = -1.0)");
  } else if (passRateDelta >= 0 && tokenDelta >= 0.3 && timeDelta >= 0.3) {
    console.log("✅ AMASE meets targets: ≥30% faster, ≤70% tokens, non-negative pass rate.");
  } else {
    console.log("❌ AMASE does not meet targets yet.");
  }
}

main();
