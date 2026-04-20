# Input validation

- Validate at the trust boundary: HTTP handlers, queue consumers, CLI args, file readers. Never trust internal callers less.
- Use a schema (Zod/Pydantic/JSON Schema) — not ad-hoc `if` chains. Reject unknown fields by default.
- Enforce types, ranges, lengths, and formats. An email string isn't validated by being a string.
- Escape/encode on output per context: HTML-escape for DOM, parameterize for SQL, shell-escape for subprocess.
- Never interpolate user input into `eval`, `exec`, shell, `new Function`, `require`, dynamic imports.
- Path inputs: resolve + check the resolved path stays within the allowed root (prevent `../` traversal).
- Size limits on every upload, body, and collection field. Unbounded input is a DoS vector.
