import { exec } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffSimilarity as computeDiffSimilarity } from "../diff-similarity.js";
import type { Fixture } from "../fixtures.js";
import type { BenchResult, RunOpts } from "../types.js";

const BENCH_WORKSPACES_DIR = join(process.cwd(), ".amase", "bench-workspaces");
const FIXTURE_TEST_TIMEOUT_MS = 90_000;
const CLAUDE_MAX_ATTEMPTS = 3;

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
  const workspace = await makeBenchWorkspace(`superpowers-${fx.id}`);
  const start = Date.now();
  let pass = false;
  let tokensIn = 0;
  let tokensOut = 0;
  const retries = 0;
  let error: string | undefined;

  try {
    await materializeTree(workspace, fx.beforeTree);
    await copyDir(fx.testsDir, join(workspace, "tests"));

    // Spawn claude CLI in non-interactive stream-json mode. The transcript is
    // emitted on stdout (there is no --transcript-out flag). We buffer stdout
    // and parse line-by-line after close. --permission-mode=bypassPermissions
    // is required for non-interactive fixture runs (no acceptAll option exists).
    let stdoutBuf = "";
    let stderrBuf = "";
    const command = `claude --model ${opts.model} --print --output-format=stream-json --verbose --permission-mode=bypassPermissions`;
    for (let attempt = 0; attempt < CLAUDE_MAX_ATTEMPTS; attempt++) {
      stdoutBuf = "";
      stderrBuf = "";
      error = undefined;
      await new Promise<void>((resolve) => {
        const child = exec(
          command,
          {
            cwd: workspace,
            env: process.env,
            maxBuffer: 10 * 1024 * 1024,
          },
          (err, stdout, stderr) => {
            stdoutBuf = stdout;
            stderrBuf = stderr;
            if (err) {
              error = (err as Error).message;
            }
            resolve();
          },
        );
        child.stdin?.write(fx.prompt);
        child.stdin?.end();
      });
      if (!error) break;
      if (attempt >= CLAUDE_MAX_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }

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

    const testResult = await runFixtureTests(workspace);
    pass = testResult.pass;
    if (!pass && !error) error = testResult.error;
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
    model: opts.model,
    runSeq: opts.runSeq,
    pass,
    tokensIn,
    tokensOut,
    tokensCached: 0, // real value wired in Task 8
    validatorFailures: 0, // real value wired in Task 7
    wallMs,
    diffSimilarity,
    retries,
    error,
  };
}
