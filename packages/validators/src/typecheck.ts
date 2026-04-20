import { spawn } from "node:child_process";
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";

export const typecheckValidator: Validator = {
  name: "typecheck",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await runCommand("npx", ["tsc", "--noEmit"], ctx.workspacePath);
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseTscOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },
};

function parseTscOutput(text: string) {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),\d+\):\s+error\s+(.+)$/);
    if (m) issues.push({ file: m[1], line: Number(m[2]), message: m[3]!, severity: "error" });
  }
  if (issues.length === 0 && text.trim()) {
    issues.push({ message: text.slice(0, 500), severity: "error" });
  }
  return issues;
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
