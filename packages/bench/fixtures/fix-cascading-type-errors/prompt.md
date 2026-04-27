The `UserId` type in `src/types.ts` was recently changed from `number` to `string` (to support UUID-style IDs), but the change was not propagated. Four other files still treat `UserId` as a number, causing TypeScript errors and a hidden runtime bug.

Fix all type errors so the codebase compiles cleanly, and fix the runtime bug so all tests pass:

1. `src/user-store.ts` — calls `parseInt(id)` when looking up users and uses `> 0` guard; update to treat `UserId` as a plain string (no parseInt, no numeric comparison).
2. `src/session.ts` — creates sessions with `userId: 1` hardcoded as a number; pass the actual `userId` argument.
3. `src/auth.ts` — validates with `userId > 0` (number comparison); switch to a non-empty string check.
4. `src/api.ts` — wraps `req.userId` in `Number()` before calling the store; pass the string directly.

Do NOT change the `UserId` type in `src/types.ts` — it is already correct as `string`.
Do NOT change the test file.
