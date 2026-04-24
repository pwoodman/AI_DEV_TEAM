# REST API Design

## Scope

HTTP API contract quality: resource modeling, request/response semantics, error handling, versioning, and security boundaries.

## Non-negotiables

- Resource-oriented paths (`/users/:id`, `/orders/:id/items`), with behavior expressed through HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Never embed verbs in paths (bad: `/getUser`, `/createOrder`).
- Route-boundary schema validation rejects unknown/invalid fields. Use Zod, JSON Schema, OpenAPI, or equivalent. Return `400 Bad Request` with a structured error detailing which fields failed.
- Consistent status mapping and error envelope: `{ "error": { "code": "INVALID_FIELD", "message": "...", "details": [...] } }`. Never expose stack traces, SQL fragments, internal identifiers, or file paths.
- List endpoints are bounded and cursor-paginated for large collections. Use `limit`/`cursor` or `page[after]`, never unbounded arrays. Include `total_count` or `has_more` in meta.
- Retriable create/mutation endpoints support idempotency keys via `Idempotency-Key` header. Store keys with their response for at least 24 hours. Return `409 Conflict` on duplicate key mismatch.
- `PATCH` is partial update only. `PUT` is full replacement (idempotent). Document which fields are optional on update. Never silently ignore unknown fields.
- Versioning strategy is explicit: URL path (`/v1/...`), `Accept` header (`application/vnd.api+json;version=2`), or `Api-Version` header. Document deprecation timeline and sunset headers.
- All endpoints enforce rate limiting with `429 Too Many Requests` and `Retry-After` header. Log blocked requests for security review.
- Authentication is stateless (JWT, API key, or OAuth2). Validate tokens at the edge, propagate claims in a trusted context object.
- CORS, CSP, and security headers (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`) are configured explicitly, never left to defaults.

## Review checks

- Breaking changes have a compatibility plan: old version supported for N days, migration guide published, clients notified.
- Error examples are documented for primary failure modes (400, 401, 403, 404, 409, 422, 429, 500).
- Response schemas are type-safe and match the actual implementation (not hand-maintained drift).
- Sensitive endpoints (auth, password reset, payment) have stricter rate limits and audit logging.
- Load tests validate latency p99 under expected concurrent load.
