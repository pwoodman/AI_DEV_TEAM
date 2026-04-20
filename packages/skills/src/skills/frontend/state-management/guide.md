# State management

- Co-locate state with the component that owns it. Lift only when two+ siblings need it.
- Server state (fetched) ≠ client state (UI). Use a data library (React Query/SWR) for server state; don't stuff it into Redux/Zustand.
- Derive, don't duplicate. Computed values belong in selectors/memos, not stored fields.
- Keep global stores small and flat. Slice by domain, not by screen.
- Never mutate state directly. Treat all state as immutable.
- Persisted state (localStorage, URL) needs a version + migration path.
