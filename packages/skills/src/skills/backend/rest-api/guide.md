# REST API design

- Use nouns for resources, verbs via HTTP method. Avoid `/getUser`; use `GET /users/:id`.
- Status codes: 200/201/204 success; 400 validation; 401 unauthenticated; 403 unauthorized; 404 missing; 409 conflict; 422 semantic; 429 rate limit; 5xx server.
- Validate request bodies with a schema at the route boundary. Reject unknown fields explicitly.
- Pagination via `?limit` + cursor (`?after`). Avoid offset for large collections.
- Return a consistent error envelope: `{ error: { code, message, details? } }`.
- Idempotent methods (`GET`, `PUT`, `DELETE`) must be safely retryable. `POST` that creates resources should accept `Idempotency-Key`.
- Never leak internal errors, stack traces, or SQL fragments in responses.
