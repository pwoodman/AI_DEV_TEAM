export { DecisionDraftSchema, type DecisionDraft } from "@amase/contracts";

export interface RubricResult {
  score: number;
  reasons: string[];
  decision: "ask" | "decide" | "tier2";
}
