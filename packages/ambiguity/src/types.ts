import { z } from "zod";

export const DecisionDraftSchema = z.object({
  kind: z.enum(["module-layout", "data-model", "dependency", "api-surface", "logic", "other"]),
  summary: z.string(),
  touchedPaths: z.array(z.string()),
  addsDependency: z.string().optional(),
  changesPublicApi: z.boolean().default(false),
  changesDataModel: z.boolean().default(false),
  crossesModuleBoundary: z.boolean().default(false),
  crossCuttingConcern: z.enum(["auth", "logging", "errors", "i18n", "none"]).default("none"),
  fileCount: z.number().int().nonnegative(),
});
export type DecisionDraft = z.infer<typeof DecisionDraftSchema>;

export interface RubricResult {
  score: number;
  reasons: string[];
  decision: "ask" | "decide" | "tier2";
}
