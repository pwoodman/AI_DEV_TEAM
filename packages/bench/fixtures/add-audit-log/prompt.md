The existing router handles `POST /items` (creates an item, returns 201) and `GET /items` (lists all items). Add two things:

1. **`DELETE /items/:id`** — removes the item from the store; returns 204 on success, 404 if not found.

2. **Audit log** — create `src/audit.ts` that exports:
   - `AuditEntry` type: `{ eventId: string; action: "create" | "delete"; entityId: string; timestamp: number }`
   - `appendAudit(entry: Omit<AuditEntry, "eventId" | "timestamp">): void` — generates a UUID `eventId` via `crypto.randomUUID()` and records `Date.now()` as `timestamp`
   - `queryAudit(filter?: { action?: string; entityId?: string }): AuditEntry[]` — returns matching entries sorted ascending by `timestamp`
   - `clearAudit(): void` — resets the log (for tests)

   Wire into `src/router.ts`:
   - After a successful `POST /items`, call `appendAudit({ action: "create", entityId: item.id })`
   - After a successful `DELETE /items/:id`, call `appendAudit({ action: "delete", entityId: id })`
   - Add `GET /audit` — accepts optional `?action=<string>` and `?entityId=<string>` query params, returns `queryAudit(filter)` with status 200

`GET /items` and `GET /ping` must not produce audit entries. Allowed paths: `src/audit.ts`, `src/router.ts`.
