# Observability

- Three pillars: structured logs, metrics, traces. Wire all three before first prod deploy.
- Logs are JSON, one event per line, with: timestamp, level, service, request_id, user_id (if applicable), message.
- Propagate a trace/request id from the edge through every downstream call + log line.
- Metrics: RED for services (Rate, Errors, Duration), USE for resources (Utilization, Saturation, Errors). Histograms, not averages, for latency.
- Alerts tie to SLOs, not raw metrics. Alert on symptoms ("checkout error rate > 1%"), not causes ("CPU high").
- Every alert has a runbook linked from the alert body. No runbook = no alert.
- Dashboards reflect user journeys, not just infrastructure. A green infra dashboard with a broken login flow is a failure.
