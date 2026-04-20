import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const MUTABLE_DEFAULT = /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/;
const BARE_EXCEPT = /^\s*except\s*:/m;
const PRINT_DEBUG = /^\s*print\(/m;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.py$/.test(p.path)) continue;
    if (MUTABLE_DEFAULT.test(p.content)) {
      issues.push({ file: p.path, message: "Mutable default argument ([] or {}). Use None and assign inside.", severity: "error" });
    }
    if (BARE_EXCEPT.test(p.content)) {
      issues.push({ file: p.path, message: "Bare 'except:' swallows KeyboardInterrupt/SystemExit. Catch specific exceptions.", severity: "warning" });
    }
    if (PRINT_DEBUG.test(p.content) && !/\btest_|_test\.py$/.test(p.path)) {
      issues.push({ file: p.path, message: "print() in non-test code. Use logging.", severity: "warning" });
    }
  }
  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
