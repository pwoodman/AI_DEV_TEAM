import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const PATTERNS: Array<{ re: RegExp; msg: string; severity?: "warning" | "error" }> = [
  { re: /AKIA[0-9A-Z]{16}/, msg: "AWS access key id detected." },
  {
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    msg: "Private key material detected.",
  },
  { re: /ghp_[A-Za-z0-9]{36}/, msg: "GitHub personal access token detected." },
  { re: /gho_[A-Za-z0-9]{36}/, msg: "GitHub OAuth token detected." },
  { re: /ghs_[A-Za-z0-9]{36}/, msg: "GitHub App installation token detected." },
  { re: /sk-[A-Za-z0-9]{20,}/, msg: "API key (sk-...) detected." },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, msg: "Slack token detected." },
  { re: /[A-Za-z0-9_-]{24}--[A-Za-z0-9_-]{6}/, msg: "Stripe API key pattern detected." },
  { re: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/, msg: "JWT token pattern detected. Verify it is not a hardcoded secret." },
  {
    re: /(?:password|passwd|pwd|secret|api[_-]?key|token|auth)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    msg: "Hardcoded credential literal.",
  },
  {
    re: /process\.env\.(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SECRET_KEY|PRIVATE_KEY)/i,
    msg: "Environment variable access is fine, but ensure the value is not logged or exposed in errors.",
    severity: "warning",
  },
  {
    re: /console\.(log|debug|info)\s*\(\s*(?:.*password|.*secret|.*token|.*key)/i,
    msg: "Potential secret logging in console statement.",
    severity: "warning",
  },
];

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (/\.(lock|lockfile|snap|env\.example|env\.sample)$/.test(p.path)) continue;

    for (const { re, msg, severity = "error" } of PATTERNS) {
      if (re.test(p.content)) {
        issues.push({ file: p.path, message: msg, severity });
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
