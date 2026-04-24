# Observability

## Scope

Production visibility for reliability engineering: structured logging, metrics, distributed tracing, alerting, and incident response.

## Non-negotiables

- Emit structured logs, metrics, and traces before first production release. Use OpenTelemetry, vendor SDKs, or structured loggers (zap, zerolog, slog, winston, structlog).
- Correlation id/trace id propagates across service boundaries and logs. Every incoming request generates or extracts a trace context. All outgoing requests forward it.
- Service metrics cover RED (Rate, Errors, Duration); infrastructure metrics cover USE (Utilization, Saturation, Errors). Business metrics (conversions, active users) are separate but equally important.
- Latency uses histograms/percentiles (p50, p95, p99), not averages alone. Histograms enable SLO calculations and latency budgeting.
- Alerts map to SLO-impacting symptoms, each with linked runbook. Alert on user-impacting symptoms (error rate spike, latency regression), not causes (disk full, unless it causes symptoms).
- Dashboards represent critical user journeys, not only host health. Include: request flow, dependency health, business KPIs, and error budgets.
- Log levels are meaningful: ERROR for actionable issues requiring human response, WARN for degraded but functional, INFO for normal operations, DEBUG for troubleshooting. Never log at ERROR for expected conditions.
- Traces sample intelligently: 100% for errors and slow requests, 1-10% for normal traffic. Head-based sampling at the edge, tail-based for anomaly detection.

## Review checks

- On-call can trace one failed request end-to-end in under 5 minutes.
- Alert thresholds and ownership are documented in the runbook linked from the alert.
- Log volume is budgeted and cost-controlled; no PII in logs.
- Metrics cardinality is bounded (no unbounded labels like user_id, request_id).
- Error budget burn rate alerts exist before SLO violation.
