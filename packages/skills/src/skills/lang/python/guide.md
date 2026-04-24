# Python

## Scope

Production Python with strong typing discipline, runtime safety, concurrency hygiene, and dependency management.

## Non-negotiables

- Public APIs are type-hinted; static analysis runs in CI (`mypy`/`pyright` with `strict` mode). Type coverage target: 90%+ for production modules.
- Structured data uses `dataclass`, `pydantic`, or `attrs`, not ad-hoc dict contracts. Validate at boundaries and propagate typed objects internally.
- External input is parsed/validated at boundaries, never trusted by shape. Use Pydantic, marshmallow, or Cerberus for request validation.
- No mutable default arguments; use `None` sentinel pattern. Example: `def f(items=None): items = items or []`.
- Use context managers (`with`) for files, locks, network, and database resources. Never leave resources unmanaged.
- Dependencies are isolated per project (virtualenv, poetry, pipenv, uv) and pinned in lockfiles. Audit dependencies monthly (`pip-audit`, `safety`, `snyk`).
- Async code uses `async`/`await` consistently; never mix blocking I/O in async contexts. Use `asyncio.gather` for concurrency, not threads.
- Logging uses the standard `logging` module with structured format (JSON) in production. Never use `print()` for operational logs.

## Review checks

- Type coverage is meaningful for touched modules (no `Any` without justification).
- Exceptions are either handled with context or intentionally propagated. No bare `except:` or `except Exception` without logging.
- No SQL string formatting (f-strings, `%`, `.format()`). Use parameterized queries or ORM.
- GIL-bound CPU work in async code uses `loop.run_in_executor` or ProcessPoolExecutor.
- Test coverage is maintained and CI enforces a floor.
