import { exec } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildAgentRegistry } from "@amase/agents";
import { Orchestrator } from "@amase/core";
import { AnthropicClient, type LlmClient, StubLlmClient } from "@amase/llm";
import { DAGStore, DecisionLog, runPaths } from "@amase/memory";
import { patchSafetyValidator, schemaValidator } from "@amase/validators";
import { diffSimilarity as computeDiffSimilarity } from "../diff-similarity.js";
import type { Fixture } from "../fixtures.js";
import { runTypecheck } from "../typecheck-gate.js";
import type { BenchResult, RunOpts } from "../types.js";

const BENCH_WORKSPACES_DIR = join(process.cwd(), ".amase", "bench-workspaces");
const FIXTURE_TEST_TIMEOUT_MS = 90_000;

async function materializeTree(dest: string, tree: Map<string, string>): Promise<void> {
  for (const [rel, content] of tree) {
    const abs = join(dest, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
}

async function copyDir(srcDir: string, destDir: string): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await mkdir(dest, { recursive: true });
      await copyDir(src, dest);
    } else if (entry.isFile()) {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, await readFile(src, "utf8"));
    }
  }
}

async function readTreeFromDisk(
  root: string,
  acc = new Map<string, string>(),
  rel = "",
): Promise<Map<string, string>> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = (await readdir(join(root, rel), { withFileTypes: true })) as unknown as Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
  } catch {
    return acc;
  }
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await readTreeFromDisk(root, acc, relPath);
    else if (e.isFile()) {
      try {
        acc.set(relPath, await readFile(join(root, relPath), "utf8"));
      } catch {
        // skip unreadable (binary, permissions, etc.)
      }
    }
  }
  return acc;
}

/**
 * Build a synthetic unified-diff-ish string by walking both trees and
 * concatenating `path + before + after` for every file in either tree.
 * Jaccard doesn't care about real diff format; this gives a dependency-free,
 * deterministic observed patch.
 */
function synthesizePatch(before: Map<string, string>, after: Map<string, string>): string {
  const paths = new Set<string>([...before.keys(), ...after.keys()]);
  const sorted = [...paths].sort();
  const chunks: string[] = [];
  for (const p of sorted) {
    chunks.push(p);
    chunks.push(before.get(p) ?? "");
    chunks.push(after.get(p) ?? "");
  }
  return chunks.join("\n");
}

async function makeBenchWorkspace(prefix: string): Promise<string> {
  await mkdir(BENCH_WORKSPACES_DIR, { recursive: true });
  return await mkdtemp(join(BENCH_WORKSPACES_DIR, `${prefix}-`));
}

function pickContextFiles(tree: Map<string, string>): string[] {
  const score = (p: string): number => {
    let s = 0;
    if (p.startsWith("src/")) s += 3;
    if (p.startsWith("tests/")) s -= 2;
    if (/\.(ts|tsx|js|jsx|py|go|sql)$/.test(p)) s += 2;
    return s;
  };
  return [...tree.keys()]
    .filter((p) => !p.startsWith("tests/"))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 2);
}

async function runFixtureTests(workspace: string): Promise<{ pass: boolean; error?: string }> {
  const configPath = join(process.cwd(), "packages/bench/vitest.fixture.config.ts");
  const command = `pnpm exec vitest run --root "${workspace}" --config "${configPath}" --reporter=dot`;
  const result = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolve) => {
    exec(
      command,
      {
        timeout: FIXTURE_TEST_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
        env: process.env,
      },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ code: 0, stdout, stderr, timedOut: false });
          return;
        }
        const e = err as Error & { code?: number | string; killed?: boolean };
        const numericCode =
          typeof e.code === "number"
            ? e.code
            : Number.isFinite(Number(e.code))
              ? Number(e.code)
              : 1;
        resolve({ code: numericCode, stdout, stderr, timedOut: e.killed === true });
      },
    );
  });

  if (result.code === 0) return { pass: true };
  const tail = (result.stderr || result.stdout).trim().slice(-700);
  return {
    pass: false,
    error: result.timedOut
      ? `fixture-tests-timeout-${FIXTURE_TEST_TIMEOUT_MS}ms`
      : tail || `fixture-tests-exit-${result.code}`,
  };
}

/**
 * Infer the agent kind from a prompt text, mirroring Orchestrator.inferFallbackKind.
 */
function inferKindFromPrompt(text: string): string {
  const t = text.toLowerCase();
  if (/\b(component|frontend|css|react|prop)\b/.test(t)) return "frontend";
  if (/\b(ui test|playwright)\b/.test(t)) return "ui-test";
  if (/\b(test|vitest)\b/.test(t)) return "test-gen";
  if (/\b(refactor|migrate|rename)\b/.test(t)) return "refactor";
  return "backend";
}

/**
 * Build a stub LLM responder that mimics the smoke-orchestrator.mjs approach.
 * The architect emits a task-graph with a single node whose kind is inferred
 * from the prompt, and the downstream agent emits a placeholder patch.
 * The stub LLM path does not produce a correct fix — pass=false is expected
 * at Task 3 scope.
 */
function buildStubResponder(workspacePath: string, prompt: string, contextFiles: string[]) {
  return (req: { system: string | { text: string }[]; user: string }) => {
    const systemText =
      typeof req.system === "string" ? req.system : req.system.map((b) => b.text).join("\n");
    const isArchitect = systemText.includes("Architect Agent");
    if (isArchitect) {
      const kind = inferKindFromPrompt(prompt);
      const graph = {
        dagId: "will-be-overwritten",
        request: prompt,
        workspacePath,
        createdAt: new Date().toISOString(),
        nodes: [
          {
            id: "n1",
            kind,
            goal: prompt,
            dependsOn: [],
            allowedPaths: ["src/"],
            ...(contextFiles.length > 0 ? { contextSlice: { files: contextFiles } } : {}),
          },
        ],
      };
      return JSON.stringify({
        taskId: "bootstrap",
        patches: [{ path: ".amase/task-graph.json", op: "create", content: JSON.stringify(graph) }],
        notes: "stub plan",
      });
    }
    // Stub patch for any other agent — placeholder that won't actually fix the fixture.
    return JSON.stringify({
      taskId: "t",
      patches: [
        {
          path: "src/stub-output.ts",
          op: "create",
          content: "// stub LLM output\nexport const stub = true;\n",
        },
      ],
      notes: "stub patch",
    });
  };
}

function debugLog(event: string, data: Record<string, unknown>): void {
  if (process.env.AMASE_DEBUG_BENCH) {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
  }
}

export async function runAmase(fx: Fixture, opts: RunOpts): Promise<BenchResult> {
  // Live runs must not set AMASE_LLM_STUB — that's what forces the stub path
  // inside mcp-server and friends. For stub/unit benches we keep it on.
  if (!opts.live) {
    process.env.AMASE_LLM_STUB = "1";
  } else {
    process.env.AMASE_LLM_STUB = undefined;
  }

  debugLog("amase.run.start", { taskId: fx.id, runId: opts.runId, live: opts.live, model: opts.model });

  const workspace = await makeBenchWorkspace(`amase-${fx.id}`);
  let dagId: string | undefined;

  try {
    await materializeTree(workspace, fx.beforeTree);
    await copyDir(fx.testsDir, join(workspace, "tests"));
    debugLog("amase.workspace.ready", { taskId: fx.id, workspace, fileCount: fx.beforeTree.size });

    const contextFiles = pickContextFiles(fx.beforeTree);
    debugLog("amase.context.picked", { taskId: fx.id, contextFiles });

    const llm: LlmClient = opts.live
      ? opts.fairness === "primary"
        ? new AnthropicClient({ model: opts.model })
        : new AnthropicClient()  // router/env-driven in secondary
      : new StubLlmClient(buildStubResponder(workspace, fx.prompt, contextFiles));
    const agents = buildAgentRegistry(llm);
    const store = new DAGStore();
    const orchestrator = new Orchestrator({
      agents,
      validators: [schemaValidator, patchSafetyValidator],
      store,
      makeDecisionLog: (p) => new DecisionLog(p),
    });

    const start = Date.now();
    let pass = false;
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let retries = 0;
    let validatorFailures = 0;
    let error: string | undefined;

    try {
      debugLog("amase.plan.start", { taskId: fx.id });
      const planResult = await orchestrator.plan({ request: fx.prompt, workspacePath: workspace });
      dagId = planResult.dagId;
      debugLog("amase.plan.done", { taskId: fx.id, dagId, nodeCount: planResult.graph.nodes.length });

      debugLog("amase.execute.start", { taskId: fx.id, dagId });
      await orchestrator.execute(dagId);
      debugLog("amase.execute.done", { taskId: fx.id, dagId });

      // Choice B: aggregate token metrics from the decision log.
      const paths = runPaths(workspace, dagId);
      const log = new DecisionLog(paths.decisions);
      const entries = await log.readAll();

      for (const entry of entries) {
        if (entry.event === "llm.call") {
          const data = entry.data as {
            tokensIn?: number;
            tokensOut?: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
          };
          tokensIn += data.tokensIn ?? 0;
          tokensOut += data.tokensOut ?? 0;
          cacheReadTokens += data.cacheReadTokens ?? 0;
          cacheWriteTokens += data.cacheWriteTokens ?? 0;
        }
        if (entry.event === "node.retried") {
          retries += 1;
        }
        if (entry.event === "validator.failed") {
          validatorFailures += 1;
        }
      }
      debugLog("amase.metrics.aggregated", { taskId: fx.id, tokensIn, tokensOut, cacheReadTokens, cacheWriteTokens, retries, validatorFailures, logEntries: entries.length });

      // Execute fixture tests against the produced workspace to score pass/fail.
      debugLog("amase.tests.start", { taskId: fx.id, workspace: paths.workspace });
      const tcResult = await runTypecheck(paths.workspace, fx.meta.language);
      if (!tcResult.ok) {
        pass = false;
        error = error ?? `typecheck: ${tcResult.error ?? "failed"}`;
      } else {
        const testResult = await runFixtureTests(paths.workspace);
        debugLog("amase.tests.done", { taskId: fx.id, pass: testResult.pass, error: testResult.error });
        pass = testResult.pass;
        if (!pass && !error) error = testResult.error;
      }
    } catch (e) {
      error = (e as Error).message;
      debugLog("amase.run.error", { taskId: fx.id, error });
    }

    const wallMs = Date.now() - start;

    // Task 4: compute real diff similarity via Jaccard over a synthetic
    // "path + before + after" concatenation of both trees, compared against
    // the fixture's expected.patch.
    let diffSimilarity = 0;
    if (dagId) {
      const sandbox = runPaths(workspace, dagId).workspace;
      const afterTree = await readTreeFromDisk(sandbox);
      const observedPatch = synthesizePatch(fx.beforeTree, afterTree);
      diffSimilarity = computeDiffSimilarity(observedPatch, fx.expectedPatch);
      debugLog("amase.diff.computed", { taskId: fx.id, diffSimilarity });
    }

    const result: BenchResult = {
      runId: opts.runId,
      timestamp: new Date().toISOString(),
      taskId: fx.id,
      stack: "amase",
      model: opts.fairness === "primary" ? opts.model : (process.env.AMASE_MODEL ?? "router"),
      runSeq: opts.runSeq,
      pass,
      tokensIn,
      tokensOut,
      tokensCached: cacheReadTokens,
      validatorFailures,
      wallMs,
      diffSimilarity,
      retries,
      error,
    };
    debugLog("amase.run.finish", { taskId: fx.id, pass, wallMs, diffSimilarity, retries });
    return result;
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
    debugLog("amase.workspace.cleaned", { taskId: fx.id, workspace });
  }
}
