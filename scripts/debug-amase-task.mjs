import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, cpSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

process.env.ANTHROPIC_API_KEY = readFileSync(join(root, ".env"), "utf8").split("=")[1].trim();

const { loadFixture } = await import("../packages/bench/dist/fixtures.js");
const { runAmase } = await import("../packages/bench/dist/adapters/amase.js");

const taskId = process.argv[2] || "add-pagination-to-list-endpoint";
const fx = await loadFixture(taskId);

const result = await runAmase(fx, {
  runId: "debug",
  runSeq: 1,
  model: "claude-sonnet-4-6",
  fairness: "primary",
  live: true,
});

console.log("\n=== RESULT ===");
console.log("pass:", result.pass);
console.log("tokens:", result.tokensIn + result.tokensOut);
console.log("wallMs:", result.wallMs);
if (result.error) console.log("error:", result.error.substring(0, 300));

// Try to find the workspace
const wsDir = join(root, ".amase", "bench-workspaces");
try {
  const dirs = readdirSync(wsDir).filter(d => d.includes(`amase-${taskId}`));
  for (const d of dirs) {
    const p = join(wsDir, d);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      console.log("\n=== WORKSPACE FILES ===");
      const files = [];
      function walk(dir, rel = "") {
        for (const f of readdirSync(dir)) {
          const fp = join(dir, f);
          const r = rel ? `${rel}/${f}` : f;
          if (statSync(fp).isDirectory()) walk(fp, r);
          else files.push(r);
        }
      }
      walk(join(p, ".amase", "runs"));
      // Find the most recent run
      const runs = readdirSync(join(p, ".amase", "runs"));
      const latest = runs.sort().pop();
      const sandbox = join(p, ".amase", "runs", latest, "workspace");
      console.log("sandbox:", sandbox);
      
      function walk2(dir, rel = "") {
        for (const f of readdirSync(dir)) {
          const fp = join(dir, f);
          const r = rel ? `${rel}/${f}` : f;
          if (statSync(fp).isDirectory()) walk2(fp, r);
          else {
            console.log(`\n--- ${r} ---`);
            console.log(readFileSync(fp, "utf8"));
          }
        }
      }
      walk2(sandbox);
    }
  }
} catch (e) {
  console.log("workspace scan error:", e.message);
}
