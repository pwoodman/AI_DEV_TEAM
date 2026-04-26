import type { ValidationResult } from "@amase/contracts";

export interface LangAdapter {
  readonly language: string;
  readonly extensions: string[];
  lint(files: string[], workspace: string): Promise<ValidationResult>;
  typecheck(files: string[], workspace: string): Promise<ValidationResult>;
  format(files: string[], workspace: string): Promise<ValidationResult>;
  test(files: string[], workspace: string): Promise<ValidationResult>;
}
