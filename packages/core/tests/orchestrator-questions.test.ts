import type { UserQuestion } from "@amase/contracts";
import { DAGStore, DecisionLog } from "@amase/memory";
import { describe, expect, it } from "vitest";
import { Orchestrator } from "../src/index.js";

function makeOrchestrator(): Orchestrator {
  return new Orchestrator({
    agents: {} as never,
    validators: [],
    store: new DAGStore(),
    makeDecisionLog: (p) => new DecisionLog(p),
  });
}

function sampleQuestion(runId: string, questionId: string): UserQuestion {
  return {
    runId,
    questionId,
    question: "Which approach?",
    options: [
      { label: "A", detail: "option A" },
      { label: "B", detail: "option B" },
      { label: "C", detail: "option C" },
    ],
    recommended: 0,
    reason: "because A is safer",
  };
}

describe("Orchestrator pause/resume", () => {
  it("enqueues, peeks, and clears on answer", async () => {
    const o = makeOrchestrator();
    o.enqueueQuestion(sampleQuestion("r1", "q1"));
    const peek = o.pendingQuestion("r1");
    expect(peek?.questionId).toBe("q1");
    // Peek again — still there (not dequeued)
    expect(o.pendingQuestion("r1")?.questionId).toBe("q1");

    await o.answerQuestion({ runId: "r1", questionId: "q1", choice: 0 });
    expect(o.pendingQuestion("r1")).toBeNull();
  });

  it("returns null when no pending questions", () => {
    const o = makeOrchestrator();
    expect(o.pendingQuestion("no-such-run")).toBeNull();
  });

  it("returns the first unanswered question across multiple enqueues", async () => {
    const o = makeOrchestrator();
    o.enqueueQuestion(sampleQuestion("r2", "qA"));
    o.enqueueQuestion(sampleQuestion("r2", "qB"));
    expect(o.pendingQuestion("r2")?.questionId).toBe("qA");
    await o.answerQuestion({ runId: "r2", questionId: "qA", choice: 1 });
    expect(o.pendingQuestion("r2")?.questionId).toBe("qB");
    await o.answerQuestion({ runId: "r2", questionId: "qB", choice: 2 });
    expect(o.pendingQuestion("r2")).toBeNull();
  });

  it("waitForAnswer resolves when answerQuestion is called", async () => {
    const o = makeOrchestrator();
    const waiting = o.waitForAnswer("r3", "q3");
    // Fire the answer after a microtask tick
    queueMicrotask(() => {
      void o.answerQuestion({ runId: "r3", questionId: "q3", choice: 1 });
    });
    const ans = await waiting;
    expect(ans.choice).toBe(1);
    expect(ans.questionId).toBe("q3");
  });

  it("waitForAnswer resolves immediately if already answered", async () => {
    const o = makeOrchestrator();
    await o.answerQuestion({ runId: "r4", questionId: "q4", choice: 2 });
    const ans = await o.waitForAnswer("r4", "q4");
    expect(ans.choice).toBe(2);
  });
});
