import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

/** Check: async-jobs — idempotency keys, retry handling, DLQ patterns */
export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  const IDEMPOTENCY_KEY = /\b(idempoten[ct]|idempotency|once|duplicate)\b/i;
  const RETRY_HANDLER = /\b(retry|backoff|exponential|maxAttempts|maxRetries)\b/i;
  const DLQ = /\b(DLQ|dead[- ]?letter|failed[- ]?queue|retry[- ]?queue)\b/i;
  const FETCH_ORGANIC = /async\s+(function|\*|=>)/;

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;

    if (
      FETCH_ORGANIC.test(content) &&
      !IDEMPOTENCY_KEY.test(content) &&
      !RETRY_HANDLER.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Async function detected but no idempotency or retry pattern found. Add an idempotency key or retry handler.",
        severity: "warning",
      });
    }

    if (/queue|worker|job|consumer|subscriber/.test(content) && !DLQ.test(content)) {
      issues.push({
        file: p.path,
        message: "Queue/worker pattern without a dead-letter queue (DLQ) for poison messages.",
        severity: "warning",
      });
    }

    if (
      RETRY_HANDLER.test(content) &&
      !/jitter|backoff|exponential|linear/.test(content.toLowerCase())
    ) {
      issues.push({
        file: p.path,
        message:
          "Retry logic detected but no backoff strategy (jitter, exponential, linear). Use a backoff formula to avoid thundering herd.",
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
