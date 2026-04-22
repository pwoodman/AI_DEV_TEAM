import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const IGNORED_ERR = /,\s*_\s*:?=\s*[a-zA-Z_][\w.]*\(/;
const PANIC_IN_LIB = /^\s*panic\(/m;
const FMT_PRINTLN = /\bfmt\.Println\(/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.go$/.test(p.path)) continue;
    if (IGNORED_ERR.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Ignoring error with '_'. Handle or wrap it with fmt.Errorf.",
        severity: "warning",
      });
    }
    if (PANIC_IN_LIB.test(p.content) && !/_test\.go$|main\.go$/.test(p.path)) {
      issues.push({
        file: p.path,
        message: "panic() in library code. Return an error instead.",
        severity: "warning",
      });
    }
    if (FMT_PRINTLN.test(p.content) && !/_test\.go$|main\.go$|cmd\//.test(p.path)) {
      issues.push({
        file: p.path,
        message: "fmt.Println in library code. Use a logger.",
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
