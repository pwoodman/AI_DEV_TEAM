import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const RAW_FETCH = /\b(fetch|axios|request)\s*\(\s*['"`]/;
const NO_TIMEOUT = /\b(fetch|axios|request)\s*\(/;
const TIMEOUT_CONFIG = /timeout|deadline|connectTimeout|readTimeout/;
const NO_RETRY = /\b(fetch|axios|request)\b/;
const RETRY_CONFIG = /retry|backoff|exponential|circuit.?breaker|resilience/;
const SOAP_HAND_CRAFTED = /<soap:Envelope|<soapenv:Envelope|\$\{.*soap|<\?xml.*soap/;
const NO_IDEMPOTENCY_KEY = /POST|PUT|PATCH|DELETE/;
const IDEMPOTENCY_HEADER = /Idempotency-Key|x-request-id|x-idempotency/;
const HARDCODED_AUTH = /(api[_-]?key|token|secret|password)\s*[:=]\s*['"`][^'"`]+['"`]/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    const isApiCode = /\b(fetch|axios|request|http|grpc|graphql|soap|client|api)\b/i.test(content);
    if (!isApiCode) continue;

    if (SOAP_HAND_CRAFTED.test(content)) {
      issues.push({
        file: p.path,
        message: "Hand-crafted SOAP XML detected. Use WSDL-generated stubs or a SOAP client library.",
        severity: "error",
      });
    }

    if (NO_TIMEOUT.test(content) && !TIMEOUT_CONFIG.test(content)) {
      issues.push({
        file: p.path,
        message: "HTTP client call without timeout/deadline configuration. Set explicit connection and read timeouts.",
        severity: "warning",
      });
    }

    if (NO_RETRY.test(content) && !RETRY_CONFIG.test(content) && !/health|probe|ping/i.test(content)) {
      issues.push({
        file: p.path,
        message: "External API call without retry or circuit breaker. Add resilience patterns for production reliability.",
        severity: "warning",
      });
    }

    if (NO_IDEMPOTENCY_KEY.test(content) && !IDEMPOTENCY_HEADER.test(content) && /POST|PUT|PATCH|DELETE/.test(content)) {
      issues.push({
        file: p.path,
        message: "Mutating HTTP method without idempotency key. Add Idempotency-Key header for safe retries.",
        severity: "warning",
      });
    }

    if (HARDCODED_AUTH.test(content) && !/process\.env|env\.|config\.|secret|vault/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Hardcoded API key or token detected. Load credentials from environment or secret manager.",
        severity: "error",
      });
    }

    if (/\.catch\s*\(\s*\)\s*;?\s*$|catch\s*\(\s*\w+\s*\)\s*\{\s*\}/m.test(content)) {
      issues.push({
        file: p.path,
        message: "Empty catch block or swallowed error in API call. Handle or propagate errors with context.",
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
