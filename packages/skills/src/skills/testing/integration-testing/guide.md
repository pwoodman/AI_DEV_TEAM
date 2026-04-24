# Integration Testing

## Scope

End-to-end validation of service boundaries, database interactions, external API calls, and cross-component behavior.

## Non-negotiables

- Integration tests verify real component interactions, not mocked internals. Use testcontainers, ephemeral databases, or dedicated test environments. Mock only external services you do not control.
- Test database transactions are rolled back after each test. Never leave test data in shared databases. Use `SAVEPOINT` or framework-level transaction rollback.
- HTTP integration tests use a real server instance (supertest, httptest, TestClient) with actual middleware, routing, and error handling. Do not bypass the HTTP layer.
- External API calls are stubbed at the network layer (WireMock, Mountebank, nock, responses) or recorded/replayed (VCR, Polly). Never hit production APIs from tests.
- Test data is explicit and minimal. Use factories (factory_boy, faker, chance) with seeded generators for reproducibility. Avoid copying production dumps.
- Tests are idempotent and parallel-safe. Each test creates its own data; no shared fixtures. Use UUIDs or prefixed identifiers to avoid collisions.
- Environment configuration is test-specific. Separate test config from development config. Never use production credentials, URLs, or feature flags in tests.
- Cleanup is guaranteed: `afterEach`, `finally`, or `defer` removes created resources. Tests must pass when run individually and in random order.

## Review checks

- Integration test suite runs in CI and finishes within 10 minutes. Slower suites indicate missing parallelization or excessive scope.
- Test database is isolated; no cross-test data leakage.
- External API stubs match real API contracts (OpenAPI spec or recorded responses).
- Failure messages identify the exact boundary and input that caused the failure.
- Check omitted: automated integration test environment setup requires manual DevOps review.
