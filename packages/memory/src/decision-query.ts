import type { DecisionDraft } from "@amase/contracts";
import { dirname, extname } from "node:path";

export function touchedPathsSignature(d: DecisionDraft): string[] {
  const buckets = new Map<string, string>();
  for (const p of d.touchedPaths) {
    const key = `${dirname(p)}::${extname(p)}`;
    buckets.set(key, `${dirname(p)}/*${extname(p)}`);
  }
  return Array.from(buckets.values()).sort();
}

export interface LoggedDecision {
  id: string;
  kind: DecisionDraft["kind"];
  signature: string[];
  answer: { choice: 0 | 1 | 2 };
}

export function findReusableDecision(
  log: LoggedDecision[],
  d: DecisionDraft,
): LoggedDecision | null {
  const sig = touchedPathsSignature(d);
  for (const entry of log) {
    if (entry.kind !== d.kind) continue;
    if (entry.signature.length !== sig.length) continue;
    if (entry.signature.every((s, i) => s === sig[i])) return entry;
  }
  return null;
}
