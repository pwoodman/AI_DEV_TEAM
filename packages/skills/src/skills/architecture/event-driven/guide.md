# Event-Driven Architecture

## Scope

Design patterns, reliability, and operational concerns for systems built on events, message brokers, and async communication.

## Non-negotiables

- Events are schema-versioned and backward-compatible. Use Avro, Protobuf, or JSON Schema with explicit version fields. Consumers validate events before processing.
- Producers are decoupled from consumers via a message broker (Kafka, RabbitMQ, NATS, SQS, EventBridge). Never direct-call consumer APIs from producers.
- Every event has: unique id, timestamp, source service, correlation id, and schema version. Payload is minimal; include only identifiers, not full entity state.
- Idempotency is guaranteed at the consumer. Processed event ids are deduplicated with TTL matching the broker retention period. Duplicate events are silently acknowledged.
- Ordering is explicit: per-partition ordering for Kafka, FIFO queues for SQS, or explicit sequence numbers. Document ordering guarantees and handling of out-of-order events.
- Dead-letter queues (DLQ) capture poison messages with full context (original event, error, retry count). DLQ messages are alerted and replayable.
- Consumer lag is monitored and alerted. Backpressure mechanisms (pause/resume, rate limiting, shed load) prevent cascading failure.
- Schema evolution uses forward and backward compatibility checks in CI. Breaking schema changes require coordinated producer/consumer deployment.

## Review checks

- Event schemas are documented with examples and compatibility rules.
- Consumer handles all expected event versions without data loss.
- Ordering requirements are documented; out-of-order handling is tested.
- DLQ has documented replay procedure and ownership.
- Check omitted: automated event flow validation requires manual architecture review.
