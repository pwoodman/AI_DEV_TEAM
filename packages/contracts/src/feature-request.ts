import { z } from "zod";

export const FeatureRequestSchema = z.object({
  request: z.string().min(1),
  workspacePath: z.string().min(1),
  hints: z
    .object({
      touchesFrontend: z.boolean().optional(),
      touchesBackend: z.boolean().optional(),
      refactorOnly: z.boolean().optional(),
    })
    .optional(),
});
export type FeatureRequest = z.infer<typeof FeatureRequestSchema>;
