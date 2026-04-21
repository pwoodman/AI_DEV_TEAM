import { randomUUID } from "node:crypto";
import { scoreDecision, classifyDecision, type DecisionDraft } from "@amase/ambiguity";
import { buildCachedSystem, type LlmClient } from "@amase/llm";
import type { UserQuestion } from "@amase/contracts";
import { findReusableDecision, type LoggedDecision } from "@amase/memory";
import { BaseAgent } from "./base-agent.js";

const QGEN_SYSTEM = `Generate exactly 3 distinct options to resolve the engineering decision.
Return JSON: {"question": "...", "options": [{"label":"...","detail":"..."},{...},{...}], "recommended": 0|1|2, "reason": "..."}`;

export async function generateQuestion(
  llm: LlmClient,
  d: DecisionDraft,
  runId: string,
): Promise<UserQuestion> {
  const res = await llm.call({
    system: buildCachedSystem([{ text: QGEN_SYSTEM }]),
    user: JSON.stringify(d),
    maxTokens: 400,
  });
  let parsed: {
    question: string;
    options: Array<{ label: string; detail: string }>;
    recommended: 0 | 1 | 2;
    reason: string;
  };
  try {
    const jsonMatch = res.text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch?.[1] ?? res.text;
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      question: d.summary || "Clarify decision",
      options: [
        { label: "Option A", detail: "" },
        { label: "Option B", detail: "" },
        { label: "Option C", detail: "" },
      ],
      recommended: 0,
      reason: d.summary,
    };
  }
  const opts = (parsed.options ?? []).slice(0, 3);
  while (opts.length < 3) {
    opts.push({ label: `Option ${String.fromCharCode(65 + opts.length)}`, detail: "" });
  }
  const rec = (parsed.recommended === 0 || parsed.recommended === 1 || parsed.recommended === 2)
    ? parsed.recommended
    : 0;
  return {
    questionId: randomUUID(),
    runId,
    question: parsed.question ?? (d.summary || "Clarify decision"),
    options: opts as [typeof opts[0], typeof opts[0], typeof opts[0]],
    recommended: rec,
    reason: parsed.reason ?? d.summary,
  };
}

export class ArchitectAgent extends BaseAgent {
  readonly kind = "architect" as const;
  readonly promptFile = "architect.md";

  async resolve(
    decisions: DecisionDraft[],
    runId: string,
    reuseLog?: LoggedDecision[],
  ): Promise<{ resolved: DecisionDraft[]; questions: UserQuestion[] }> {
    const questions: UserQuestion[] = [];
    const resolved: DecisionDraft[] = [];
    for (const d of decisions) {
      if (reuseLog) {
        const hit = findReusableDecision(reuseLog, d);
        if (hit) {
          resolved.push(d);
          continue;
        }
      }
      const r = scoreDecision(d);
      if (r.decision === "decide") {
        resolved.push(d);
        continue;
      }
      if (r.decision === "tier2") {
        const t2 = await classifyDecision(this.llm, d);
        if (t2 === "decide") {
          resolved.push(d);
          continue;
        }
      }
      questions.push(await generateQuestion(this.llm, d, runId));
    }
    return { resolved, questions };
  }
}
