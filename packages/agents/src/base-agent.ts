import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentInput,
  AgentInputSchema,
  type AgentKind,
  type AgentOutput,
  AgentOutputSchema,
  type ContextSlice,
} from "@amase/contracts";
import type { LlmCallResult, LlmClient } from "@amase/llm";
import { buildCachedSystem, renderTemplate } from "@amase/llm";
import { type ValidatorContext, patchSafetyValidator, schemaValidator } from "@amase/validators";
import { selfCorrect } from "./self-correct.js";
import {
  getCachedPromptTemplate,
  getCachedSkillGuide,
  recordSkillFailure,
  recordSkillSuccess,
} from "./shared/cache.js";

export interface AgentMetrics {
  taskId: string;
  kind: AgentKind;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
}

export interface AgentRunResult {
  output: AgentOutput;
  metrics: AgentMetrics;
}

/**
 * Minimal structural type needed from an AST index — avoids a package
 * dependency from @amase/agents onto @amase/memory.
 */
export interface ASTIndexLike {
  getSlice(path: string, symbolName: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------
const MODEL_OPUS = "claude-opus-4-7";
const MODEL_SONNET = "claude-sonnet-4-6";

function estimateComplexity(input: AgentInput): number {
  const goal = input.goal.toLowerCase();
  const files = input.context.files ?? [];
  let score = 0;
  if (/\b(microservice|distributed|auth|payment|async worker|queue)\b/.test(goal)) score += 2;
  if (/\b(refactor|migrate|rename)\b/.test(goal)) score += 1;
  if (files.length > 3) score += 1;
  if (files.length > 8) score += 1;
  if (input.contextSlice?.symbols?.length) score -= 1;
  if (/\bretry\b/i.test(input.taskId)) score -= 1;
  return Math.max(0, score);
}

function selectModel(kind: AgentKind, complexity: number): string {
  if (kind === "architect" || kind === "security") return MODEL_OPUS;
  if (complexity <= 1) return MODEL_SONNET;
  return MODEL_OPUS;
}

// ---------------------------------------------------------------------------
// System prompt cache — keyed by (kind, sortedSkillIds)
// ---------------------------------------------------------------------------
const _systemPromptCache = new Map<string, string[]>();

function buildSystemInputs(
  kind: AgentKind,
  skillIds: string[],
  template: string,
): Array<{ text: string }> {
  return [
    { text: template },
    ...(skillIds.length > 0 ? [{ text: "" }] : []), // placeholder replaced below
  ];
}

// ---------------------------------------------------------------------------
// Parallel skill guide loading using cached guides
// ---------------------------------------------------------------------------
async function loadSkillsGuides(skillIds: string[]): Promise<string[]> {
  const results = await Promise.all(skillIds.map((id) => getCachedSkillGuide(id)));
  return results.filter((g): g is string => g !== undefined);
}

// ---------------------------------------------------------------------------
// Parallel context file loading
// ---------------------------------------------------------------------------
async function loadContextFiles(
  files: string[],
  toAbs: (p: string) => string,
): Promise<Array<{ path: string; slice: string }>> {
  const results = await Promise.all(
    files.map(async (rel) => {
      try {
        const content = await readFile(toAbs(rel), "utf8");
        return { path: rel, slice: content } as const;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is { path: string; slice: string } => r !== null);
}

async function loadContextSymbols(
  symbols: Array<{ path: string; name: string }>,
  astIndex: ASTIndexLike | undefined,
  toAbs: (p: string) => string,
): Promise<Array<{ path: string; slice: string }>> {
  if (!astIndex) return [];
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const text = await astIndex.getSlice(toAbs(sym.path), sym.name);
        if (text === undefined) return null;
        return { path: `${sym.path}#${sym.name}`, slice: text };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is { path: string; slice: string } => r !== null);
}

// ---------------------------------------------------------------------------
// JSON extraction utility
// ---------------------------------------------------------------------------
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

export abstract class BaseAgent {
  abstract readonly kind: AgentKind;
  abstract readonly promptFile: string;

  constructor(
    protected llm: LlmClient,
    protected astIndex?: ASTIndexLike,
  ) {}

  // ---------------------------------------------------------------------------
  // System prompt template — cached after first load
  // ---------------------------------------------------------------------------
  private _cachedTemplate: string | null = null;

  protected async loadPrompt(): Promise<string> {
    if (this._cachedTemplate) return this._cachedTemplate;
    // Architect prompt may be pre-cached
    const cached = await getCachedPromptTemplate(this.kind);
    if (cached) {
      this._cachedTemplate = cached;
      return cached;
    }
    const tmpl = await readFile(join(PROMPTS_DIR, this.promptFile), "utf8");
    this._cachedTemplate = renderTemplate(tmpl, { kind: this.kind });
    return this._cachedTemplate;
  }

  // ---------------------------------------------------------------------------
  // Context slice resolution — parallel I/O
  // ---------------------------------------------------------------------------
  protected async buildContextFromSlice(
    slice: ContextSlice,
    workspace?: string,
  ): Promise<Array<{ path: string; slice: string }>> {
    const toAbs = (p: string): string => (isAbsolute(p) || !workspace ? p : join(workspace, p));

    const [filesResult, symbolsResult] = await Promise.all([
      slice.files && slice.files.length > 0
        ? loadContextFiles(slice.files, toAbs)
        : Promise.resolve([]),
      slice.symbols && slice.symbols.length > 0
        ? loadContextSymbols(slice.symbols, this.astIndex, toAbs)
        : Promise.resolve([]),
    ]);

    return [...filesResult, ...symbolsResult];
  }

  // ---------------------------------------------------------------------------
  // Build user message
  // ---------------------------------------------------------------------------
  protected buildUserMessage(input: AgentInput): string {
    return JSON.stringify(
      {
        taskId: input.taskId,
        goal: input.goal,
        context: input.context,
        constraints: input.constraints,
      },
      null,
      2,
    );
  }

  // ---------------------------------------------------------------------------
  // Parse output
  // ---------------------------------------------------------------------------
  protected parseOutput(raw: string, taskId: string): AgentOutput {
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !("taskId" in parsed)) {
      parsed.taskId = taskId;
    }
    return AgentOutputSchema.parse(parsed);
  }

  // ---------------------------------------------------------------------------
  // Main run()
  // ---------------------------------------------------------------------------
  async run(input: AgentInput, workspace?: string): Promise<AgentRunResult> {
    const validated = AgentInputSchema.parse(input);

    // Resolve context slice in parallel
    if (validated.contextSlice) {
      const resolved = await this.buildContextFromSlice(validated.contextSlice, workspace);
      if (resolved.length > 0) {
        validated.context = { ...validated.context, files: resolved };
      }
    }

    const skillIds = validated.skills ?? [];

    // Build system prompt blocks (eagerly load template and skills in parallel)
    const [template, skillGuides] = await Promise.all([
      this.loadPrompt(),
      loadSkillsGuides(skillIds),
    ]);

    const cacheKey = `${this.kind}:${[...skillIds].sort().join(",")}`;

    let systemInputs = _systemPromptCache.get(cacheKey);
    if (!systemInputs) {
      const parts: Array<{ text: string }> = [{ text: template }];
      if (skillGuides.length > 0) {
        parts.push({
          text: `\n\n## Applicable skills\n\nApply these practices when producing patches:\n\n${skillGuides.map((g) => `### Skill\n\n${g.trim()}`).join("\n\n")}`,
        });
      }
      systemInputs = parts.map((p) => p.text);
      _systemPromptCache.set(cacheKey, systemInputs);
    }

    const user = this.buildUserMessage(validated);
    if (process.env.AMASE_DEBUG_AGENT) {
      console.error(`[agent:${this.kind}] USER MSG (${user.length}b):\n${user.slice(0, 2000)}`);
    }

    const start = Date.now();
    let accTokensIn = 0;
    let accTokensOut = 0;
    let lastModel = "";
    const complexity = estimateComplexity(validated);
    const model = selectModel(this.kind, complexity);

    let parseErrorFeedback: string | undefined;

    const produce = async (feedback?: string): Promise<AgentOutput> => {
      const effectiveSystem = buildCachedSystem(systemInputs.map((text) => ({ text })));
      const effectiveUser = feedback
        ? `${user}\n\n// NOTE: previous draft failed validation:\n// ${feedback}\n// emit a corrected JSON draft only`
        : user;

      const res: LlmCallResult = await this.llm.call({
        system: effectiveSystem,
        user: effectiveUser,
        maxTokens: validated.constraints.maxTokens,
        model,
      });
      accTokensIn += res.tokensIn;
      accTokensOut += res.tokensOut;
      lastModel = res.model;

      try {
        return this.parseOutput(res.text, validated.taskId);
      } catch (e) {
        if (feedback !== undefined) throw e;
        parseErrorFeedback = `parse error: ${(e as Error).message}`;
        return produce(parseErrorFeedback);
      }
    };

    const ctx: ValidatorContext = {
      workspacePath: workspace ?? process.cwd(),
      allowedPaths: validated.constraints.allowedPaths,
      touchesFrontend: false,
    };

    const { output, firstFailureValidator } = await selfCorrect({
      produce,
      validators: [schemaValidator, patchSafetyValidator],
      ctx,
    });

    // Record skill outcomes
    for (const skillId of skillIds) {
      if (firstFailureValidator === "skill-checks") {
        recordSkillFailure(this.kind, validated.language, skillId);
      } else {
        recordSkillSuccess(this.kind, validated.language, skillId);
      }
    }

    const durationMs = Date.now() - start;

    return {
      output,
      metrics: {
        taskId: validated.taskId,
        kind: this.kind,
        tokensIn: accTokensIn,
        tokensOut: accTokensOut,
        durationMs,
        model: lastModel,
      },
    };
  }
}
