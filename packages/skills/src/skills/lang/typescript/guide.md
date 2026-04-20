# TypeScript

- `strict: true`. No implicit `any`. No `@ts-ignore` without a comment explaining why + ticket.
- Prefer `type` for unions/utility composition, `interface` for extensible object shapes. Be consistent within a file.
- Parse untrusted input (HTTP bodies, env, file contents) with Zod/Valibot. Don't cast.
- Exhaustive switches: use a `never` guard in the default branch.
- No `enum` — prefer `as const` object + union type. Enums have runtime + type quirks.
- Async functions return `Promise<T>`; never `async` a function that never awaits.
- Export types with `export type` to keep them out of the emitted JS.
