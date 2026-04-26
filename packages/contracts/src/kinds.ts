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

export const LanguageSchema = z.enum([
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "csharp",
  "cpp",
  "c",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dart",
  "scala",
  "shell",
  "sql",
  "html-css",
  "r",
  "lua",
  "other",
]);
export type Language = z.infer<typeof LanguageSchema>;
