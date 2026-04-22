import { type DecisionDraft, DecisionDraftSchema } from "@amase/ambiguity";
import { StubLlmClient } from "@amase/llm";
import { describe, expect, it } from "vitest";
import { ArchitectAgent, generateQuestion } from "../src/architect.js";

function draft(partial: Partial<DecisionDraft> = {}): DecisionDraft {
  return DecisionDraftSchema.parse({
    kind: "logic",
    summary: "sum",
    touchedPaths: [],
    fileCount: 0,
    ...partial,
  });
}

describe("generateQuestion", () => {
  it("falls back to 3 filler options on garbage LLM response", async () => {
    const llm = new StubLlmClient(() => "not json at all");
    const q = await generateQuestion(llm, draft({ summary: "pick thing" }), "run-1");
    expect(q.options).toHaveLength(3);
    expect(q.runId).toBe("run-1");
    expect(q.question).toBeTruthy();
  });

  it("parses valid JSON response", async () => {
    const payload = JSON.stringify({
      question: "Which approach?",
      options: [
        { label: "A", detail: "alpha" },
        { label: "B", detail: "beta" },
        { label: "C", detail: "gamma" },
      ],
      recommended: 1,
      reason: "because",
    });
    const llm = new StubLlmClient(() => payload);
    const q = await generateQuestion(llm, draft(), "run-2");
    expect(q.question).toBe("Which approach?");
    expect(q.options[0].label).toBe("A");
    expect(q.options[1].label).toBe("B");
    expect(q.options[2].label).toBe("C");
    expect(q.recommended).toBe(1);
    expect(q.reason).toBe("because");
  });
});

describe("ArchitectAgent.resolve", () => {
  it("classifies 3 decisions (decide / tier2->decide / ask)", async () => {
    // Decisions:
    //   d1: nothing -> score 0 -> decide (no LLM call)
    //   d2: publicApi only -> tier2 -> classify "decide"
    //   d3: publicApi + dataModel -> ask (score 2) -> LLM call for generateQuestion
    const d1 = draft();
    const d2 = draft({ changesPublicApi: true });
    const d3 = draft({ changesPublicApi: true, changesDataModel: true });

    let call = 0;
    const llm = new StubLlmClient(() => {
      call += 1;
      // first call: classifier for d2 returns decide
      if (call === 1) return '{"decision":"decide"}';
      // second call: generateQuestion for d3
      return JSON.stringify({
        question: "q?",
        options: [
          { label: "a", detail: "" },
          { label: "b", detail: "" },
          { label: "c", detail: "" },
        ],
        recommended: 0,
        reason: "r",
      });
    });

    const arch = new ArchitectAgent(llm);
    const { resolved, questions } = await arch.resolve([d1, d2, d3], "run-xyz");
    expect(resolved).toHaveLength(2);
    expect(questions).toHaveLength(1);
    expect(questions[0].runId).toBe("run-xyz");
  });
});
