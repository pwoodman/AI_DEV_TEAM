# TypeScript

## Scope

Strict, predictable TypeScript for backend and frontend production code with type safety, runtime validation, and maintainability.

## Non-negotiables

- `strict` mode stays enabled; no implicit `any`. Every function parameter, return type, and variable must have an explicit or inferred type. `noUncheckedIndexedAccess` is strongly recommended.
- `@ts-ignore` requires narrow scope, rationale comment, and follow-up issue. Prefer `@ts-expect-error` with an explanation of when it should fail. Review and remove quarterly.
- Untrusted input is runtime-validated (Zod, Valibot, io-ts, runtypes), not type-cast. The validation schema is the single source of truth; TypeScript types are derived from it.
- Discriminated unions use exhaustive switches with `never` guards. The default case must assign to `never` to ensure all variants are handled at compile time.
- Prefer `as const` unions over runtime enums unless there is clear need for reverse mapping or numeric values. Use `const` objects with `typeof` + `keyof` for string unions.
- Type-only exports/imports are explicit (`import type`, `export type`) to avoid runtime pollution and improve tree-shaking.
- Generic constraints are explicit and meaningful. Avoid `any` in generic bounds; use `unknown` with narrowing or explicit constraints.
- Avoid `Function` and `Object` types; use specific signatures and interfaces. `any[]` is only acceptable with immediate narrowing.

## Review checks

- Public API types are intentional and stable. Breaking type changes are versioned and documented.
- Async signatures and error paths match actual behavior (Promise rejections, thrown errors, Result types).
- No type assertions (`as`, `!`) without justification comment. Every assertion is a potential runtime lie.
- Type coverage is measured and maintained above 95% for production modules.
- `strictNullChecks` and `noImplicitReturns` are enabled and enforced in CI.
