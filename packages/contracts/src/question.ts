import { z } from "zod";

export const OptionSchema = z.object({
  label: z.string(),
  detail: z.string(),
});
export type Option = z.infer<typeof OptionSchema>;

export const UserQuestionSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  options: z.tuple([OptionSchema, OptionSchema, OptionSchema]),
  recommended: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  reason: z.string(),
  runId: z.string(),
});
export type UserQuestion = z.infer<typeof UserQuestionSchema>;

export const UserAnswerSchema = z.object({
  questionId: z.string(),
  choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  runId: z.string(),
});
export type UserAnswer = z.infer<typeof UserAnswerSchema>;
