import { z } from "zod";

export const StackSchema = z.enum(["amase", "superpowers"]);
export type Stack = z.infer<typeof StackSchema>;

export const FairnessSchema = z.enum(["primary", "secondary"]);
export type Fairness = z.infer<typeof FairnessSchema>;

export const BenchResultSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  taskId: z.string(),
  stack: StackSchema,
  model: z.string(),
  runSeq: z.number().int().min(1),
  pass: z.boolean(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  tokensCached: z.number().int().nonnegative(),
  validatorFailures: z.number().int().nonnegative(),
  wallMs: z.number().int().nonnegative(),
  diffSimilarity: z.number().min(0).max(1),
  retries: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type BenchResult = z.infer<typeof BenchResultSchema>;

const SampleStatsSchema = z.object({
  mean: z.number(),
  stdev: z.number(),
});

const MetricComparisonSchema = z.object({
  amase: SampleStatsSchema,
  superpowers: SampleStatsSchema,
  delta: z.number(), // (superpowers - amase) / superpowers; positive = AMASE better
  ci95: z.tuple([z.number(), z.number()]), // CI on the delta
  pValue: z.number(),
});

export const HeadlineReportSchema = z.object({
  fairness: FairnessSchema,
  samplesPerCell: z.number().int().min(1),
  tasks: z.number().int().nonnegative(),
  bothPassedAll: z.number().int().nonnegative(),
  wallMs: MetricComparisonSchema,
  tokens: MetricComparisonSchema,
  passRate: z.object({
    amase: z.number().min(0).max(1),
    superpowers: z.number().min(0).max(1),
  }),
  verdict: z.enum(["ok", "insufficient_signal", "regression", "fail_targets"]),
  notes: z.array(z.string()).default([]),
});
export type HeadlineReport = z.infer<typeof HeadlineReportSchema>;

export interface RunOpts {
  runId: string;
  runSeq: number;
  model: string;
  fairness: Fairness;
  live?: boolean;
}
