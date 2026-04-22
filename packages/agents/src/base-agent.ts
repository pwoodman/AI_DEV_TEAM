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
import { renderTemplate } from "@amase/llm";
import { getSkill } from "@amase/skills";
import { type ValidatorContext, patchSafetyValidator, schemaValidator } from "@amase/validators";
import { selfCorrect } from "./self-correct.js";

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
 * Minimal structural type we need from an AST index. Defined here to avoid
 * a package dependency from @amase/agents onto @amase/memory.
 */
export interface ASTIndexLike {
  getSlice(path: string, symbolName: string): Promise<string | undefined>;
}

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

export abstract class BaseAgent {
  abstract readonly kind: AgentKind;
  abstract readonly promptFile: string;

  constructor(
    protected llm: LlmClient,
    protected astIndex?: ASTIndexLike,
  ) {}

  protected async loadPrompt(): Promise<string> {
    return await readFile(join(PROMPTS_DIR, this.promptFile), "utf8");
  }

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

  protected parseOutput(raw: string, taskId: string): AgentOutput {
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !("taskId" in parsed)) {
      parsed.taskId = taskId;
    }
    return AgentOutputSchema.parse(parsed);
  }

  protected async loadSkillsBlock(skillIds: string[] | undefined): Promise<string> {
    if (!skillIds || skillIds.length === 0) return "";
    const parts: string[] = [];
    for (const id of skillIds) {
      const skill = getSkill(id);
      if (!skill) continue;
      const guide = await skill.guide();
      parts.push(`### Skill: ${id}\n\n${guide.trim()}`);
    }
    if (parts.length === 0) return "";
    return `\n\n## Applicable skills\n\nApply these practices when producing patches:\n\n${parts.join("\n\n")}\n`;
  }

  /**
   * Resolve a ContextSlice (requested by the architect/orchestrator) into
   * concrete `{path, slice}` file entries by reading files and/or extracting
   * AST symbol slices. Symbols that cannot be resolved are skipped silently
   * (so a single bad ref doesn't break the run).
   *
   * If no workspace is provided, paths are assumed to already be absolute or
   * relative to the current process cwd.
   */
  protected async buildContextFromSlice(
    slice: ContextSlice,
    workspace?: string,
  ): Promise<Array<{ path: string; slice: string }>> {
    const out: Array<{ path: string; slice: string }> = [];
    const toAbs = (p: string): string => (isAbsolute(p) || !workspace ? p : join(workspace, p));

    if (slice.files && slice.files.length > 0) {
      for (const rel of slice.files) {
        try {
          const content = await readFile(toAbs(rel), "utf8");
          out.push({ path: rel, slice: content });
        } catch {
          // skip unreadable files
        }
      }
    }

    if (slice.symbols && slice.symbols.length > 0) {
      for (const sym of slice.symbols) {
        if (!this.astIndex) break; // no AST index available, skip symbols
        try {
          const text = await this.astIndex.getSlice(toAbs(sym.path), sym.name);
          if (text !== undefined) {
            out.push({ path: `${sym.path}#${sym.name}`, slice: text });
          }
        } catch {
          // unresolvable symbol, skip silently
        }
      }
    }

    return out;
  }

  async run(input: AgentInput, workspace?: string): Promise<AgentRunResult> {
    const validated = AgentInputSchema.parse(input);

    // If caller supplied a contextSlice, resolve it into context.files
    // (replacing whatever the caller might have populated by naive walk).
    if (validated.contextSlice) {
      const resolved = await this.buildContextFromSlice(validated.contextSlice, workspace);
      if (resolved.length > 0) {
        validated.context = { ...validated.context, files: resolved };
      }
    }

    const template = await this.loadPrompt();
    const base = renderTemplate(template, { kind: this.kind });
    const skillsBlock = await this.loadSkillsBlock(validated.skills);
    const system = base + skillsBlock;
    const user = this.buildUserMessage(validated);
    if (process.env.AMASE_DEBUG_AGENT) {
      console.error(`[agent:${this.kind}] USER MSG (${user.length}b):\n${user.slice(0, 2000)}`);
    }

    const start = Date.now();
    let accTokensIn = 0;
    let accTokensOut = 0;
    let lastModel = "";
    let parseErrorFeedback: string | undefined;

    const produce = async (feedback?: string): Promise<AgentOutput> => {
      const effectiveUser = feedback
        ? `${user}\n\n// NOTE: previous draft failed validation:\n// ${feedback}\n// emit a corrected JSON draft only`
        : user;
      const res: LlmCallResult = await this.llm.call({
        system,
        user: effectiveUser,
        maxTokens: validated.constraints.maxTokens,
      });
      accTokensIn += res.tokensIn;
      accTokensOut += res.tokensOut;
      lastModel = res.model;
      try {
        return this.parseOutput(res.text, validated.taskId);
      } catch (e) {
        // On the retry pass, propagate so run() throws.
        if (feedback !== undefined) throw e;
        // First pass parse failure: record feedback and re-invoke once.
        parseErrorFeedback = `parse error: ${(e as Error).message}`;
        return produce(parseErrorFeedback);
      }
    };

    const ctx: ValidatorContext = {
      workspacePath: workspace ?? process.cwd(),
      allowedPaths: validated.constraints.allowedPaths,
      touchesFrontend: false,
    };
    const output = await selfCorrect({
      produce,
      validators: [schemaValidator, patchSafetyValidator],
      ctx,
    });
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

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}
