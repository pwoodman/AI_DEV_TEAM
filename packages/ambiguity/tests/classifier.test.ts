import { StubLlmClient } from "@amase/llm";
import { describe, expect, it } from "vitest";
import { classifyDecision } from "../src/classifier.js";
import { type DecisionDraft, DecisionDraftSchema } from "../src/types.js";

const draft: DecisionDraft = DecisionDraftSchema.parse({
  kind: "logic",
  summary: "test",
  touchedPaths: [],
  fileCount: 0,
});

describe("classifyDecision", () => {
  it("returns 'ask' when stub returns ask JSON", async () => {
    const llm = new StubLlmClient(() => '{"decision":"ask"}');
    const r = await classifyDecision(llm, draft);
    expect(r).toBe("ask");
  });

  it("falls back to 'decide' on unparseable response", async () => {
    const llm = new StubLlmClient(() => "not valid json blargh");
    const r = await classifyDecision(llm, draft);
    expect(r).toBe("decide");
  });
});
