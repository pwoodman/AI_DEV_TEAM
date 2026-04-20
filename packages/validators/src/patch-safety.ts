import { isAbsolute, normalize, relative } from "node:path";
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";

export const patchSafetyValidator: Validator = {
  name: "patch-safety",
  async run(output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const issues: Array<{ message: string; severity: "error" }> = [];

    for (const p of output.patches) {
      if (isAbsolute(p.path)) {
        issues.push({ message: `absolute path not allowed: ${p.path}`, severity: "error" });
        continue;
      }
      const norm = normalize(p.path).replace(/\\/g, "/");
      if (norm.startsWith("../") || norm.includes("/../")) {
        issues.push({ message: `path traversal: ${p.path}`, severity: "error" });
        continue;
      }
      const inside = ctx.allowedPaths.some((allowed) => {
        const rel = relative(allowed, norm).replace(/\\/g, "/");
        return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
      });
      if (!inside) {
        issues.push({
          message: `path outside allowedPaths: ${p.path}`,
          severity: "error",
        });
      }
    }

    return {
      validator: "patch-safety",
      ok: issues.length === 0,
      issues,
      durationMs: Date.now() - start,
    };
  },
};
