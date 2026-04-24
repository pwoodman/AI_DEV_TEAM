import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const RAW_LOG =
  /\b(console\.(log|debug|info|warn|error)|printStackTrace|printf|fmt\.Print|fmt\.Println|System\.out\.print)\b/;
const STRUCTURED_LOG = /\b(json|zerolog|logrus|zap|slog|winston|structlog|pino|bunyan)\b/i;
const METRIC_BACKEND = /\b(prometheus|statsd|datadog|cloudwatch|grafana|newrelic|dynatrace)\b/i;
const TRACE_BACKEND = /\b(opentelemetry|otlp|jaeger|zipkin|tempo|xray)\b/i;
const CORRELATION_ID = /\b(correlation[-_]?id|trace[-_]?id|request[-_]?id|x-request-id)\b/i;
const LOG_LEVEL_CHECK = /\b(ERROR|WARN|INFO|DEBUG|TRACE)\b/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;

    // Check service/handler/controller files for observability
    const isService =
      /\b(func|handler|service|worker|router|controller|class|def)\b/.test(content) ||
      /\b(server|app|api|service)\b/i.test(p.path);
    if (!isService) continue;

    if (RAW_LOG.test(content) && !STRUCTURED_LOG.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Raw console.log/fmt.Print detected in service code. Use structured logging (zerolog, zap, slog, winston, pino).",
        severity: "warning",
      });
    }

    if (
      METRIC_BACKEND.test(content) &&
      !/\b(counter|gauge|histogram|summary|timer)\b/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Metrics backend imported but no metric types (counter, gauge, histogram) defined. Instrument critical paths.",
        severity: "warning",
      });
    }

    if (
      TRACE_BACKEND.test(content) &&
      !/\b(propagat|context\.withTrace|withSpan|startSpan|sampling)\b/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Tracing library imported but no span creation or context propagation found. Trace critical request paths.",
        severity: "warning",
      });
    }

    if (
      isService &&
      !CORRELATION_ID.test(content) &&
      !/(middleware|interceptor|hook)/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Service handler without correlation/trace ID extraction or propagation. Add request context middleware.",
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
