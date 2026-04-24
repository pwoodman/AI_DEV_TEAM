import type { AgentKind, Language, Patch, ValidationResult } from "@amase/contracts";
import { loadGuide } from "./loader.js";
import type { Skill, SkillAppliesTo } from "./types.js";

import { check as apiIntegrationCheck } from "./skills/backend/api-integration/check.js";
// Backend
import { check as asyncJobsCheck } from "./skills/backend/async-jobs/check.js";
import { check as backendDataModelCheck } from "./skills/backend/data-model/check.js";
import { check as databaseFlavorsCheck } from "./skills/backend/database-flavors/check.js";
import { check as backendRestApiCheck } from "./skills/backend/rest-api/check.js";

import { check as frontendAccessibilityCheck } from "./skills/frontend/accessibility/check.js";
// Frontend
import { check as componentDesignCheck } from "./skills/frontend/component-design/check.js";
import { check as frontendPerformanceCheck } from "./skills/frontend/performance/check.js";
import { check as stateManagementCheck } from "./skills/frontend/state-management/check.js";

// Languages
import { check as langGoCheck } from "./skills/lang/go/check.js";
import { check as langPythonCheck } from "./skills/lang/python/check.js";
import { check as regexCheck } from "./skills/lang/regex/check.js";
import { check as sqlCheck } from "./skills/lang/sql/check.js";
import { check as langTypeScriptCheck } from "./skills/lang/typescript/check.js";

// Security
import { check as securitySecretsCheck } from "./skills/security/secrets/check.js";

// Deployment
import { check as deploymentDockerizeCheck } from "./skills/deployment/dockerize/check.js";
import { check as observabilityCheck } from "./skills/deployment/observability/check.js";

// Testing
import { check as integrationTestingCheck } from "./skills/testing/integration-testing/check.js";
import { check as unitTestingCheck } from "./skills/testing/unit-testing/check.js";

import { check as diagrammingCheck } from "./skills/architecture/diagramming/check.js";
// Architecture
import { check as eventDrivenCheck } from "./skills/architecture/event-driven/check.js";

// Performance
import { check as cachingCheck } from "./skills/performance/caching/check.js";

function skill(
  id: string,
  summary: string,
  appliesTo: SkillAppliesTo,
  check?: Skill["check"],
): Skill {
  return { id, summary, appliesTo, guide: () => loadGuide(id), check };
}

export const ALL_SKILLS: Skill[] = [
  // Backend
  skill(
    "backend/rest-api",
    "REST API design conventions",
    { kinds: ["backend"] },
    backendRestApiCheck,
  ),
  skill(
    "backend/async-jobs",
    "Async job design: idempotency, retries, DLQs",
    { kinds: ["backend"] },
    asyncJobsCheck,
  ),
  skill("backend/design", "System design: APIs, data, consistency, scaling, SLOs, security", {
    kinds: ["backend", "architect"],
  }),
  skill(
    "backend/data-model",
    "Data model + migration safety",
    { kinds: ["backend"] },
    backendDataModelCheck,
  ),
  skill(
    "backend/api-integration",
    "REST, SOAP, GraphQL, gRPC client integration patterns",
    { kinds: ["backend", "frontend"] },
    apiIntegrationCheck,
  ),
  skill(
    "backend/database-flavors",
    "PostgreSQL, MySQL, SQL Server, SQLite, Snowflake, Oracle specifics",
    { kinds: ["backend"] },
    databaseFlavorsCheck,
  ),

  // Frontend
  skill(
    "frontend/component-design",
    "Component boundaries and props",
    { kinds: ["frontend"] },
    componentDesignCheck,
  ),
  skill(
    "frontend/state-management",
    "Local vs shared vs server state",
    { kinds: ["frontend"] },
    stateManagementCheck,
  ),
  skill(
    "frontend/accessibility",
    "WCAG: labels, focus, keyboard, contrast",
    { kinds: ["frontend", "ui-test"] },
    frontendAccessibilityCheck,
  ),
  skill(
    "frontend/performance",
    "Core Web Vitals, bundle optimization, lazy loading",
    { kinds: ["frontend"] },
    frontendPerformanceCheck,
  ),

  // Languages
  skill(
    "lang/typescript",
    "TypeScript idioms and pitfalls",
    { languages: ["ts", "js"] },
    langTypeScriptCheck,
  ),
  skill("lang/python", "Python idioms and pitfalls", { languages: ["py"] }, langPythonCheck),
  skill("lang/go", "Go idioms and pitfalls", { languages: ["go"] }, langGoCheck),
  skill("lang/sql", "Safe SQL authoring and migrations", { languages: ["sql"] }, sqlCheck),
  skill(
    "lang/regex",
    "Regex safety, ReDoS prevention, anchors, capture groups",
    { languages: ["ts", "js", "py", "go"] },
    regexCheck,
  ),

  // Security
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

  // Deployment
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
  skill(
    "deployment/observability",
    "Logs, metrics, traces, SLOs",
    { kinds: ["deployment", "backend"] },
    observabilityCheck,
  ),

  // Testing
  skill(
    "testing/unit-testing",
    "Deterministic, isolated, fast unit tests",
    { kinds: ["test-gen", "qa", "backend", "frontend"] },
    unitTestingCheck,
  ),
  skill(
    "testing/integration-testing",
    "End-to-end service and database integration tests",
    { kinds: ["test-gen", "qa", "backend"] },
    integrationTestingCheck,
  ),

  // Architecture
  skill(
    "architecture/event-driven",
    "Event-driven patterns: brokers, schemas, idempotency, DLQs",
    { kinds: ["architect", "backend"] },
    eventDrivenCheck,
  ),
  skill(
    "architecture/diagramming",
    "Diagrams-as-code, C4 model, Mermaid, PlantUML, ADRs",
    { kinds: ["architect", "backend", "frontend"] },
    diagrammingCheck,
  ),

  // Performance
  skill(
    "performance/caching",
    "Cache design, invalidation, consistency, stampede protection",
    { kinds: ["backend", "frontend"] },
    cachingCheck,
  ),
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
  const results = await Promise.all(
    skills
      .filter((s) => !!s.check)
      .map(async (s) => {
        if (!s.check) return null;
        return s.check(patches, ctx);
      }),
  );
  return results.filter((r): r is ValidationResult => r !== null);
}
