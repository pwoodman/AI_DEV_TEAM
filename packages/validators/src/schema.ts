import { type AgentOutput, AgentOutputSchema } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";

export const schemaValidator: Validator = {
  name: "schema",
  async run(output: AgentOutput, _ctx: ValidatorContext) {
    const start = Date.now();
    const res = AgentOutputSchema.safeParse(output);
    if (res.success) {
      return { validator: "schema", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "schema",
      ok: false,
      issues: res.error.issues.map((i) => ({
        message: `${i.path.join(".")}: ${i.message}`,
        severity: "error" as const,
      })),
      durationMs: Date.now() - start,
    };
  },
};
