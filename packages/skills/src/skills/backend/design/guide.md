# Backend Design

## Scope

Architecture framing for distributed services: domain modeling, data boundaries, consistency tradeoffs, reliability, security, and operational readiness.

## Non-negotiables

- Define domain entities, invariants, and ownership boundaries before any technology choice. Draw a bounded-context map. Each service owns its data; shared databases are an anti-pattern.
- For each cross-service write, choose and document the consistency model: distributed transaction (Saga), outbox pattern, or eventual consistency with compensation. Never leave it implicit.
- Set latency/error SLOs for critical flows (e.g., p99 < 200ms, error rate < 0.1%). Define degradation behavior: circuit breakers, fallbacks, graceful degradation. Document kill switches for feature flags.
- Define authz boundaries, audit events, and data retention/deletion rules at design time. GDPR/CCPA deletion must be technically feasible, not an afterthought.
- Ship with a rollout and rollback strategy. Blue/green, canary, or feature flags are required for stateful changes. Database migrations must be backward-compatible (expand-contract).
- Every external dependency must have a timeout, retry budget, and circuit breaker. Document the blast radius if the dependency fails.
- API contracts are defined in OpenAPI/Protobuf/GraphQL schema first. Code is generated from schema, not the reverse.
- Secrets, configs, and environment-specific values are injected at runtime, never baked into images or committed.

## Review checks

- Design document includes: topology diagram, data flow, contract definitions, failure modes, scaling triggers, and security boundaries.
- Risks and unresolved assumptions are explicit with owners and mitigation dates.
- Capacity planning estimates QPS, data growth, and storage needs for 12 months.
- On-call runbooks exist for every critical alert and incident type.
- Check omitted: automated static analysis for architecture decisions is manual review only.
