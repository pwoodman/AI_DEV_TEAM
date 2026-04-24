# Input Validation

## Scope

Trust-boundary validation, output encoding, and injection resistance for all external data entry points.

## Non-negotiables

- Validate at every entry point (HTTP, queue, CLI, file, webhook) using explicit schemas (Zod, JSON Schema, Joi, Protobuf). Reject unknown fields by default unless backward compatibility requires otherwise.
- Enforce type, range, format, and size constraints for every external field. String length limits, numeric ranges, regex patterns for emails/UUIDs/slugs, and array bounds are all required.
- Encode/escape per output context: HTML entities for DOM insertion, parameterized queries for SQL, shell escaping for subprocess calls, JSON stringify for JSON output. Never concatenate untrusted input into any execution context.
- Never pass untrusted input to `eval`, `new Function`, `setTimeout` with string, shell execution, or dynamic import paths. These are permanent code execution vectors.
- Resolve and root-check filesystem paths to block directory traversal (`../`, `..\`, null bytes). Use chroot, sandboxed paths, or allowlist-based resolution.
- File uploads: validate MIME type (magic bytes, not extension), size limits, scan for malware, and store outside the web root. Generate random filenames, never use user-provided names.
- SSRF prevention: validate and sanitize URLs before fetching. Use allowlists for protocols (`http`, `https`) and domains. Never fetch user-provided URLs from internal services.
- XML/JSON parsing: disable external entity expansion (XXE), DTD processing, and schema resolution. Use safe parsers with these features explicitly disabled.

## Review checks

- Validation errors are safe, consistent, and non-leaky (no stack traces, no schema internals, no database details).
- Payload size limits exist for body, upload, and collection fields (configured at reverse proxy + application level).
- Fuzz tests exist for critical input paths with malformed, oversized, and edge-case payloads.
- Output encoding is verified for each sink (HTML, SQL, shell, JSON, XML, CSS).
- Check omitted: automated injection testing requires manual security review and SAST/DAST tools.
