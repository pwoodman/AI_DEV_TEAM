import type { LlmClient } from "@amase/llm";
import { buildCachedSystem } from "@amase/llm";
import type { DecisionDraft } from "./types.js";

const SYSTEM = `You classify whether an engineering decision needs user input. Return JSON {"decision": "ask" | "decide"} only.`;

export async function classifyDecision(llm: LlmClient, d: DecisionDraft): Promise<"ask" | "decide"> {
  const res = await llm.call({
    system: buildCachedSystem([{ text: SYSTEM }]),
    user: JSON.stringify(d),
    maxTokens: 30,
  });
  const m = res.text.match(/"decision"\s*:\s*"(ask|decide)"/);
  return (m?.[1] as "ask" | "decide") ?? "decide";
}
