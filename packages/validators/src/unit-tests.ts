import { spawn } from "node:child_process";
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";

export const unitTestsValidator: Validator = {
  name: "unit-tests",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await runCommand(
      "npx",
      ["vitest", "run", "--reporter=basic"],
      ctx.workspacePath,
    );
    if (code === 0) {
      return { validator: "unit-tests", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "unit-tests",
      ok: false,
      issues: [{ message: (stdout + stderr).slice(0, 2000), severity: "error" as const }],
      durationMs: Date.now() - start,
    };
  },
};

function runCommand(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
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
