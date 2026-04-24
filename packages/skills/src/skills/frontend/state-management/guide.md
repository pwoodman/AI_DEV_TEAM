# State Management

## Scope

Correct placement and lifecycle of UI state, server state, form state, URL state, and persisted state in frontend applications.

## Non-negotiables

- Co-locate state with ownership; lift only when sharing is required. Local form state stays in the form component. Shared state lives in a store or context near its consumers.
- Keep server state in query/cache libraries (TanStack Query, SWR, RTK Query, Apollo), not generic global stores. Cache policies, stale-while-revalidate, and background refetch are configured explicitly.
- Derive computed values; avoid storing duplicated data. Use `useMemo`, selectors, or derived stores. Never store both `items` and `itemCount`; compute the count.
- Global stores remain small, domain-sliced, and immutable by convention. Use Redux Toolkit, Zustand, Pinia, or similar with explicit action definitions. Never mutate state directly.
- Form state is managed by form libraries (React Hook Form, Formik, VeeValidate, Felte) for validation, dirty tracking, and submission handling. Avoid hand-rolling complex form state.
- URL state is the source of truth for shareable/filterable views. Sync query params bidirectionally. Never store filter/sort state only in memory.
- Persisted state includes schema versioning and migration behavior. Store a `version` field and run migrations on hydration. Never blindly hydrate old state into a new schema.
- Optimistic updates are rolled back on error. Show pending state (spinners, disabled buttons) and handle race conditions with request deduplication.

## Review checks

- Each state field has clear owner, source of truth, and invalidation path.
- Cache policy and refetch triggers are explicit for server data (staleTime, cacheTime, refetchOnWindowFocus).
- No prop drilling beyond 2 levels for shared state.
- Form validation errors are accessible and map 1:1 to input fields.
- Optimistic update has a corresponding error rollback and user-facing error message.
