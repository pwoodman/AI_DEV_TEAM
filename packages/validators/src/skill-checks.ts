import type { AgentOutput, Language, ValidationResult } from "@amase/contracts";
import { getSkill, runSkillChecks } from "@amase/skills";
import type { Validator, ValidatorContext } from "./chain.js";

export function buildSkillChecksValidator(opts: {
  skillIds: string[];
  language?: Language;
}): Validator {
  return {
    name: "skill-checks",
    async run(output: AgentOutput, ctx: ValidatorContext): Promise<ValidationResult> {
      const start = Date.now();
      const skills = opts.skillIds
        .map((id) => getSkill(id))
        .filter((s): s is NonNullable<typeof s> => !!s && !!s.check);

      const results = await runSkillChecks(skills, output.patches, {
        workspacePath: ctx.workspacePath,
        allowedPaths: ctx.allowedPaths,
        language: opts.language,
      });

      const issues = results.flatMap((r) => r.issues);
      const ok = issues.every((i) => i.severity !== "error");
      return {
        validator: "skill-checks",
        ok,
        issues,
        durationMs: Date.now() - start,
      };
    },
  };
}
