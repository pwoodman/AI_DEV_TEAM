import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const IGNORED_ERR = /,\s*_\s*:?=?\s*[a-zA-Z_][\w.]*\(/;
const PANIC_IN_LIB = /^\s*panic\(/m;
const FMT_PRINTLN = /\bfmt\.(Println|Printf|Print)\(/;
const NO_TIMEOUT = /http\.ListenAndServe\(/;
const BACKGROUND_CONTEXT = /context\.Background\(\)/;
const GLOBAL_VAR_MUTABLE = /^\s*var\s+\w+\s*=\s*/m;
const DEFER_CLOSE = /defer\s+\w+\.Close\(\)/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.go$/.test(p.path)) continue;
    const content = p.content;
    const isLib = !/_test\.go$|main\.go$|cmd\//.test(p.path);

    if (IGNORED_ERR.test(content)) {
      issues.push({
        file: p.path,
        message: "Ignoring error with '_'. Handle or wrap it with fmt.Errorf.",
        severity: "warning",
      });
    }

    if (PANIC_IN_LIB.test(content) && isLib) {
      issues.push({
        file: p.path,
        message: "panic() in library code. Return an error instead.",
        severity: "warning",
      });
    }

    if (FMT_PRINTLN.test(content) && isLib) {
      issues.push({
        file: p.path,
        message: "fmt.Println/Printf in library code. Use a structured logger.",
        severity: "warning",
      });
    }

    if (NO_TIMEOUT.test(content) && !/ReadTimeout|WriteTimeout/.test(content)) {
      issues.push({
        file: p.path,
        message:
          "http.ListenAndServe without timeout configuration. Set ReadTimeout, WriteTimeout, IdleTimeout, and MaxHeaderBytes.",
        severity: "warning",
      });
    }

    if (BACKGROUND_CONTEXT.test(content) && /handler|controller|service|worker/.test(content)) {
      issues.push({
        file: p.path,
        message:
          "context.Background() in request handler or service. Accept context.Context as first parameter and propagate it.",
        severity: "warning",
      });
    }

    if (
      /\b(os\.Open|sql\.Open|net\.Dial|http\.Get)\b/.test(content) &&
      !DEFER_CLOSE.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Resource opened without defer Close(). Ensure cleanup with defer or explicit Close in all paths.",
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
