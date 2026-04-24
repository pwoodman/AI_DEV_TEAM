# Database Flavors

## Scope

SQL authoring, optimization, and migration practices across PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, Snowflake, and Oracle.

## Non-negotiables

- Write ANSI-standard SQL where possible; use dialect-specific features only when they provide clear value and are isolated in adapter layers. Document all dialect-specific code with the target database name.
- PostgreSQL: use `RETURNING` for inserts/updates, `JSONB` for structured data, `CTE` (WITH) for readability, `UNNEST` for bulk operations, and `pg_trgm`/`GIN` for text search. Prefer `SERIAL`/`GENERATED ALWAYS` over manual sequence management.
- MySQL/MariaDB: use `InnoDB` exclusively (no MyISAM). Set `sql_mode` to `STRICT_TRANS_TABLES`. Use `INSERT ... ON DUPLICATE KEY UPDATE` for upserts. Be aware of case-insensitive default collation; enforce case sensitivity explicitly where needed.
- SQL Server: use `OUTPUT` clause for returning modified rows, `MERGE` with caution (known race conditions), `SNAPSHOT` isolation for read-heavy workloads, and `TRY/CATCH` for transaction safety. Avoid `SELECT INTO` in production; it locks schema.
- SQLite: use `WAL` mode for concurrency, `FOREIGN KEYS` explicitly enabled (`PRAGMA foreign_keys = ON`), and `UPSERT` (`ON CONFLICT`) for idempotency. Never use SQLite for high-concurrency write workloads or across network shares.
- Snowflake: use `CLUSTER BY` for large tables, `TIME TRAVEL` and `ZERO COPY CLONE` for dev/test data, `VARIANT` for semi-structured data, and `WAREHOUSE` sizing appropriate to query cost. Avoid `SELECT *` on wide tables due to micro-partition pruning.
- Oracle: use `RETURNING INTO` for DML, `CONNECT BY` for hierarchies (or recursive CTEs in 11gR2+), `DECODE`/`CASE` for conditional logic, and bind variables to avoid hard parses. Be aware of `NULL` handling (`'' IS NULL`).
- All dialects: parameterize every user-controlled value. Use the dialect's placeholder syntax (`$1` Postgres, `?` MySQL/SQLite, `@name` SQL Server, `:name` Oracle). Never concatenate strings into SQL.
- Cross-database migrations use a schema diff tool (Flyway, Liquibase, Alembic, Atlas) with dialect-specific scripts in versioned folders. Test migrations against the target version and edition (e.g., SQL Server Express vs Enterprise).

## Review checks

- Query is tested against the target database version and edition in CI.
- Explain plan is captured for new/changed queries; full table scans on large tables are justified.
- Dialect-specific features have fallback documentation for portability.
- Bulk operations use the database's native batch protocol, not row-by-row.
- Check omitted: automated cross-database compatibility testing requires manual DBA review.
