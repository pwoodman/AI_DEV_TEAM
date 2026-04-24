# Data Model and Migrations

## Scope

Schema design, migration safety, query performance, and data lifecycle management for production databases.

## Non-negotiables

- Use expand-contract rollout for all breaking changes: (1) add new column/table, (2) dual-write to both old and new, (3) backfill existing data, (4) switch reads to new, (5) remove old paths. Never drop or rename in a single deploy.
- Prefer additive migrations; avoid `DROP COLUMN`, `RENAME`, `TRUNCATE`, or destructive `ALTER` in a single deployment window. If required, stage across multiple releases.
- Every migration has a rollback script or a tested manual recovery procedure. Test rollbacks in a non-production environment before deploy.
- Large-table changes are batched or online (`CONCURRENTLY` for Postgres, `pt-online-schema-change` for MySQL, `ONLINE` for SQL Server) to avoid long locks that block reads/writes.
- Indexes are justified by `EXPLAIN` output on production-like data volumes. Covering indexes are preferred for hot read paths. Remove unused indexes after verification.
- Foreign keys are default unless performance or sharding requires otherwise. Document exemptions. Use `ON DELETE` behavior explicitly (cascade, restrict, set null).
- All columns have explicit `NOT NULL` with `DEFAULT` where applicable, or document why nullable. Timestamps are `TIMESTAMPTZ` (timezone-aware) and UTC-normalized.
- Soft deletes (e.g., `deleted_at` timestamp) are preferred over hard deletes for audit and recovery. Implement hard deletion as a separate async purge job with audit logging.

## Review checks

- Deployment order is backward compatible with old and new app versions running simultaneously.
- `EXPLAIN ANALYZE` exists for new or changed hot queries with estimated vs actual row counts.
- Migration scripts are idempotent (safe to re-run) and wrapped in transactions where possible.
- Data retention and archival policies are documented and enforced.
- Check omitted: automated schema review requires manual DBA review for complex changes.
