import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const LATEST_TAG = /^\s*FROM\s+[^\s]+:latest\b/im;
const NO_TAG = /^\s*FROM\s+[^\s:@]+\s*$/im;
const ROOT_USER = /^\s*USER\s+(0|root)\s*$/im;
const ADD_REMOTE = /^\s*ADD\s+https?:\/\//im;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/(^|\/)Dockerfile(\.|$)/.test(p.path)) continue;
    if (LATEST_TAG.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Base image pinned to :latest. Pin a specific version or digest.",
        severity: "warning",
      });
    }
    if (NO_TAG.test(p.content)) {
      issues.push({
        file: p.path,
        message: "FROM without a tag. Pin a specific version.",
        severity: "warning",
      });
    }
    if (ROOT_USER.test(p.content)) {
      issues.push({
        file: p.path,
        message: "Container runs as root. Add a non-root USER.",
        severity: "warning",
      });
    }
    if (!/^\s*USER\s+/im.test(p.content)) {
      issues.push({
        file: p.path,
        message: "No USER directive. Container will run as root by default.",
        severity: "warning",
      });
    }
    if (ADD_REMOTE.test(p.content)) {
      issues.push({
        file: p.path,
        message: "ADD <url> fetches unpinned remote content. Use curl+checksum in a RUN step.",
        severity: "warning",
      });
    }
    if (!/HEALTHCHECK/i.test(p.content)) {
      issues.push({ file: p.path, message: "No HEALTHCHECK defined.", severity: "warning" });
    }
  }
  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
