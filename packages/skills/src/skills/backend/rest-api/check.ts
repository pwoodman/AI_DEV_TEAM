import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const VERB_IN_PATH =
  /["'`](?:GET|POST|PUT|PATCH|DELETE)?\s*\/[a-zA-Z0-9_\-\/]*\/(?:get|create|update|delete|fetch|list|remove|add)[A-Z][a-zA-Z]*/;
const STACK_LEAK = /res\.(?:send|json)\s*\(\s*(?:err|error)(?:\.stack)?\s*\)/;
const RAW_SQL_IN_RESPONSE = /res\.(?:send|json)\s*\(\s*(?:query|sql|db\.)/;
const PLAIN_TEXT_ERROR = /res\.(?:status|sendStatus)\s*\(\s*(?:500|502|503|504)\s*\)[^.]*[^}]*$/m;
const MISSING_PAGINATION = /(?:findAll|getAll|listAll|SELECT\s+\*\s+FROM)/i;
const NO_RATE_LIMIT = /(?:app\.|router\.)\.(?:get|post|put|patch|delete)\s*\(\s*['"]`/;
const RATE_LIMIT_IMPORT = /(?:rate.?limit|throttl|express.?rate)/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;

    if (VERB_IN_PATH.test(content)) {
      issues.push({
        file: p.path,
        message: "REST path contains a verb (e.g. /getUser). Use HTTP methods on nouns.",
        severity: "warning",
      });
    }
    if (STACK_LEAK.test(content)) {
      issues.push({
        file: p.path,
        message: "Error object / stack trace sent to client. Return a safe error envelope instead.",
        severity: "error",
      });
    }
    if (RAW_SQL_IN_RESPONSE.test(content)) {
      issues.push({
        file: p.path,
        message: "Raw query/SQL object sent in response. Map to DTO before responding.",
        severity: "error",
      });
    }
    if (PLAIN_TEXT_ERROR.test(content)) {
      issues.push({
        file: p.path,
        message: "Error response appears to return plain status without structured error envelope.",
        severity: "warning",
      });
    }
    if (MISSING_PAGINATION.test(content) && !/limit|offset|cursor|page|take|skip/i.test(content)) {
      issues.push({
        file: p.path,
        message: "List query without pagination. Add limit/cursor/page parameters.",
        severity: "warning",
      });
    }
    if (NO_RATE_LIMIT.test(content) && !RATE_LIMIT_IMPORT.test(content)) {
      issues.push({
        file: p.path,
        message: "Route handler without rate limiting. Add rate limit middleware.",
        severity: "warning",
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
