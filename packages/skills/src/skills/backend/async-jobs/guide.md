# Async jobs

- Every job must be **idempotent** or keyed by a dedup token. Assume at-least-once delivery.
- Retries: exponential backoff + jitter; cap retry count; send poison messages to a dead-letter queue.
- Keep jobs short. Long-running work → chunked sub-jobs, checkpointed state.
- Log job inputs (redacted), job id, attempt number, and outcome.
- Never block on external calls without a timeout.
