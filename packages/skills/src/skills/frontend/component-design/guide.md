# Component design

- One component = one responsibility. If the name needs "And" or exceeds ~150 lines, split it.
- Props: explicit, typed, minimal. Prefer many small components over one with many flags.
- No fetching or global state in presentational components. Container/hook layer owns side effects.
- Stable, testable DOM: put `data-testid` on every interactive or assertable element.
- Accessible by default: labels for inputs, alt text for images, semantic tags over `<div role>`.
