import { z } from "zod";

export const AgentKindSchema = z.enum([
  "architect",
  "backend",
  "frontend",
  "refactor",
  "test-gen",
  "qa",
  "ui-test",
  "security",
  "deployment",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const LanguageSchema = z.enum(["ts", "js", "py", "go", "sql", "other"]);
export type Language = z.infer<typeof LanguageSchema>;
