import type { AgentKind, Language, Patch, ValidationResult } from "@amase/contracts";

export interface SkillAppliesTo {
  kinds?: AgentKind[];
  languages?: Language[];
  pathPatterns?: RegExp[];
}

export interface SkillCheckContext {
  workspacePath: string;
  allowedPaths: string[];
  language?: Language;
}

export type SkillCheck = (
  patches: Patch[],
  ctx: SkillCheckContext,
) => Promise<ValidationResult> | ValidationResult;

export interface Skill {
  id: string;
  summary: string;
  appliesTo: SkillAppliesTo;
  guide: () => Promise<string>;
  check?: SkillCheck;
}
