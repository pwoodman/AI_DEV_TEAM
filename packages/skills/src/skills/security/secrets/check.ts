import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const PATTERNS: Array<{ re: RegExp; msg: string }> = [
  { re: /AKIA[0-9A-Z]{16}/, msg: "AWS access key id detected." },
  {
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    msg: "Private key material detected.",
  },
  { re: /ghp_[A-Za-z0-9]{36}/, msg: "GitHub personal access token detected." },
  { re: /sk-[A-Za-z0-9]{20,}/, msg: "API key (sk-...) detected." },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, msg: "Slack token detected." },
  {
    re: /(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    msg: "Hardcoded credential literal.",
  },
];

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (/\.(lock|lockfile|snap)$/.test(p.path)) continue;
    for (const { re, msg } of PATTERNS) {
      if (re.test(p.content)) {
        issues.push({ file: p.path, message: msg, severity: "error" });
      }
    }
  }
  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
