import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const REDOS_RISKY =
  /\([^)]*\+\)\+|\([^)]*\*\)\*|\([^)]*\{\d+,\}\)\+|\(\[.*\]\+\)\+|\((?:a\|a\+)\)|\(\?:\?\:.*\+.*\|.*\+.*\)/;
const UNANCHORED_VALIDATION = /^\s*(const|let|var)\s+\w+\s*=\s*\/[^/^$].*\/[^gmiyusd]*;?\s*$/m;
const UNBOUNDED_QUANTIFIER = /\.\*|\+\)|\{\d*,\}\)/;
const DANGEROUS_DOT = /\.\*|\.\+/;
const NESTED_QUANTIFIERS = /\(\??:?[^)]*[+*]\)[+*]/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    // Detect regex literals and RegExp constructors across languages
    const hasRegex =
      /\/[^/\s][^/]*\/[gmiyusd]*|new\s+RegExp\s*\(|Pattern\.compile\(|re\.(compile|match|search|findall|sub)\s*\(|Regex::new\(/.test(
        content,
      );
    if (!hasRegex) continue;

    if (NESTED_QUANTIFIERS.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Nested quantifiers detected — potential ReDoS risk. Simplify or use possessive quantifiers where supported.",
        severity: "error",
      });
    }

    if (DANGEROUS_DOT.test(content) && !/lazy|\.\*\?|\.\+\?/.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Unbounded greedy dot (.* or .+) detected. Use lazy quantifiers (.*? .+?) or explicit character classes.",
        severity: "warning",
      });
    }

    // Check for regex in validation context without anchors
    const validationRegex = content.match(/\/(?!.*\^)[^/]+\/(?:i?m?g?y?u?s?d?)/g) ?? [];
    for (const regex of validationRegex) {
      if (!/\^/.test(regex) && !/\$/.test(regex)) {
        issues.push({
          file: p.path,
          message: `Unanchored regex '${regex}' used in validation context. Add ^ and $ for full-string matching.`,
          severity: "warning",
        });
      }
    }

    if (/new\s+RegExp\s*\(\s*['"`]/.test(content) && !/escape|sanitize/.test(content)) {
      issues.push({
        file: p.path,
        message:
          "RegExp constructor with string literal. Ensure user input is escaped with RegExp.escape or equivalent before interpolation.",
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
