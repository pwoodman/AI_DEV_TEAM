import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const typecheckValidator: Validator = {
  name: "typecheck",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["tsc", "--noEmit"],
      ctx.workspacePath,
    );
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
    if (!m) continue;
    const [, file, lineNo, message] = m;
    if (!file || !lineNo || !message) continue;
    issues.push({ file, line: Number(lineNo), message, severity: "error" });
  }
  if (issues.length === 0 && text.trim()) {
    issues.push({ message: text.slice(0, 500), severity: "error" });
  }
  return issues;
}
