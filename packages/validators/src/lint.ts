import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const lintValidator: Validator = {
  name: "lint",
  async run(output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const paths = output.patches.filter((p) => p.op !== "delete").map((p) => p.path);
    if (paths.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["biome", "check", ...paths],
      ctx.workspacePath,
    );
    if (code === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "lint",
      ok: false,
      issues: [{ message: (stdout + stderr).slice(0, 1000), severity: "error" as const }],
      durationMs: Date.now() - start,
    };
  },
};
