# SQL

## Scope

Safe, performant SQL for application queries, schema evolution, and data manipulation across PostgreSQL, MySQL, SQLite, and similar relational databases.

## Non-negotiables

- All user-controlled values are parameterized; no string interpolation, concatenation, or template literals in SQL. Use prepared statements, ORM parameterization, or query builders.
- Query only required columns; avoid `SELECT *` in application paths. Explicit column lists prevent breaking when schema changes and reduce network overhead.
- Hot queries are validated with `EXPLAIN` (or `EXPLAIN ANALYZE`) and supported by indexes. Document query plans for new critical queries.
- Multi-step writes run in short, explicit transactions. Keep transactions brief; avoid user input or external calls inside a transaction. Use appropriate isolation levels.
- Potentially large reads are bounded with `LIMIT`/`OFFSET` or cursor-based pagination. Streaming results for exports/batch jobs with fetch size configuration.
- Constraints are explicitly named (`CONSTRAINT fk_orders_user FOREIGN KEY ...`). Timestamps are timezone-aware (`TIMESTAMPTZ`) and UTC-normalized at the application layer.
- Use `UPSERT` (`INSERT ... ON CONFLICT`) or explicit merge logic; never read-then-write for idempotency. Handle conflicts at the database level where possible.
- Batch operations use bulk inserts (`INSERT INTO ... VALUES (...), (...), (...)`) or copy protocols. Avoid N+1 inserts and row-by-row processing.

## Review checks

- Query plans are captured for new/changed critical queries with estimated vs actual row counts.
- Transaction boundaries and lock impact are intentional (no long-held locks, no user input inside transactions).
- No `SELECT *` in application code; all columns are explicitly listed.
- Index usage is verified; missing index scans on large tables are flagged.
- Check omitted: automated query plan analysis requires manual DBA review.
