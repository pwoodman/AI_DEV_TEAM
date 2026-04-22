import type { AgentKind, Language, Patch, ValidationResult } from "@amase/contracts";
import { loadGuide } from "./loader.js";
import type { Skill, SkillAppliesTo } from "./types.js";

import { check as backendDataModelCheck } from "./skills/backend/data-model/check.js";
// Check modules
import { check as backendRestApiCheck } from "./skills/backend/rest-api/check.js";
import { check as deploymentDockerizeCheck } from "./skills/deployment/dockerize/check.js";
import { check as frontendAccessibilityCheck } from "./skills/frontend/accessibility/check.js";
import { check as langGoCheck } from "./skills/lang/go/check.js";
import { check as langPythonCheck } from "./skills/lang/python/check.js";
import { check as langTypeScriptCheck } from "./skills/lang/typescript/check.js";
import { check as securitySecretsCheck } from "./skills/security/secrets/check.js";

function skill(
  id: string,
  summary: string,
  appliesTo: SkillAppliesTo,
  check?: Skill["check"],
): Skill {
  return { id, summary, appliesTo, guide: () => loadGuide(id), check };
}

export const ALL_SKILLS: Skill[] = [
  skill(
    "backend/rest-api",
    "REST API design conventions",
    { kinds: ["backend"] },
    backendRestApiCheck,
  ),
  skill("backend/async-jobs", "Async job design: idempotency, retries, DLQs", {
    kinds: ["backend"],
  }),
  skill(
    "backend/data-model",
    "Data model + migration safety",
    { kinds: ["backend"] },
    backendDataModelCheck,
  ),
  skill("frontend/component-design", "Component boundaries and props", { kinds: ["frontend"] }),
  skill("frontend/state-management", "Local vs shared vs server state", { kinds: ["frontend"] }),
  skill(
    "frontend/accessibility",
    "WCAG: labels, focus, keyboard, contrast",
    { kinds: ["frontend", "ui-test"] },
    frontendAccessibilityCheck,
  ),
  skill(
    "lang/typescript",
    "TypeScript idioms and pitfalls",
    { languages: ["ts", "js"] },
    langTypeScriptCheck,
  ),
  skill("lang/python", "Python idioms and pitfalls", { languages: ["py"] }, langPythonCheck),
  skill("lang/go", "Go idioms and pitfalls", { languages: ["go"] }, langGoCheck),
  skill("lang/sql", "Safe SQL authoring and migrations", { languages: ["sql"] }),
  skill(
    "security/secrets",
    "No secrets in code; env/secret-manager only",
    { kinds: ["security", "backend", "frontend", "deployment"] },
    securitySecretsCheck,
  ),
  skill("security/input-validation", "Validate all external input at the boundary", {
    kinds: ["security", "backend"],
  }),
  skill("security/authn-authz", "Authentication and authorization patterns", {
    kinds: ["security", "backend"],
  }),
  skill(
    "deployment/dockerize",
    "Container image conventions and minimal attack surface",
    { kinds: ["deployment"], pathPatterns: [/(^|[\\/])Dockerfile$/] },
    deploymentDockerizeCheck,
  ),
  skill("deployment/ci-gates", "Required CI gates before merge", {
    kinds: ["deployment"],
    pathPatterns: [/\.github[\\/]workflows[\\/].+\.ya?ml$/],
  }),
  skill("deployment/observability", "Logs, metrics, traces, SLOs", {
    kinds: ["deployment", "backend"],
  }),
];

export const SKILL_INDEX: Map<string, Skill> = new Map(ALL_SKILLS.map((s) => [s.id, s]));

export interface ResolveOptions {
  kind: AgentKind;
  language?: Language;
  touchedPaths?: string[];
}

export function resolveSkills(opts: ResolveOptions): Skill[] {
  const out: Skill[] = [];
  for (const s of ALL_SKILLS) {
    const kindMatch = !s.appliesTo.kinds || s.appliesTo.kinds.includes(opts.kind);
    const langMatch =
      !s.appliesTo.languages ||
      (opts.language ? s.appliesTo.languages.includes(opts.language) : false);
    const pathMatch =
      s.appliesTo.pathPatterns && opts.touchedPaths
        ? opts.touchedPaths.some((p) => s.appliesTo.pathPatterns?.some((re) => re.test(p)))
        : false;

    // A skill applies if:
    // - it's language-scoped and language matches, OR
    // - it's path-scoped and a path matches, OR
    // - it's kind-scoped (no language/path requirements) and kind matches.
    const hasLang = !!s.appliesTo.languages;
    const hasPath = !!s.appliesTo.pathPatterns;
    if (hasLang && langMatch) out.push(s);
    else if (hasPath && pathMatch) out.push(s);
    else if (!hasLang && !hasPath && kindMatch) out.push(s);
  }
  return out;
}

export function getSkill(id: string): Skill | undefined {
  return SKILL_INDEX.get(id);
}

export async function runSkillChecks(
  skills: Skill[],
  patches: Patch[],
  ctx: { workspacePath: string; allowedPaths: string[]; language?: Language },
): Promise<ValidationResult[]> {
  const out: ValidationResult[] = [];
  for (const s of skills) {
    if (!s.check) continue;
    const r = await s.check(patches, ctx);
    out.push(r);
  }
  return out;
}
