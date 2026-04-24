import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const IMG_NO_ALT = /<img\b(?![^>]*\balt\s*=)[^>]*>/i;
const CLICK_ON_DIV = /<div\b[^>]*\bonClick\s*=/i;
const CLICK_ON_SPAN = /<span\b[^>]*\bonClick\s*=/i;
const PLACEHOLDER_NO_LABEL = /<input\b[^>]*\bplaceholder\s*=\s*["'][^"']+["'][^>]*>/i;
const NO_OUTLINE = /outline\s*:\s*none|outline\s*:\s*0/i;
const ARIA_LIVE = /aria-live|role\s*=\s*"(?:status|alert|log)"/i;
const ARIA_LABEL_MISSING = /<button\b[^>]*>(?![\s\S]*?<\/button>)[^>]*>[^<]*<\/button>/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(tsx|jsx|html|vue|svelte)$/.test(p.path)) continue;
    const content = p.content;

    if (IMG_NO_ALT.test(content)) {
      issues.push({ file: p.path, message: "<img> without alt attribute.", severity: "warning" });
    }
    if (CLICK_ON_DIV.test(content)) {
      issues.push({
        file: p.path,
        message:
          "onClick on <div>. Use <button> for interactive elements or add role, tabindex, and keyboard handlers.",
        severity: "warning",
      });
    }
    if (CLICK_ON_SPAN.test(content)) {
      issues.push({
        file: p.path,
        message:
          "onClick on <span>. Use <button> for interactive elements or add role, tabindex, and keyboard handlers.",
        severity: "warning",
      });
    }
    if (
      PLACEHOLDER_NO_LABEL.test(content) &&
      !/<label\b|aria-label|aria-labelledby/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Input uses placeholder but has no <label> or aria-label. Labels are required for a11y.",
        severity: "warning",
      });
    }
    if (
      NO_OUTLINE.test(content) &&
      !/focus-visible|focus-within|focus\s*\{[^}]*outline/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "outline: none detected without visible focus replacement. Keyboard users need visible focus indicators.",
        severity: "warning",
      });
    }
    if (
      /setTimeout|setInterval|fetch|axios/i.test(content) &&
      !ARIA_LIVE.test(content) &&
      !/toast|snackbar|notification/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Async operation detected but no aria-live region or notification pattern found. Status updates must be announced to screen readers.",
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
