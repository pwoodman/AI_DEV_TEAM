import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const DIRECT_CONSUMER_CALL = /\b(axios|fetch|request)\s*\(\s*['"`]http.*\b(?:event|notify|publish|emit)/i;
const NO_SCHEMA_VERSION = /\b(event|message|payload)\s*[:=]\s*\{/;
const NO_IDEMPOTENCY = /\b(consume|handle|process)\b.*\b(event|message)\b/;
const IDEMPOTENCY_KEY = /\b(idempoten|dedup|processed|handled)\b/i;
const NO_DLQ = /\b(kafka|rabbitmq|nats|sqs|eventbridge|pubsub)\b/i;
const DLQ_PATTERN = /\b(DLQ|dead[-_]?letter|retry[-_]?queue|error[-_]?topic)\b/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    const isEventCode = /\b(event|consumer|producer|handler|subscribe|publish|emit|kafka|rabbitmq|sqs)\b/i.test(content);
    if (!isEventCode) continue;

    if (DIRECT_CONSUMER_CALL.test(content)) {
      issues.push({
        file: p.path,
        message: "Direct HTTP call to consumer from producer. Use a message broker for decoupled event-driven communication.",
        severity: "error",
      });
    }

    if (NO_SCHEMA_VERSION.test(content) && !/schema|version|avro|protobuf/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Event payload without schema versioning. Add version field and validate against schema.",
        severity: "warning",
      });
    }

    if (NO_IDEMPOTENCY.test(content) && !IDEMPOTENCY_KEY.test(content)) {
      issues.push({
        file: p.path,
        message: "Event consumer without idempotency check. Implement deduplication to handle at-least-once delivery.",
        severity: "warning",
      });
    }

    if (NO_DLQ.test(content) && !DLQ_PATTERN.test(content)) {
      issues.push({
        file: p.path,
        message: "Message broker usage without dead-letter queue configuration. Add DLQ for poison message handling.",
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
