import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const IMG_NO_ALT = /<img\b(?![^>]*\balt\s*=)[^>]*>/i;
const CLICK_ON_DIV = /<div\b[^>]*\bonClick\s*=/i;
const PLACEHOLDER_NO_LABEL = /<input\b[^>]*\bplaceholder\s*=\s*["'][^"']+["'][^>]*>/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(tsx|jsx|html)$/.test(p.path)) continue;
    if (IMG_NO_ALT.test(p.content)) {
      issues.push({ file: p.path, message: "<img> without alt attribute.", severity: "warning" });
    }
    if (CLICK_ON_DIV.test(p.content)) {
      issues.push({ file: p.path, message: "onClick on <div>. Use <button> for interactive elements.", severity: "warning" });
    }
    if (PLACEHOLDER_NO_LABEL.test(p.content) && !/<label\b/i.test(p.content)) {
      issues.push({ file: p.path, message: "Input uses placeholder but file has no <label>. Labels are required for a11y.", severity: "warning" });
    }
  }
  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
