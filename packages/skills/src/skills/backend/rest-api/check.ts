import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const VERB_IN_PATH =
  /["'`](?:GET|POST|PUT|PATCH|DELETE)?\s*\/[a-zA-Z0-9_\-\/]*\/(?:get|create|update|delete|fetch|list)[A-Z][a-zA-Z]*/;
const STACK_LEAK = /res\.(?:send|json)\s*\(\s*(?:err|error)(?:\.stack)?\s*\)/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (VERB_IN_PATH.test(p.content)) {
      issues.push({
        file: p.path,
        message: "REST path contains a verb (e.g. /getUser). Use HTTP methods on nouns.",
        severity: "warning",
      });
    }
    if (STACK_LEAK.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Error object / stack trace sent to client. Return a safe error envelope instead.",
        severity: "error",
      });
    }
  }
  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
