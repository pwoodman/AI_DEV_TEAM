# Accessibility

- Every interactive element is reachable by keyboard and has a visible focus ring.
- Use semantic HTML first (`<button>`, `<a>`, `<label>`, `<nav>`). Only reach for `role=` when no semantic tag fits.
- Images have `alt`; decorative images use `alt=""`. Icons that convey meaning need an accessible name.
- Form inputs are associated with a `<label>` (via `htmlFor`/`id` or wrapping). Never rely on placeholder as label.
- Color is never the only signal — pair with text or icon. Target WCAG AA contrast (4.5:1 body, 3:1 large).
- Announce async state changes (loading, errors) via `aria-live` regions or toast with `role="status"`.
