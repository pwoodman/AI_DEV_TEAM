function tokens(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean));
}

/**
 * Compute a normalized token-level Jaccard similarity between two strings.
 * Returns 1 for identical (or both-empty) inputs, 0 for fully disjoint inputs.
 */
export function diffSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}
