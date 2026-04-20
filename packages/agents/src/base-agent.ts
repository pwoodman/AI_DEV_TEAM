import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentInput,
  AgentInputSchema,
  type AgentKind,
  type AgentOutput,
  AgentOutputSchema,
} from "@amase/contracts";
import type { LlmCallResult, LlmClient } from "@amase/llm";
import { renderTemplate } from "@amase/llm";
import { getSkill } from "@amase/skills";

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

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

export abstract class BaseAgent {
  abstract readonly kind: AgentKind;
  abstract readonly promptFile: string;

  constructor(protected llm: LlmClient) {}

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

  async run(input: AgentInput): Promise<AgentRunResult> {
    const validated = AgentInputSchema.parse(input);
    const template = await this.loadPrompt();
    const base = renderTemplate(template, { kind: this.kind });
    const skillsBlock = await this.loadSkillsBlock(validated.skills);
    const system = base + skillsBlock;
    const user = this.buildUserMessage(validated);

    const start = Date.now();
    const res: LlmCallResult = await this.llm.call({
      system,
      user,
      maxTokens: validated.constraints.maxTokens,
    });
    const durationMs = Date.now() - start;

    const output = this.parseOutput(res.text, validated.taskId);
    return {
      output,
      metrics: {
        taskId: validated.taskId,
        kind: this.kind,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        durationMs,
        model: res.model,
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
