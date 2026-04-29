#!/usr/bin/env node
/**
 * router-comparison.mjs — one-shot diagnostic. Run once, pick winner, delete this file.
 *
 * Usage: node scripts/router-comparison.mjs
 * Requires: ANTHROPIC_API_KEY set in env or .env file
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

// Load .env if present
try {
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch { /* no .env */ }

const { loadFixture } = await import("../packages/bench/dist/fixtures.js");
const { runAmase } = await import("../packages/bench/dist/adapters/amase.js");

const FIXTURES = ["add-pagination-to-list-endpoint", "fix-failing-vitest"];
const MODES = ["baseline", "option-a", "option-b", "option-c"];

const rows = [];

for (const mode of MODES) {
  process.env.AMASE_ROUTER_MODE = mode;
  for (const taskId of FIXTURES) {
    process.stderr.write(`running mode=${mode} fixture=${taskId}...\n`);
    let result;
    try {
      const fx = await loadFixture(taskId);
      result = await runAmase(fx, {
        runId: `comparison-${mode}-${taskId}`,
        runSeq: 1,
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        fairness: "primary",
      });
    } catch (e) {
      result = { pass: false, tokensIn: 0, tokensOut: 0, wallMs: 0, error: String(e) };
    }
    rows.push({ mode, taskId, ...result });
  }
}

// Print table
const COL = { mode: 18, fixture: 42, tokensIn: 10, tokensOut: 11, wallMs: 9, pass: 5 };
const header = [
  "mode".padEnd(COL.mode),
  "fixture".padEnd(COL.fixture),
  "tokensIn".padStart(COL.tokensIn),
  "tokensOut".padStart(COL.tokensOut),
  "wallMs".padStart(COL.wallMs),
  "pass".padStart(COL.pass),
].join("  ");
const sep = "─".repeat(header.length);
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log([
    r.mode.padEnd(COL.mode),
    r.taskId.padEnd(COL.fixture),
    String(r.tokensIn).padStart(COL.tokensIn),
    String(r.tokensOut).padStart(COL.tokensOut),
    String(r.wallMs).padStart(COL.wallMs),
    (r.pass ? "✓" : "✗").padStart(COL.pass),
  ].join("  "));
}
console.log(sep);

// Winner: lowest sum(tokensIn+tokensOut) across both fixtures, must pass both
const totals = {};
for (const r of rows) {
  totals[r.mode] = totals[r.mode] ?? { tokens: 0, passes: 0 };
  totals[r.mode].tokens += r.tokensIn + r.tokensOut;
  totals[r.mode].passes += r.pass ? 1 : 0;
}
const eligible = Object.entries(totals).filter(([, v]) => v.passes === FIXTURES.length);
if (eligible.length === 0) {
  console.error("\n⚠ No mode passed all fixtures. Check errors above.");
  process.exit(1);
}
eligible.sort((a, b) => a[1].tokens - b[1].tokens);
const [winner] = eligible[0];
console.log(`\n🏆 Winner: ${winner} (${totals[winner].tokens} total tokens)`);
console.log(`   → Promote by setting AMASE_ROUTER_MODE default to "${winner}" and removing the flag.`);
