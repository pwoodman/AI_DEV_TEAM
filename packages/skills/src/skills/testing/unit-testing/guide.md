# Unit Testing

## Scope

Fast, deterministic, and maintainable unit tests for business logic, utilities, and isolated components.

## Non-negotiables

- Tests are deterministic: same input always produces same output. No reliance on time, randomness, or external state without explicit mocking. Use seeded random and frozen clocks.
- One logical assertion per test, or group related assertions under a clear test name. Test names describe behavior, not implementation: `it('rejects expired tokens')` not `it('test auth function')`.
- Test coverage is meaningful: every conditional branch, error path, and boundary case. Aim for >80% branch coverage, not just line coverage.
- Mocks are minimal and explicit. Mock at the boundary (API client, database, file system), not internal implementation details. Prefer fakes over mocks where possible.
- Tests run in isolation; no shared mutable state between tests. Each test sets up its own fixtures and cleans up. Use `beforeEach` for common setup, never `beforeAll` for mutable state.
- Table-driven tests for parameterized scenarios. Cover: happy path, empty input, invalid input, boundary values, error cases, and concurrency where applicable.
- Async tests always await assertions; use framework helpers (Jest `expect().resolves`, Vitest `flushPromises`, Go `t.Parallel()` with care).
- Tests are as fast as possible (<100ms per test). Slow tests indicate missing mocks or integration bleed. Flag tests >500ms for review.

## Review checks

- Tests fail for the right reason; mutation testing confirms meaningful assertions.
- No test interdependence; random order execution passes.
- Mock assertions verify behavior, not just invocation count.
- Error cases are tested with specific error messages/codes, not just `toThrow()`.
- Flaky tests are identified, quarantined, and fixed within 48 hours.
