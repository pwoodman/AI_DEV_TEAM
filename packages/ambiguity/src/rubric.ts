import type { DecisionDraft, RubricResult } from "./types.js";

export interface RubricConfig {
  fileCountThreshold?: number;
  extraPredicates?: Array<(d: DecisionDraft) => string | null>;
}

export function scoreDecision(d: DecisionDraft, cfg: RubricConfig = {}): RubricResult {
  const reasons: string[] = [];
  const threshold = cfg.fileCountThreshold ?? 3;
  if (d.changesPublicApi) reasons.push("public API");
  if (d.changesDataModel) reasons.push("data model");
  if (d.addsDependency) reasons.push(`new dep: ${d.addsDependency}`);
  if (d.crossesModuleBoundary) reasons.push("module boundary");
  if (d.fileCount > threshold) reasons.push(`fileCount=${d.fileCount}`);
  if (d.crossCuttingConcern !== "none") reasons.push(`cross-cutting: ${d.crossCuttingConcern}`);
  for (const p of cfg.extraPredicates ?? []) {
    const r = p(d);
    if (r) reasons.push(r);
  }
  const score = reasons.length;
  const decision: RubricResult["decision"] = score >= 2 ? "ask" : score === 0 ? "decide" : "tier2";
  return { score, reasons, decision };
}
