import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const unitTestsValidator: Validator = {
  name: "unit-tests",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
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
