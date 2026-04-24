# Go

## Scope

Idiomatic, maintainable Go for production services: error handling, concurrency, resource management, and testing.

## Non-negotiables

- Handle and wrap errors with context using `fmt.Errorf("...: %w", err)`. No silent discard (`_, _ = fn()`). Log or return every error with meaningful context.
- `context.Context` is the first parameter for I/O and request-scoped operations. Pass it through the call chain; never use `context.Background()` inside request handlers.
- Define small interfaces at consumption points (accept interfaces, return structs). Avoid interface pollution; interfaces with >5 methods are suspect.
- Avoid global mutable state; inject dependencies explicitly. No package-level `var` for configuration or connections unless immutable and initialized at startup.
- Use `errors.Is`/`errors.As` for matching and classification. Custom errors implement the `error` interface with `Unwrap()` where appropriate.
- CI runs `go vet`, `staticcheck`, `gofmt`, and race-enabled tests (`-race`). Fail build on any finding.
- HTTP servers set `ReadTimeout`, `WriteTimeout`, `IdleTimeout`, and `MaxHeaderBytes`. Never use `http.ListenAndServe` without timeouts.
- Database connections use connection pooling with configured `MaxOpenConns`, `MaxIdleConns`, and `ConnMaxLifetime`. Close rows and statements promptly.

## Review checks

- Resource acquisition is paired with immediate cleanup (`defer`) where appropriate. Check for leaked goroutines, files, and connections.
- Goroutine lifecycles, cancellation, and backpressure are explicit. Every goroutine has a termination condition and responds to context cancellation.
- No `panic` in library code; only in `main` or `init` for fatal startup errors. Recovery is explicit with `recover()` in middleware/workers.
- Benchmarks exist for hot paths and allocation-sensitive code.
- Check omitted: automated race condition detection requires `go test -race` in CI.
