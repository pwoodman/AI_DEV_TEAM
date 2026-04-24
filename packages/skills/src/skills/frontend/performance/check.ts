import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const UNOPTIMIZED_IMAGE = /<img\b[^>]*\bsrc\s*=\s*["'][^"']+\.(png|jpg|jpeg)["'][^>]*>/i;
const NO_LAZY_LOAD = /<img\b(?!.*\bloading\s*=\s*["']lazy["'])[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/i;
const SYNC_SCRIPT = /<script\b(?!.*\b(?:async|defer|type\s*=\s*["']module["']))[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/i;
const INLINE_LARGE_STYLE = /<style\b[^>]*>[\s\S]{5000,}<\/style>/i;
const DYNAMIC_IMPORT_MISSING = /import\s*\(\s*['"`][^'"`]+['"`]\s*\)/;
const MEMORY_LEAK_RISK = /addEventListener\s*\(|setInterval\s*\(|setTimeout\s*\(/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(tsx|jsx|html|vue|svelte|css|scss)$/.test(p.path)) continue;
    const content = p.content;

    if (UNOPTIMIZED_IMAGE.test(content) && !/\.webp|\.avif|next\/image|Image\b/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Unoptimized image format (png/jpg). Use WebP/AVIF with next/image or equivalent.",
        severity: "warning",
      });
    }

    if (SYNC_SCRIPT.test(content) && !/data-|type\s*=\s*["']application\/json["']/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Synchronous script tag without async/defer. Use async/defer or module type to avoid render blocking.",
        severity: "warning",
      });
    }

    if (INLINE_LARGE_STYLE.test(content)) {
      issues.push({
        file: p.path,
        message: "Large inline stylesheet detected (>5KB). Extract to external file or use critical CSS inlining only.",
        severity: "warning",
      });
    }

    if (MEMORY_LEAK_RISK.test(content) && !/removeEventListener|clearInterval|clearTimeout|useEffect.*return/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Event listener or timer added without cleanup. Ensure removal on unmount to prevent memory leaks.",
        severity: "warning",
      });
    }

    if (/\b(lodash|moment|jquery|underscore)\b/.test(content)) {
      issues.push({
        file: p.path,
        message: "Large legacy library imported. Use modern alternatives (date-fns, dayjs, native methods) for tree-shaking.",
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
