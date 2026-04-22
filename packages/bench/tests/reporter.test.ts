import { describe, expect, it } from "vitest";
import { reportHeadline } from "../src/reporter.js";
import type { BenchResult } from "../src/types.js";

const base: Omit<BenchResult, "stack" | "pass" | "tokensIn" | "wallMs"> = {
  runId: "r",
  timestamp: "t",
  taskId: "x",
  tokensOut: 0,
  diffSimilarity: 1,
  retries: 0,
};

describe("reportHeadline", () => {
  it("marks insufficient signal when < 5 both-passed tasks", () => {
    const results: BenchResult[] = [
      { ...base, taskId: "t1", stack: "amase", pass: true, tokensIn: 100, wallMs: 1000 },
      { ...base, taskId: "t1", stack: "superpowers", pass: true, tokensIn: 200, wallMs: 2000 },
    ];
    expect(reportHeadline(results).status).toBe("insufficient_signal");
  });

  it("computes pass-gated deltas with ≥5 both-passed", () => {
    const rs: BenchResult[] = [];
    for (let i = 0; i < 5; i++) {
      rs.push({ ...base, taskId: `t${i}`, stack: "amase", pass: true, tokensIn: 70, wallMs: 700 });
      rs.push({
        ...base,
        taskId: `t${i}`,
        stack: "superpowers",
        pass: true,
        tokensIn: 100,
        wallMs: 1000,
      });
    }
    const h = reportHeadline(rs);
    expect(h.status).toBe("ok");
    if (h.status === "ok") {
      expect(h.tokenDelta).toBeCloseTo(0.3, 2);
      expect(h.timeDelta).toBeCloseTo(0.3, 2);
      expect(h.passRateDelta).toBe(0);
    }
  });

  it("flags regression when AMASE pass rate is lower", () => {
    const rs: BenchResult[] = [];
    for (let i = 0; i < 5; i++) {
      rs.push({ ...base, taskId: `t${i}`, stack: "amase", pass: i > 0, tokensIn: 70, wallMs: 700 });
      rs.push({
        ...base,
        taskId: `t${i}`,
        stack: "superpowers",
        pass: true,
        tokensIn: 100,
        wallMs: 1000,
      });
    }
    expect(reportHeadline(rs).status).toBe("regression");
  });
});
