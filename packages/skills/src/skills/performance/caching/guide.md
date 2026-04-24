# Caching

## Scope

Cache design, invalidation strategies, consistency models, and operational concerns for high-performance distributed systems.

## Non-negotiables

- Cache invalidation is explicit and documented: TTL, write-through, write-behind, or event-driven invalidation. Never rely solely on TTL for data that must be consistent.
- Cache keys are deterministic, scoped, and versioned. Include schema version in key to handle format changes. Avoid unbounded key cardinality (no user_id in key for per-user caches without eviction).
- Stale-while-revalidate is preferred over blocking cache misses. Serve stale data briefly while refreshing in background. Set `stale-while-revalidate` and `max-age` headers appropriately.
- Write paths invalidate cache before or atomically with database commit. Race conditions between cache and DB cause permanent inconsistency. Use cache-aside with careful ordering or write-through for simplicity.
- Distributed caches (Redis, Memcached) have connection pooling, timeout, and circuit breaker configuration. Monitor hit rate, eviction rate, and memory usage. Alert on hit rate drops.
- Local caches (LRU, LFU) are bounded and instrumented. Set max size and eviction policy. Never grow unbounded in memory.
- Cache warming is proactive for critical paths, not reactive. Pre-populate cache on deploy or data refresh. Document warm-up procedure.
- Cold cache protection: implement request coalescing (singleflight, deduplication) to prevent cache stampede on expiry. Never allow thundering herd on popular keys.

## Review checks

- Cache hit rate is measured and meets SLO (target: >80% for hot paths).
- Invalidation covers all write paths: create, update, delete, and bulk operations.
- No cached data without TTL or max size limit.
- Cache stampede protection is tested under load.
- Check omitted: automated cache consistency verification requires manual load testing.
