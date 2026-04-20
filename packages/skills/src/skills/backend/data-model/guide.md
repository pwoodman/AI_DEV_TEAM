# Data model + migrations

- Prefer additive migrations (new nullable columns, new tables). Avoid renames/drops in a single step.
- Ship migration + code in a backward-compatible sequence: add → dual-write → backfill → switch reads → drop.
- Every migration has a rollback — either a reverse migration or a documented manual procedure.
- Never run long-locking migrations on large tables without `CONCURRENTLY`/batching.
- Index columns used in `WHERE`, `JOIN`, `ORDER BY`. Drop unused indexes.
- Enforce foreign keys unless you have a specific performance exemption documented.
