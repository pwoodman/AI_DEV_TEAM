# Go

- Handle every error. `_ = err` is a bug. Wrap with `fmt.Errorf("context: %w", err)`.
- Accept interfaces, return structs. Keep interfaces small and defined at the consumer.
- Context propagates: every IO-bound function takes `ctx context.Context` as its first arg.
- No global state. Pass dependencies via struct fields or function args.
- `defer` for cleanup on the line after acquisition. Beware deferred calls in loops.
- Use `errors.Is` / `errors.As` for error comparison, not `==` or string match.
- `go vet`, `staticcheck`, and `-race` tests run in CI.
