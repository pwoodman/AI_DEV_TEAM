import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { FixtureLanguage } from "./fixtures.js";

const TYPECHECK_TIMEOUT_MS = 60_000;

export interface TypecheckResult {
  ok: boolean;
  error?: string;
}

async function run(
  cmd: string,
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    exec(
      cmd,
      { cwd, timeout: TYPECHECK_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        if (!err) return resolve({ code: 0, stdout, stderr, timedOut: false });
        const e = err as Error & { code?: number | string; killed?: boolean };
        const code =
          typeof e.code === "number" ? e.code : Number.isFinite(Number(e.code)) ? Number(e.code) : 1;
        resolve({ code, stdout, stderr, timedOut: e.killed === true });
      },
    );
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runTypecheck(
  workspace: string,
  language: FixtureLanguage,
): Promise<TypecheckResult> {
  if (language !== "ts" && language !== "js") {
    return { ok: true };
  }
  const hasTsconfig = await exists(join(workspace, "tsconfig.json"));
  const cmd = hasTsconfig
    ? "pnpm exec tsc --noEmit -p tsconfig.json"
    : "pnpm exec tsc --noEmit --target ES2022 --module ES2022 --moduleResolution bundler --strict --allowImportingTsExtensions --skipLibCheck **/*.ts";
  const r = await run(cmd, workspace);
  if (r.code === 0) return { ok: true };
  const tail = (r.stderr || r.stdout).trim().slice(-700);
  return {
    ok: false,
    error: r.timedOut
      ? `typecheck-timeout-${TYPECHECK_TIMEOUT_MS}ms`
      : tail || `typecheck-exit-${r.code}`,
  };
}
