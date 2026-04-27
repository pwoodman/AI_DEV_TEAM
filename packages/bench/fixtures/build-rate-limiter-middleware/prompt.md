Implement a token-bucket rate limiter middleware with options `{ limit: number; windowMs: number }`. It must allow the first `limit` requests within any rolling `windowMs` window, reject further requests in that window with HTTP 429, and refill as time passes.

Modify `src/middleware.ts` to implement the rate-limiting logic inside `applyMiddleware(router, options)` so that `GET /ping` (and any other route) is rate-limited. Use the exported `now()` function from `src/clock.ts` for time so tests can inject a mock clock. The existing `src/router.ts` exports `createRouter()` and the `Router` type; do not change its public API.

Allowed paths: `src/middleware.ts`, `src/clock.ts`, `src/router.ts`.
