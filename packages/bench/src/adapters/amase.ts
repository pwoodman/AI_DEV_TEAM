import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildAgentRegistry } from "@amase/agents";
import { Orchestrator } from "@amase/core";
import { StubLlmClient } from "@amase/llm";
import { DAGStore, DecisionLog, runPaths } from "@amase/memory";
import { patchSafetyValidator, schemaValidator } from "@amase/validators";
import { diffSimilarity as computeDiffSimilarity } from "../diff-similarity.js";
import type { Fixture } from "../fixtures.js";
import type { BenchResult, RunOpts } from "../types.js";

async function materializeTree(dest: string, tree: Map<string, string>): Promise<void> {
  for (const [rel, content] of tree) {
    const abs = join(dest, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
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

/**
 * Build a stub LLM responder that mimics the smoke-orchestrator.mjs approach.
 * The architect emits a task-graph with a single refactor node, and the refactor
 * agent emits a placeholder patch. The stub LLM path does not produce a correct
 * fix — pass=false is expected at Task 3 scope.
 */
function buildStubResponder(workspacePath: string, prompt: string) {
  return (req: { system: string; user: string }) => {
    const isArchitect = req.system.includes("Architect Agent");
    if (isArchitect) {
      const graph = {
        dagId: "will-be-overwritten",
        request: prompt,
        workspacePath,
        createdAt: new Date().toISOString(),
        nodes: [
          {
            id: "n1",
            kind: "refactor",
            goal: prompt,
            dependsOn: [],
            allowedPaths: ["src/"],
          },
        ],
      };
      return JSON.stringify({
        taskId: "bootstrap",
        patches: [
          { path: ".amase/task-graph.json", op: "create", content: JSON.stringify(graph) },
        ],
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
          content: `// stub LLM output\nexport const stub = true;\n`,
        },
      ],
      notes: "stub patch",
    });
  };
}

export async function runAmase(fx: Fixture, opts: RunOpts): Promise<BenchResult> {
  // Force stub LLM path for Task 3.
  process.env.AMASE_LLM_STUB = "1";

  const workspace = await mkdtemp(join(tmpdir(), `amase-bench-${fx.id}-`));
  let dagId: string | undefined;

  try {
    await materializeTree(workspace, fx.beforeTree);

    const llm = new StubLlmClient(buildStubResponder(workspace, fx.prompt));
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
    let retries = 0;
    let error: string | undefined;

    try {
      const planResult = await orchestrator.plan({ request: fx.prompt, workspacePath: workspace });
      dagId = planResult.dagId;

      await orchestrator.execute(dagId);

      // Choice B: aggregate token metrics from the decision log.
      const paths = runPaths(workspace, dagId);
      const log = new DecisionLog(paths.decisions);
      const entries = await log.readAll();

      for (const entry of entries) {
        if (entry.event === "llm.call") {
          const data = entry.data as { tokensIn?: number; tokensOut?: number };
          tokensIn += data.tokensIn ?? 0;
          tokensOut += data.tokensOut ?? 0;
        }
        if (entry.event === "node.retried") {
          retries += 1;
        }
      }

      // Task 3 scope: skip running fixture tests (no node_modules in temp worktree).
      // pass remains false — the stub LLM doesn't produce a real fix anyway.
      pass = false;
    } catch (e) {
      error = (e as Error).message;
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
    }

    return {
      runId: opts.runId,
      timestamp: new Date().toISOString(),
      taskId: fx.id,
      stack: "amase",
      pass,
      tokensIn,
      tokensOut,
      wallMs,
      diffSimilarity,
      retries,
      error,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}
