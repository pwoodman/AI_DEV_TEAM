import { z } from "zod";

export const StackSchema = z.enum(["amase", "superpowers"]);
export type Stack = z.infer<typeof StackSchema>;

export const BenchResultSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  taskId: z.string(),
  stack: StackSchema,
  pass: z.boolean(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  wallMs: z.number().int().nonnegative(),
  diffSimilarity: z.number().min(0).max(1),
  retries: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type BenchResult = z.infer<typeof BenchResultSchema>;
