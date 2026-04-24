import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const CACHE_NO_TTL = /\b(redis|memcached|cache)\.(set|put|write)\s*\([^,]+,\s*[^)]+\)/;
const CACHE_NO_INVALIDATION = /\b(redis|memcached|cache)\.(set|put|write)\b/;
const INVALIDATION_PATTERN = /\b(invalidat|clear|del|expire|flush|evict)\b/i;
const UNBOUNDED_KEY = /\bcache\.(set|put)\s*\(\s*[`'"][^`'"]*\$\{[^}]+\}[^`'"]*[`'"]/;
const NO_COALESCING = /\b(redis|memcached|cache)\.(get|fetch)\b/;
const COALESCING_PATTERN = /\b(singleflight|dedup|coalesc|batch|mget)\b/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    const hasCache = /\b(redis|memcached|cache|Cache|CacheManager|ioredis)\b/.test(content);
    if (!hasCache) continue;

    if (CACHE_NO_TTL.test(content) && !/ttl|expire|maxAge|max-age/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Cache set without TTL or expiration. All cached data must have a bounded lifetime.",
        severity: "warning",
      });
    }

    if (CACHE_NO_INVALIDATION.test(content) && !INVALIDATION_PATTERN.test(content)) {
      issues.push({
        file: p.path,
        message: "Cache writes detected but no invalidation logic found. Implement cache invalidation on data mutations.",
        severity: "warning",
      });
    }

    if (UNBOUNDED_KEY.test(content)) {
      issues.push({
        file: p.path,
        message: "Cache key constructed with dynamic interpolation. Ensure key cardinality is bounded and evictable.",
        severity: "warning",
      });
    }

    if (NO_COALESCING.test(content) && !COALESCING_PATTERN.test(content)) {
      issues.push({
        file: p.path,
        message: "Cache read without request coalescing. Add singleflight or deduplication to prevent cache stampede.",
        severity: "warning",
      });
    }
  }

  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
