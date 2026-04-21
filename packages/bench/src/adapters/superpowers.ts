import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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
 * Walk any JSON object and sum every `{ input_tokens, output_tokens }` pair
 * we find at any nesting level. Claude CLI stream-json nests usage under
 * `message.usage` for assistant events — this is defensive for other shapes.
 */
function extractUsage(obj: unknown): { in: number; out: number } {
  let i = 0;
  let o = 0;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const r = v as Record<string, unknown>;
    if (typeof r.input_tokens === "number" && typeof r.output_tokens === "number") {
      i += r.input_tokens;
      o += r.output_tokens;
    }
    for (const k of Object.keys(r)) visit(r[k]);
  };
  visit(obj);
  return { in: i, out: o };
}

export async function runSuperpowers(fx: Fixture, opts: RunOpts): Promise<BenchResult> {
  const workspace = await mkdtemp(join(tmpdir(), `superpowers-bench-${fx.id}-`));
  const start = Date.now();
  let pass = false;
  let tokensIn = 0;
  let tokensOut = 0;
  const retries = 0;
  let error: string | undefined;

  try {
    await materializeTree(workspace, fx.beforeTree);

    // Spawn claude CLI in non-interactive stream-json mode. The transcript is
    // emitted on stdout (there is no --transcript-out flag). We buffer stdout
    // and parse line-by-line after close. --permission-mode=bypassPermissions
    // is required for non-interactive fixture runs (no acceptAll option exists).
    const args = [
      "--print",
      "--output-format=stream-json",
      "--verbose",
      "--permission-mode=bypassPermissions",
      fx.prompt,
    ];

    let stdoutBuf = "";
    let stderrBuf = "";

    await new Promise<void>((resolve) => {
      const child = spawn("claude", args, {
        cwd: workspace,
        env: process.env,
        shell: process.platform === "win32",
      });
      child.stdout.on("data", (chunk) => {
        stdoutBuf += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderrBuf += String(chunk);
      });
      child.on("error", (e) => {
        error = (e as Error).message;
        resolve();
      });
      child.on("close", () => {
        resolve();
      });
    });

    for (const line of stdoutBuf.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed) as unknown;
        const u = extractUsage(ev);
        tokensIn += u.in;
        tokensOut += u.out;
      } catch {
        // non-JSON line — ignore
      }
    }

    if (!error && stderrBuf.trim() && tokensIn === 0 && tokensOut === 0) {
      error = stderrBuf.trim().slice(0, 500);
    }

    // Task 5 scope: cannot run fixture vitest suite (no node_modules in
    // fixture workspace, no shared test runner scoped). Mark pass=false
    // with a sentinel error noting the limitation.
    pass = false;
    if (!error) error = "test-runner-not-scoped";
  } catch (e) {
    error = (e as Error).message;
  }

  const wallMs = Date.now() - start;

  let diffSimilarity = 0;
  try {
    const afterTree = await readTreeFromDisk(workspace);
    const observedPatch = synthesizePatch(fx.beforeTree, afterTree);
    diffSimilarity = computeDiffSimilarity(observedPatch, fx.expectedPatch);
  } catch {
    // leave diffSimilarity = 0
  }

  await rm(workspace, { recursive: true, force: true }).catch(() => {});

  return {
    runId: opts.runId,
    timestamp: new Date().toISOString(),
    taskId: fx.id,
    stack: "superpowers",
    pass,
    tokensIn,
    tokensOut,
    wallMs,
    diffSimilarity,
    retries,
    error,
  };
}
