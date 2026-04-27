The file `src/god.ts` mixes five responsibilities that must be separated into focused modules.

Split it into:
1. `src/parser.ts` — exports `parseRequest(raw: string): ParsedRequest`
2. `src/response.ts` — exports `formatOk(data: unknown): string` and `formatError(message: string): string`
3. `src/validator.ts` — exports `validateRequest(req: ParsedRequest): ValidationResult`
4. `src/permissions.ts` — exports `checkPermission(userId: string, action: string): boolean`
5. `src/rate-limiter.ts` — exports `checkRateLimit(userId: string): RateLimitResult`

Then update `src/app.ts` to import from the new modules instead of from `src/god.ts`.

Requirements:
- Each new module must be self-contained with no circular imports between them.
- Keep all existing type signatures exactly as defined in `src/god.ts`.
- The test file imports directly from each new module path (`../src/parser.js`, `../src/response.js`, etc.) — not from `src/god.ts`.
- `src/god.ts` may be left as-is or converted to a re-export barrel, but the tests do not import from it.
- Do NOT change the test file.
