# Regular Expressions

## Scope

Correct, maintainable, and safe regex patterns for parsing, validation, searching, and replacement across all languages and runtimes.

## Non-negotiables

- Prefer explicit string operations or parser combinators for complex parsing. Regex is appropriate for: email validation, UUID matching, simple tokenization, log line extraction, and path routing. Do not use regex for HTML/XML parsing, JSON parsing, or nested structure extraction.
- Every regex must have a comment explaining intent, especially for non-trivial patterns. Use verbose mode (`/x` in Perl/Python/Ruby, `RegExp` with comments in JS) for multi-line patterns.
- Anchors are explicit: use `^` and `$` for full-string validation. Unanchored regexes in validation contexts leak partial matches (bad: `/[a-z]+/` matches inside `bad123`).
- Character classes are precise: `[a-zA-Z0-9]` not `.` when whitespace/punctuation is invalid. Escape dots and special chars; never rely on loose matching.
- Quantifiers are bounded: `{1,100}` not `*` or `+` for user input. Unbounded quantifiers enable ReDoS (Regular Expression Denial of Service) via catastrophic backtracking.
- ReDoS-safe patterns: avoid nested quantifiers `(a+)+`, alternation with overlapping prefixes `(a|a+)`, and ambiguous branches. Test with 10KB+ malicious input strings.
- Capture groups are named (`(?<name>...)`) where the language supports it; document group order when unnamed. Limit groups to what's needed; each group adds overhead.
- Global replace vs match: `replaceAll` or `replace` with `/g` flag for all occurrences; `match` without `/g` returns groups, `matchAll` with `/g` returns all matches. Never mix semantics.

## Review checks

- Regex is tested with: valid inputs, invalid inputs, edge cases (empty, max length, Unicode), and ReDoS payloads.
- Pattern has a permalink to regex101, regexr, or equivalent with test cases.
- No `.*` in the middle of a pattern without a lazy quantifier or boundary.
- Regex used in hot paths is compiled once and reused, not re-instantiated per call.
- Check omitted: automated ReDoS analysis requires manual fuzz testing and static analysis tools.
