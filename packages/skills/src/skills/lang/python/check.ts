import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const MUTABLE_DEFAULT = /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/;
const BARE_EXCEPT = /^\s*except\s*:/m;
const PRINT_DEBUG = /^\s*print\(/m;
const SQL_FORMATTING = /f['"].*(?:SELECT|INSERT|UPDATE|DELETE)\b.*\{|%.*(?:SELECT|INSERT|UPDATE|DELETE)|\.format\(.*(?:SELECT|INSERT|UPDATE|DELETE)/;
const BLOCKING_IN_ASYNC = /async\s+def.*\n.*\b(open|requests\.|urllib|time\.sleep|subprocess)\b/m;
const NO_TYPE_HINTS = /^\s*def\s+\w+\s*\([^)]*\)\s*(?:->\s*\w+)?\s*:/m;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.py$/.test(p.path)) continue;
    const content = p.content;

    if (MUTABLE_DEFAULT.test(content)) {
      issues.push({
        file: p.path,
        message: "Mutable default argument ([] or {}). Use None and assign inside.",
        severity: "error",
      });
    }

    if (BARE_EXCEPT.test(content)) {
      issues.push({
        file: p.path,
        message: "Bare 'except:' swallows KeyboardInterrupt/SystemExit. Catch specific exceptions.",
        severity: "warning",
      });
    }

    if (PRINT_DEBUG.test(content) && !/\btest_|_test\.py$/.test(p.path)) {
      issues.push({
        file: p.path,
        message: "print() in non-test code. Use logging module.",
        severity: "warning",
      });
    }

    if (SQL_FORMATTING.test(content)) {
      issues.push({
        file: p.path,
        message: "SQL query constructed with string formatting (f-string, %, .format()). Use parameterized queries.",
        severity: "error",
      });
    }

    if (BLOCKING_IN_ASYNC.test(content)) {
      issues.push({
        file: p.path,
        message: "Blocking I/O (open, requests, time.sleep, subprocess) inside async function. Use aiohttp, aiofiles, or run_in_executor.",
        severity: "warning",
      });
    }

    // Check if public functions lack return type hints
    const publicFuncs = content.match(/^\s*def\s+\w+\s*\([^)]*\)\s*:/gm) ?? [];
    if (publicFuncs.length > 0) {
      issues.push({
        file: p.path,
        message: `Public function(s) without return type hints. Add -> type annotations for mypy/pyright compliance.`,
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
