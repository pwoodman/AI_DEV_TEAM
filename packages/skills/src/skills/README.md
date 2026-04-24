# Runtime Skills

This package uses a single canonical skill format:

- Skill id is folder-based (example: `backend/rest-api`).
- Runtime guide is `guide.md`.
- Optional validation logic is `check.ts`.

`SKILL.md`-style legacy content is intentionally excluded to prevent duplicated guidance and token bloat.

## Active skill groups

```
skills/
├── backend/
├── deployment/
├── frontend/
├── lang/
└── security/
```

## Design principles

- One concern per skill. No overlap-heavy "mega guides."
- Keep guides concise and operational (default target: under 150 words).
- Put shared architecture framing in `backend/design`; put implementation detail in domain-specific guides.
- Keep language skills practical and enforceable in code review.

## Authoring rules

- Add a new skill only when guidance cannot live cleanly in an existing guide.
- If two guides repeat the same rule, keep it in the most specific guide and remove duplicates.
- Prefer checkable rules ("must have X") over vague style advice.
- Every `guide.md` must use this structure: `# Title`, `## Scope`, `## Non-negotiables`, `## Review checks`.
- Keep each guide tight (target: 80-140 words) and link to sibling skills instead of repeating their detail.
