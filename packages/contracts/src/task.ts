import { z } from "zod";
import { AgentKindSchema, LanguageSchema } from "./kinds.js";

export const TaskStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "validating",
  "completed",
  "failed",
  "skipped",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskNodeContextSliceSchema = z.object({
  symbols: z.array(z.object({ path: z.string().min(1), name: z.string().min(1) })).optional(),
  files: z.array(z.string()).optional(),
});
export type TaskNodeContextSlice = z.infer<typeof TaskNodeContextSliceSchema>;

export const TaskNodeSchema = z.object({
  id: z.string().min(1),
  kind: AgentKindSchema,
  goal: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  allowedPaths: z.array(z.string()).min(1),
  status: TaskStatusSchema.optional(),
  retries: z.number().int().nonnegative().optional(),
  skills: z.array(z.string()).optional(),
  language: LanguageSchema.optional(),
  contextSlice: TaskNodeContextSliceSchema.optional(),
  decisionId: z.string().optional(),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskGraphSchema = z.object({
  dagId: z.string().min(1),
  request: z.string().min(1),
  workspacePath: z.string().min(1),
  nodes: z.array(TaskNodeSchema),
  createdAt: z.string().datetime(),
});
export type TaskGraph = z.infer<typeof TaskGraphSchema>;
