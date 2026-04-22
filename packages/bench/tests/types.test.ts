import { describe, expect, it } from "vitest";
import { BenchResultSchema, HeadlineReportSchema } from "../src/types.js";

describe("BenchResult schema", () => {
  it("accepts extended fields", () => {
    const row = {
      runId: "r1",
      timestamp: "2026-04-21T00:00:00.000Z",
      taskId: "t1",
      stack: "amase",
      model: "claude-sonnet-4-6",
      runSeq: 1,
      pass: true,
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 20,
      validatorFailures: 0,
      wallMs: 1000,
      diffSimilarity: 0.5,
      retries: 0,
    };
    expect(BenchResultSchema.parse(row)).toEqual(row);
  });

  it("rejects negative tokensCached", () => {
    expect(() =>
      BenchResultSchema.parse({
        runId: "r1",
        timestamp: "x",
        taskId: "t",
        stack: "amase",
        model: "m",
        runSeq: 1,
        pass: false,
        tokensIn: 0,
        tokensOut: 0,
        tokensCached: -1,
        validatorFailures: 0,
        wallMs: 0,
        diffSimilarity: 0,
        retries: 0,
      }),
    ).toThrow();
  });
});

describe("HeadlineReport schema", () => {
  it("accepts a well-formed report", () => {
    HeadlineReportSchema.parse({
      fairness: "primary",
      samplesPerCell: 3,
      tasks: 13,
      bothPassedAll: 13,
      wallMs: {
        amase: { mean: 1000, stdev: 50 },
        superpowers: { mean: 2000, stdev: 100 },
        delta: 0.5,
        ci95: [0.3, 0.7],
        pValue: 0.001,
      },
      tokens: {
        amase: { mean: 500, stdev: 10 },
        superpowers: { mean: 1000, stdev: 20 },
        delta: 0.5,
        ci95: [0.3, 0.7],
        pValue: 0.001,
      },
      passRate: { amase: 1, superpowers: 1 },
      verdict: "ok",
    });
  });
});
