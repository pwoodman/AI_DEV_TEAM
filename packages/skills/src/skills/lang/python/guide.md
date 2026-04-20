# Python

- Type-hint all public functions. Run `mypy --strict` or `pyright` in CI.
- Use `dataclass` or `pydantic` for structured data, not bare dicts.
- Parse external input with Pydantic; don't `dict.get` your way through it.
- Prefer `pathlib.Path` over `os.path`. Prefer `f"..."` over `%` / `.format`.
- No mutable default args (`def f(x=[])`) — use `None` and assign inside.
- Context managers (`with ...`) for every resource: files, connections, locks.
- Virtualenv / `uv` / `poetry` per project. Pin versions in a lockfile.
