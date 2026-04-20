# SQL

- Parameterize every query. String concatenation of user input = SQL injection.
- `SELECT` only the columns you need. `SELECT *` breaks when schema changes.
- Every query against a large table has a supporting index. `EXPLAIN` before shipping.
- Wrap multi-statement writes in a transaction. Keep transactions short.
- Use `LIMIT` on any query that could return unbounded rows.
- Name constraints explicitly (`fk_orders_user_id`) — default names are unstable across migrations.
- Timestamps: store UTC, always with timezone (`TIMESTAMPTZ` in Postgres).
