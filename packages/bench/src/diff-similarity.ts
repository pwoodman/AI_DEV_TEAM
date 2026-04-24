/**
 * Tokenize a string into meaningful code tokens.
 * Splits on whitespace and also separates common code symbols
 * to get more granular similarity for code diffs.
 */
function tokenize(s: string): Set<string> {
  // Split on whitespace and common code boundaries
  const tokens = s
    .split(/[\s{}()\[\];:,.<>=!&|+\-*\/]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  return new Set(tokens);
}

/**
 * Compute a normalized token-level Jaccard similarity between two strings.
 * Returns 1 for identical (or both-empty) inputs, 0 for fully disjoint inputs.
 * Uses code-aware tokenization for better similarity matching.
 */
export function diffSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}
