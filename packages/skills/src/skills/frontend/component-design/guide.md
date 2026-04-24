# Component Design

## Scope

Frontend component boundaries, contracts, reusability, testability, and maintainability rules for React, Vue, Svelte, and similar frameworks.

## Non-negotiables

- Components have single responsibility. Split when behavior or file size grows beyond clarity (rule of thumb: >150 lines or >5 hooks signals extraction).
- Props are explicit, typed, and minimal. Avoid flag-driven mega-components (bad: `<Button isPrimary isGhost isLoading disabled size="lg" ...>`). Prefer composition: `<Button variant="primary" size="lg" disabled><Spinner /></Button>`.
- Presentational components stay side-effect free; data fetching/state orchestration lives in hooks, containers, or route loaders. Never call `fetch` directly in a presentational component.
- Interactive DOM is stable and testable with intentional selectors (`data-testid` or semantic roles). Avoid selecting by CSS classes or text content in tests.
- Accessibility defaults apply to every component contract: keyboard navigation, focus management, ARIA roles, and screen reader labels are non-optional.
- Component APIs are forward-compatible: add optional props, never remove or rename without deprecation. Document breaking changes in a changelog.
- Lazy-load heavy components (charts, editors, maps) with framework code-splitting. Never bundle unused component variants in the critical path.
- Styles are co-located and scoped (CSS Modules, styled-components, Tailwind with `@apply`, or framework-native scoped styles). Avoid global CSS that leaks across components.

## Review checks

- Public prop APIs are coherent and documented by usage examples or Storybook stories.
- Render logic is readable without hidden global dependencies (no implicit stores, no window globals).
- Component has unit tests for: rendering, interaction, prop variations, and accessibility (axe-core or equivalent).
- No prop drilling beyond 2 levels; use context, composition, or state management for deep sharing.
- Bundle size impact is measured for new heavy dependencies.
