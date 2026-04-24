# Frontend Performance

## Scope

Loading performance, runtime responsiveness, bundle optimization, and Core Web Vitals for web applications.

## Non-negotiables

- Measure Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1) with real-user monitoring (RUM), not just lab tests. Set budgets and alert on regression.
- JavaScript bundles are code-split by route and by component. Use dynamic imports for heavy features (charts, editors, maps). Target <200KB initial JS gzipped.
- Images are optimized: WebP/AVIF with fallbacks, responsive sizes (`srcset`), lazy loading (`loading="lazy"`), and explicit dimensions to prevent layout shift.
- Fonts are self-hosted or use `font-display: swap`. Preload critical fonts. Subset font files to only needed characters. Never block rendering for font loading.
- Third-party scripts are loaded asynchronously or deferred. Use `async`/`defer` attributes, Partytown for non-critical scripts, or load on interaction. Monitor their impact on main thread.
- CSS is critical-path optimized: inline critical CSS, defer non-critical styles, purge unused CSS. Avoid render-blocking stylesheets in `<head>`.
- Memory leaks are prevented: clean up event listeners, intervals, subscriptions, and observers on component unmount. Use WeakRef/WeakMap for caches.
- Lists and tables use virtualization (react-window, react-virtualized, @tanstack/react-virtual) for >100 items. Never render thousands of DOM nodes at once.

## Review checks

- Lighthouse score is >= 90 for Performance on mobile and desktop.
- Bundle analyzer is run for significant changes; no unexpected bloat from dependencies.
- Images have explicit width/height or aspect-ratio to prevent CLS.
- No layout thrashing (read then write DOM properties in batches, not interleaved).
- Service worker caching strategy is defined and tested for offline functionality.
