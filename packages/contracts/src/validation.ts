import { z } from "zod";

export const ValidatorNameSchema = z.enum([
  "schema",
  "patch-safety",
  "skill-checks",
  "typecheck",
  "lint",
  "unit-tests",
  "ui-tests",
  "security",
  "deployment-readiness",
]);
export type ValidatorName = z.infer<typeof ValidatorNameSchema>;

export const ValidationIssueSchema = z.object({
  file: z.string().optional(),
  line: z.number().int().optional(),
  message: z.string(),
  severity: z.enum(["error", "warning"]).default("error"),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationResultSchema = z.object({
  validator: ValidatorNameSchema,
  ok: z.boolean(),
  issues: z.array(ValidationIssueSchema).default([]),
  durationMs: z.number().nonnegative(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const DecisionLogEntrySchema = z.object({
  ts: z.string().datetime(),
  dagId: z.string(),
  runId: z.string(),
  nodeId: z.string(),
  event: z.enum([
    "node.started",
    "node.completed",
    "node.failed",
    "node.retried",
    "validator.passed",
    "validator.failed",
    "llm.call",
    "skill.applied",
    "deployment.readiness",
  ]),
  data: z.record(z.unknown()).default({}),
});
export type DecisionLogEntry = z.infer<typeof DecisionLogEntrySchema>;
