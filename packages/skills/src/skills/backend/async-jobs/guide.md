# Async Jobs

## Scope

Queue and worker design for reliable background processing: idempotency, retries, dead-letter handling, observability, and backpressure.

## Non-negotiables

- Assume at-least-once delivery. Every handler must be idempotent or deduplicated by a stable unique key (job id + entity id). Store processed-key set with TTL matching the retry window.
- Retries use bounded exponential backoff with full jitter: `delay = min(maxDelay, base * 2^attempt + random_jitter)`. Set `maxRetries` (e.g., 5-10) and a total time budget (e.g., 30 minutes). Poison messages go to a DLQ after exhaustion.
- Long tasks are chunked and checkpointed; no unbounded single-run jobs. Report progress to the job store. Support cancellation via a `cancelled` flag or context cancellation.
- External calls always have timeout and cancellation propagation. Use `context.WithTimeout` or equivalent. Never block the worker pool indefinitely.
- Structured logs include: job id, attempt number, handler name, duration, and redacted input context. Include tracing spans that link the enqueue and processing sides.
- Worker concurrency is bounded and configurable. Monitor queue depth, processing lag, and worker utilization. Alert when lag exceeds SLO.
- Job payloads are versioned schemas. Never change the shape of an in-flight job type. Introduce a new job type and migrate consumers gradually.
- Schedule recurring jobs with a distributed lock (e.g., Redis Redlock, Postgres advisory locks) to prevent duplicate execution across instances.

## Review checks

- Reprocessing the same message cannot duplicate side effects (idempotency test exists).
- Retry and DLQ thresholds are explicit and observable in dashboards.
- Worker pool size and queue depth metrics are instrumented and alerted.
- Job handlers have unit tests covering: success, retry, failure, idempotency, and cancellation.
- Dead-letter queue has a documented replay and purge procedure.
