import { describe, expect, it } from "vitest";
import { reportHeadline } from "../src/reporter.js";
import type { BenchResult } from "../src/types.js";

function row(overrides: Partial<BenchResult>): BenchResult {
  return {
    runId: "r1",
    timestamp: "2026-04-21T00:00:00.000Z",
    taskId: "t1",
    stack: "amase",
    model: "claude-sonnet-4-6",
    runSeq: 1,
    pass: true,
    tokensIn: 100,
    tokensOut: 50,
    tokensCached: 0,
    validatorFailures: 0,
    wallMs: 1000,
    diffSimilarity: 0,
    retries: 0,
    ...overrides,
  };
}

describe("reportHeadline", () => {
  it("returns verdict=ok and positive deltas when AMASE is faster + cheaper", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e", "f", "g"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, wallMs: 1000, tokensIn: 500, tokensOut: 200 }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, wallMs: 2000, tokensIn: 1200, tokensOut: 500 }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("ok");
    expect(h.wallMs.delta).toBeGreaterThan(0.4); // ~50% faster
    expect(h.tokens.delta).toBeGreaterThan(0.4);  // ~58% fewer tokens
  });

  it("returns regression when AMASE fails tasks", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, pass: false }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, pass: true }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("regression");
  });

  it("returns insufficient_signal when fewer than 5 tasks fully green", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("insufficient_signal");
  });

  it("returns fail_targets when deltas are below 30%", () => {
    const rows: BenchResult[] = [];
    for (const taskId of ["a", "b", "c", "d", "e", "f", "g"]) {
      for (const seq of [1, 2, 3]) {
        rows.push(row({ taskId, stack: "amase", runSeq: seq, wallMs: 900, tokensIn: 900, tokensOut: 400 }));
        rows.push(row({ taskId, stack: "superpowers", runSeq: seq, wallMs: 1000, tokensIn: 1000, tokensOut: 450 }));
      }
    }
    const h = reportHeadline(rows, { fairness: "primary", samplesPerCell: 3 });
    expect(h.verdict).toBe("fail_targets");
  });
});
