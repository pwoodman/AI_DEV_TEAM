import type { AgentKind, Language, Patch, ValidationResult } from "@amase/contracts";
import { SKILL_INDEX, type Skill } from "@amase/skills";

// ---------------------------------------------------------------------------
// Skill guide cache — pre-warmed once at registry construction
// ---------------------------------------------------------------------------
let _skillGuideCache: Map<string, string> | null = null;
let _skillGuideCacheLoading: Promise<Map<string, string>> | null = null;

export async function buildSkillGuideCache(): Promise<Map<string, string>> {
  if (_skillGuideCache) return _skillGuideCache;
  if (_skillGuideCacheLoading) return _skillGuideCacheLoading;
  _skillGuideCacheLoading = (async () => {
    const map = new Map<string, string>();
    const { ALL_SKILLS } = await import("@amase/skills");
    await Promise.all(
      ALL_SKILLS.map(async (s) => {
        const guide = await s.guide();
        map.set(s.id, guide);
      }),
    );
    _skillGuideCache = map;
    return map;
  })();
  return _skillGuideCacheLoading;
}

export async function getCachedSkillGuide(skillId: string): Promise<string | undefined> {
  const cache = await buildSkillGuideCache();
  return cache.get(skillId);
}

// ---------------------------------------------------------------------------
// Pre-rendered prompt template cache
// ---------------------------------------------------------------------------
let _promptTemplateCache: Map<string, string> | null = null;

export async function getCachedPromptTemplate(kind: AgentKind): Promise<string | undefined> {
  if (_promptTemplateCache) return _promptTemplateCache.get(`${kind}:`);
  const { loadTemplate, renderTemplate } = await import("@amase/llm");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const agents: Array<{ kind: AgentKind; promptFile: string }> = [
    { kind: "architect", promptFile: "architect.md" },
    { kind: "backend", promptFile: "backend.md" },
    { kind: "frontend", promptFile: "frontend.md" },
    { kind: "refactor", promptFile: "refactor.md" },
    { kind: "test-gen", promptFile: "test-gen.md" },
    { kind: "qa", promptFile: "qa.md" },
    { kind: "ui-test", promptFile: "ui-test.md" },
    { kind: "security", promptFile: "security.md" },
    { kind: "deployment", promptFile: "deployment.md" },
  ];

  _promptTemplateCache = new Map();
  for (const a of agents) {
    const tmpl = await loadTemplate(join(__dirname, "..", "prompts", a.promptFile));
    _promptTemplateCache.set(`${a.kind}:`, renderTemplate(tmpl, { kind: a.kind }));
  }
  return _promptTemplateCache.get(`${kind}:`);
}

// ---------------------------------------------------------------------------
// Skill failure tracking — skip skills failing >MAX_CONSECUTIVE_FAILURES
// ---------------------------------------------------------------------------
const MAX_CONSECUTIVE_FAILURES = 3;

function _failureKey(k: AgentKind, lang: Language | undefined, skillId: string): string {
  return `${k}\x00${lang ?? ""}\x00${skillId}`;
}

const _failureCounts = new Map<string, number>();

export function recordSkillFailure(
  kind: AgentKind,
  language: Language | undefined,
  skillId: string,
): void {
  const k = _failureKey(kind, language, skillId);
  _failureCounts.set(k, (_failureCounts.get(k) ?? 0) + 1);
}

export function recordSkillSuccess(
  kind: AgentKind,
  language: Language | undefined,
  skillId: string,
): void {
  const k = _failureKey(kind, language, skillId);
  _failureCounts.set(k, 0);
}

export function isSkillSuppressed(
  kind: AgentKind,
  language: Language | undefined,
  skillId: string,
): boolean {
  return (
    (_failureCounts.get(_failureKey(kind, language, skillId)) ?? 0) >= MAX_CONSECUTIVE_FAILURES
  );
}

export function filterSkills(
  skills: Skill[],
  kind: AgentKind,
  language: Language | undefined,
): Skill[] {
  return skills.filter((s) => !isSkillSuppressed(kind, language, s.id));
}

// ---------------------------------------------------------------------------
// Patch quality memory — rolling per (kind, language)
// ---------------------------------------------------------------------------
export interface QualityRecord {
  total: number;
  passCount: number;
  avgDiffSimilarity: number;
}

const _qualityMap = new Map<string, QualityRecord>();

function _qualityKey(kind: AgentKind, language: Language | undefined): string {
  return `${kind}\x00${language ?? ""}`;
}

export function recordPatchQuality(
  kind: AgentKind,
  language: Language | undefined,
  pass: boolean,
  diffSimilarity: number,
): void {
  const k = _qualityKey(kind, language);
  const prev = _qualityMap.get(k) ?? { total: 0, passCount: 0, avgDiffSimilarity: 0 };
  const n = prev.total + 1;
  _qualityMap.set(k, {
    total: n,
    passCount: prev.passCount + (pass ? 1 : 0),
    avgDiffSimilarity: prev.avgDiffSimilarity + (diffSimilarity - prev.avgDiffSimilarity) / n,
  });
}

export function getQualityRecord(
  kind: AgentKind,
  language: Language | undefined,
): QualityRecord | undefined {
  return _qualityMap.get(_qualityKey(kind, language));
}

export function qualityConfidence(kind: AgentKind, language: Language | undefined): number {
  const rec = getQualityRecord(kind, language);
  if (!rec || rec.total < 3) return 0;
  return rec.passCount / rec.total;
}
