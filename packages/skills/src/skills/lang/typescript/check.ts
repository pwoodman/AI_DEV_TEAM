import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const TS_IGNORE = /@ts-ignore(?!\s*--)/;
const ANY_CAST = /\bas\s+any\b/;
const BARE_ENUM = /^\s*export\s+enum\s+/m;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(ts|tsx)$/.test(p.path)) continue;
    if (TS_IGNORE.test(p.content)) {
      issues.push({
        file: p.path,
        message: "@ts-ignore without justification comment. Use @ts-expect-error and explain why.",
        severity: "warning",
      });
    }
    if (ANY_CAST.test(p.content)) {
      issues.push({
        file: p.path,
        message: "'as any' cast. Parse/validate instead, or use 'unknown' + narrowing.",
        severity: "warning",
      });
    }
    if (BARE_ENUM.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Avoid TS enums; prefer 'as const' object + union type.",
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
