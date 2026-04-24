# Accessibility

## Scope

WCAG 2.1 AA compliance, keyboard navigation, screen reader support, focus management, and inclusive design for interactive web UI.

## Non-negotiables

- All interactive controls are keyboard reachable with visible focus state. Tab order follows visual order. No keyboard traps. Provide `tabindex="0"` only when native focusability is unavailable.
- Prefer semantic HTML (`<button>`, `<nav>`, `<main>`, `<article>`); use ARIA roles only when semantics are unavailable. Never use ARIA to fix bad markup.
- Every input has a programmatic label (`<label for="id">`, `aria-labelledby`, or `aria-label`). Placeholders do not replace labels. Error messages are linked via `aria-describedby`.
- Informative images/icons have accessible names (`alt` text, `aria-label`, or visually hidden text). Decorative images use `alt=""` or `role="presentation"`.
- Color is not the sole signal. Contrast meets WCAG AA targets: 4.5:1 for normal text, 3:1 for large text and UI components. Test with automated tools (axe, Lighthouse, Pa11y).
- Async status and errors are announced with `aria-live` regions or toast notifications with `role="status"`/`role="alert"`. Do not rely solely on visual changes.
- Focus management is explicit on route changes, modal open/close, and dynamic content injection. Return focus to the triggering element on modal close.
- Forms validate on submit with clear error messages. Do not disable submit buttons without explanation; instead, show errors on attempt.

## Review checks

- Core journeys are keyboard-only usable (Tab, Enter, Space, Escape, Arrow keys).
- Screen-reader names/roles/states are correct for all controls (test with NVDA, JAWS, VoiceOver, or axe-core).
- Focus outline is visible and meets contrast requirements (never `outline: none` without replacement).
- No `onClick` on non-interactive elements (`<div>`, `<span>`) without `role`, `tabindex`, and keyboard handlers.
- Automated a11y scan passes with zero violations in CI.
