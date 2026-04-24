import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const TS_IGNORE = /@ts-ignore(?!\s*--)/;
const TS_EXPECT_ERROR_WITHOUT_REASON = /@ts-expect-error\s*$/m;
const ANY_CAST = /\bas\s+any\b/;
const BARE_ENUM = /^\s*export\s+enum\s+/m;
const NON_NULL_ASSERTION = /\w+!\s*[.;,=)]/;
const IMPLICIT_ANY_PARAM = /\bfunction\s+\w*\s*\(\s*\w+\s*\)/;
const TYPE_ASSERTION = /\bas\s+\w+/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(ts|tsx)$/.test(p.path)) continue;
    const content = p.content;

    if (TS_IGNORE.test(content)) {
      issues.push({
        file: p.path,
        message: "@ts-ignore without justification comment. Use @ts-expect-error with explanation.",
        severity: "warning",
      });
    }

    if (TS_EXPECT_ERROR_WITHOUT_REASON.test(content)) {
      issues.push({
        file: p.path,
        message:
          "@ts-expect-error without explanation. Add a comment describing why the error is expected.",
        severity: "warning",
      });
    }

    if (ANY_CAST.test(content)) {
      issues.push({
        file: p.path,
        message: "'as any' cast. Parse/validate instead, or use 'unknown' + narrowing.",
        severity: "warning",
      });
    }

    if (BARE_ENUM.test(content)) {
      issues.push({
        file: p.path,
        message: "Avoid TS enums; prefer 'as const' object + union type.",
        severity: "warning",
      });
    }

    const nonNullMatches = content.match(NON_NULL_ASSERTION);
    if (nonNullMatches && nonNullMatches.length > 3) {
      issues.push({
        file: p.path,
        message: `Excessive non-null assertions (!) detected (${nonNullMatches.length}). Use null checks or proper typing instead.`,
        severity: "warning",
      });
    }

    if (/\bJSON\.parse\b/.test(content) && !/\b(zod|valibot|io-ts|runtypes|joi)\b/i.test(content)) {
      issues.push({
        file: p.path,
        message:
          "JSON.parse without runtime validation. Use Zod, Valibot, or io-ts to validate untrusted input.",
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
