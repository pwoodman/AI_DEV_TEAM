import { z } from "zod";
import { AgentKindSchema, LanguageSchema } from "./kinds.js";
import { TaskNodeSchema } from "./task.js";

export { AgentKindSchema };
export type { AgentKind } from "./kinds.js";

export const SymbolRefSchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: z.enum(["function", "class", "interface", "type", "const"]),
});
export type SymbolRef = z.infer<typeof SymbolRefSchema>;

export const ContextEnvelopeSchema = z.object({
  files: z.array(z.object({ path: z.string(), slice: z.string() })),
  schemas: z.array(z.unknown()).optional(),
  diff: z.string().optional(),
  relatedSymbols: z.array(SymbolRefSchema).optional(),
});
export type ContextEnvelope = z.infer<typeof ContextEnvelopeSchema>;

export const AgentInputSchema = z.object({
  taskId: z.string().min(1),
  kind: AgentKindSchema,
  goal: z.string().min(1),
  context: ContextEnvelopeSchema,
  constraints: z.object({
    maxTokens: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    allowedPaths: z.array(z.string()).min(1),
  }),
  skills: z.array(z.string()).optional(),
  language: LanguageSchema.optional(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;

export const PatchOpSchema = z.enum(["create", "modify", "delete"]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchSchema = z.object({
  path: z.string().min(1),
  op: PatchOpSchema,
  content: z.string(),
});
export type Patch = z.infer<typeof PatchSchema>;

export const AgentOutputSchema = z.object({
  taskId: z.string().min(1),
  patches: z.array(PatchSchema),
  notes: z.string().max(200),
  followups: z.array(TaskNodeSchema).optional(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
