# API Integration

## Scope

Client-side integration patterns for REST, SOAP, GraphQL, and gRPC APIs: connection management, resilience, authentication, and error handling.

## Non-negotiables

- Use a typed HTTP client (OpenAPI-generated, tRPC, gRPC stubs, or strongly-typed SDKs). Never use raw `fetch`/`axios` without request/response types. Validate responses at runtime with Zod, JSON Schema, or protobuf.
- Every external call has a timeout (connection + read), retry budget, and circuit breaker. Default: 5s connect, 30s read, 3 retries with exponential backoff, circuit breaker at 50% error rate.
- Authentication is explicit and secure: OAuth2 with refresh token rotation, mTLS for service-to-service, API keys in headers (never query params), and HMAC signatures where required. Never hardcode credentials.
- Idempotency keys for mutating operations (`Idempotency-Key` header or `x-request-id`). Store and replay responses for duplicate keys within a retention window (e.g., 24 hours).
- Error handling is exhaustive: map HTTP status codes to domain errors, retry only idempotent operations on 5xx/429, surface 4xx as client validation errors, and fail fast on auth errors (401/403).
- SOAP/XML: use WSDL-generated stubs, validate against XSD, escape XML entities in payloads, and set SOAPAction header explicitly. Never hand-craft XML strings.
- GraphQL: use persisted queries or query whitelisting in production to prevent query complexity attacks. Batch operations with DataLoader, and handle partial errors in the `errors` array.
- gRPC: use deadlines (not timeouts), handle `DEADLINE_EXCEEDED` with retry logic, and implement health checks via gRPC health protocol. Use interceptors for auth, logging, and retry.
- Webhooks: verify signatures (HMAC-SHA256), reject replayed events by checking timestamp + idempotency, and respond with 200 OK before processing to prevent redelivery loops.

## Review checks

- All external API calls are mocked in tests; integration tests use recorded/replayed responses (VCR, Polly, WireMock).
- Request/response schemas match the actual API documentation (OpenAPI, WSDL, GraphQL schema, protobuf).
- Retry and circuit breaker configuration is documented and tested with chaos engineering (failure injection).
- No PII or secrets logged in request/response bodies.
- Check omitted: automated API contract drift detection requires manual schema comparison.
