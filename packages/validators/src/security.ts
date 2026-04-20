import type { AgentOutput, Language, ValidationResult } from "@amase/contracts";
import { ALL_SKILLS, runSkillChecks } from "@amase/skills";
import type { Validator, ValidatorContext } from "./chain.js";

export function buildSecurityValidator(opts: { language?: Language } = {}): Validator {
  return {
    name: "security",
    async run(output: AgentOutput, ctx: ValidatorContext): Promise<ValidationResult> {
      const start = Date.now();
      const securitySkills = ALL_SKILLS.filter(
        (s) => s.id.startsWith("security/") && typeof s.check === "function",
      );
      const results = await runSkillChecks(securitySkills, output.patches, {
        workspacePath: ctx.workspacePath,
        allowedPaths: ctx.allowedPaths,
        language: opts.language,
      });
      const issues = results.flatMap((r) => r.issues);
      return {
        validator: "security",
        ok: issues.every((i) => i.severity !== "error"),
        issues,
        durationMs: Date.now() - start,
      };
    },
  };
}
