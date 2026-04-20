import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const DESTRUCTIVE = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|ALTER\s+TABLE\s+\S+\s+RENAME\s+COLUMN)\b/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.sql$|migrations?/.test(p.path)) continue;
    if (DESTRUCTIVE.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Destructive migration (DROP/TRUNCATE/RENAME) in a single step. Stage it as add → dual-write → backfill → drop.",
        severity: "warning",
      });
    }
    if (/NOT NULL/i.test(p.content) && /ALTER\s+TABLE/i.test(p.content) && !/DEFAULT/i.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Adding NOT NULL column without DEFAULT will block on backfill for large tables.",
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
