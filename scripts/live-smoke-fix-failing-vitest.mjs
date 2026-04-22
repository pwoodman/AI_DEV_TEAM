// One-off live smoke test: runs the real Orchestrator (AnthropicClient)
// against the fix-failing-vitest fixture and reports whether the resulting
// src/sum.ts was actually fixed.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/live-smoke-fix-failing-vitest.mjs
//
// Not committed as part of v2 — will be deleted after validation.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildAgentRegistry } from "../packages/agents/dist/index.js";
import { loadFixture } from "../packages/bench/dist/index.js";
import { Orchestrator } from "../packages/core/dist/index.js";
import { AnthropicClient } from "../packages/llm/dist/index.js";
import { DAGStore, DecisionLog, runPaths } from "../packages/memory/dist/index.js";
import { patchSafetyValidator, schemaValidator } from "../packages/validators/dist/index.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(2);
}

process.env.AMASE_LLM_STUB = undefined;

const fx = await loadFixture("fix-failing-vitest");
const workspace = await mkdtemp(join(tmpdir(), "amase-live-smoke-"));
console.log("workspace:", workspace);

for (const [rel, content] of fx.beforeTree) {
  const abs = join(workspace, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

const llm = new AnthropicClient();
const agents = buildAgentRegistry(llm);
const store = new DAGStore();
const orchestrator = new Orchestrator({
  agents,
  validators: [schemaValidator, patchSafetyValidator],
  store,
  makeDecisionLog: (p) => new DecisionLog(p),
});

const start = Date.now();
let error;
let tokensIn = 0;
let tokensOut = 0;
let retries = 0;
let fixed = false;
let sumAfter = "";

try {
  const plan = await orchestrator.plan({ request: fx.prompt, workspacePath: workspace });
  console.log("dagId:", plan.dagId);
  console.log("--- task graph ---");
  console.log(JSON.stringify(plan.graph.nodes, null, 2));
  console.log("--- fixture prompt ---");
  console.log(fx.prompt);
  await orchestrator.execute(plan.dagId);

  const paths = runPaths(workspace, plan.dagId);
  const log = new DecisionLog(paths.decisions);
  const entries = await log.readAll();
  for (const e of entries) {
    if (e.event === "llm.call") {
      tokensIn += e.data.tokensIn ?? 0;
      tokensOut += e.data.tokensOut ?? 0;
    }
    if (e.event === "node.retried") retries += 1;
  }

  try {
    const sandbox = runPaths(workspace, plan.dagId).workspace;
    sumAfter = await readFile(join(sandbox, "src/sum.ts"), "utf8");
    fixed = /return\s+a\s*\+\s*b/.test(sumAfter);
  } catch {}
} catch (e) {
  error = e.message;
}

const wallMs = Date.now() - start;

console.log("--- RESULT ---");
console.log(JSON.stringify({ fixed, tokensIn, tokensOut, retries, wallMs, error }, null, 2));
console.log("--- src/sum.ts after run ---");
console.log(sumAfter || "(not written)");

console.log("--- decision log events (kind counts) ---");
try {
  const paths = runPaths(
    workspace,
    await (async () => {
      const { readdir } = await import("node:fs/promises");
      const runs = await readdir(join(workspace, ".amase", "runs"));
      return runs[0];
    })(),
  );
  const log = new DecisionLog(paths.decisions);
  const entries = await log.readAll();
  const counts = {};
  for (const e of entries) counts[e.event] = (counts[e.event] || 0) + 1;
  console.log(JSON.stringify(counts, null, 2));
  console.log("--- last 6 entries ---");
  for (const e of entries.slice(-6)) console.log(JSON.stringify(e, null, 2).slice(0, 800));
  console.log("--- workspace file tree ---");
  const { readdir, stat } = await import("node:fs/promises");
  async function walk(dir, prefix = "") {
    const items = await readdir(dir).catch(() => []);
    for (const name of items) {
      if (name === "node_modules" || name === ".amase") continue;
      const p = join(dir, name);
      const s = await stat(p).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) {
        console.log(`${prefix + name}/`);
        await walk(p, `${prefix}  `);
      } else {
        console.log(`${prefix + name} (${s.size}b)`);
      }
    }
  }
  await walk(workspace);
} catch (e) {
  console.log("log read failed:", e.message);
}

await rm(workspace, { recursive: true, force: true }).catch(() => {});
