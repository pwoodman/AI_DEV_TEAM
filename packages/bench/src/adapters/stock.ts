/**
 * Stock adapter — calls the Anthropic API directly with no AMASE infrastructure.
 * Minimal system prompt + raw task prompt + file context. Parses JSON patches
 * from the response and applies them, then runs fixture tests.
 *
 * This serves as a baseline: "what can bare Sonnet do without orchestration?"
 */
import { exec } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AnthropicClient } from "@amase/llm";
import { diffSimilarity as computeDiffSimilarity } from "../diff-similarity.js";
import type { Fixture } from "../fixtures.js";
import type { BenchResult, RunOpts } from "../types.js";

const BENCH_WORKSPACES_DIR = join(process.cwd(), ".amase", "bench-workspaces");
const FIXTURE_TEST_TIMEOUT_MS = 90_000;

const STOCK_SYSTEM = `You are an expert software engineer. Given a coding task and the current codebase files, output all required file changes as a single JSON object — no prose outside the JSON fence.

Output format (required):
\`\`\`json
{"patches":[{"path":"<relative path>","op":"create|modify|delete","content":"<full file content>"}]}
\`\`\`

Rules:
- "modify" and "create": emit complete new file content, not a diff.
- "delete": content may be empty string.
- Only touch files necessary to complete the task.`;

// ---------------------------------------------------------------------------
// Workspace helpers (same pattern as superpowers.ts)
// ---------------------------------------------------------------------------
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
        // skip unreadable
      }
    }
  }
  return acc;
}

function synthesizePatch(before: Map<string, string>, after: Map<string, string>): string {
  const paths = new Set<string>([...before.keys(), ...after.keys()]);
  const chunks: string[] = [];
  for (const p of [...paths].sort()) {
    chunks.push(p, before.get(p) ?? "", after.get(p) ?? "");
  }
  return chunks.join("\n");
}

async function makeBenchWorkspace(prefix: string): Promise<string> {
  await mkdir(BENCH_WORKSPACES_DIR, { recursive: true });
  return await mkdtemp(join(BENCH_WORKSPACES_DIR, `${prefix}-`));
}

async function runFixtureTests(workspace: string): Promise<{ pass: boolean; error?: string }> {
  const configPath = join(process.cwd(), "packages/bench/vitest.fixture.config.ts");
  const command = `pnpm exec vitest run --root "${workspace}" --config "${configPath}" --reporter=dot`;
  const result = await new Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      exec(
        command,
        { timeout: FIXTURE_TEST_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, cwd: process.cwd(), env: process.env },
        (err, stdout, stderr) => {
          if (!err) { resolve({ code: 0, stdout, stderr, timedOut: false }); return; }
          const e = err as Error & { code?: number | string; killed?: boolean };
          const numericCode = typeof e.code === "number" ? e.code : Number.isFinite(Number(e.code)) ? Number(e.code) : 1;
          resolve({ code: numericCode, stdout, stderr, timedOut: e.killed === true });
        },
      );
    },
  );
  if (result.code === 0) return { pass: true };
  const tail = (result.stderr || result.stdout).trim().slice(-700);
  return { pass: false, error: result.timedOut ? `fixture-tests-timeout-${FIXTURE_TEST_TIMEOUT_MS}ms` : tail || `fixture-tests-exit-${result.code}` };
}

// ---------------------------------------------------------------------------
// Patch parsing
// ---------------------------------------------------------------------------
interface Patch { path: string; op: string; content: string }

function parsePatches(text: string): Patch[] {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenceMatch?.[1] ?? text;
  try {
    const parsed = JSON.parse(jsonText.trim()) as { patches?: Patch[] };
    return parsed.patches ?? [];
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return [];
    try {
      const parsed = JSON.parse(text.slice(first, last + 1)) as { patches?: Patch[] };
      return parsed.patches ?? [];
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------
export async function runStock(fx: Fixture, opts: RunOpts): Promise<BenchResult> {
  const workspace = await makeBenchWorkspace(`stock-${fx.id}`);
  const start = Date.now();
  let pass = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let diffSimilarity = 0;
  let error: string | undefined;

  try {
    await materializeTree(workspace, fx.beforeTree);
    await copyDir(fx.testsDir, join(workspace, "tests"));

    // Build user message: task + all source files from beforeTree
    const fileContext = [...fx.beforeTree.entries()]
      .filter(([p]) => !p.includes("node_modules") && !p.includes(".git"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([p, c]) => `--- ${p} ---\n${c}`)
      .join("\n\n");

    const userMessage = `Task:\n${fx.prompt.trim()}\n\nCurrent codebase:\n${fileContext}`;

    const llm = new AnthropicClient();
    const result = await llm.call({
      system: STOCK_SYSTEM,
      user: userMessage,
      maxTokens: 4096,
      model: opts.model,
    });

    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;

    const patches = parsePatches(result.text);
    if (patches.length === 0 && result.text.length > 0) {
      error = "no patches parsed from model response";
    }

    for (const patch of patches) {
      const abs = join(workspace, patch.path);
      await mkdir(dirname(abs), { recursive: true });
      if (patch.op === "delete") {
        await rm(abs, { force: true });
      } else {
        await writeFile(abs, patch.content);
      }
    }

    const testResult = await runFixtureTests(workspace);
    pass = testResult.pass;
    if (!pass && !error) error = testResult.error;
  } catch (e) {
    error = (e as Error).message;
  }

  const wallMs = Date.now() - start;

  try {
    const afterTree = await readTreeFromDisk(workspace);
    diffSimilarity = computeDiffSimilarity(synthesizePatch(fx.beforeTree, afterTree), fx.expectedPatch);
  } catch { /* leave 0 */ }

  await rm(workspace, { recursive: true, force: true }).catch(() => {});

  return {
    runId: opts.runId,
    timestamp: new Date().toISOString(),
    taskId: fx.id,
    stack: "stock",
    model: opts.model,
    runSeq: opts.runSeq,
    pass,
    tokensIn,
    tokensOut,
    tokensCached: 0,
    validatorFailures: 0,
    wallMs,
    diffSimilarity,
    retries: 0,
    error,
  };
}
