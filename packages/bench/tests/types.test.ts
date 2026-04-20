import { describe, expect, it } from "vitest";
import { BenchResultSchema } from "../src/types.js";

describe("BenchResultSchema", () => {
  it("parses a valid result line", () => {
    const r = BenchResultSchema.parse({
      taskId: "add-zod-schema",
      stack: "amase",
      pass: true,
      tokensIn: 1000,
      tokensOut: 200,
      wallMs: 5000,
      diffSimilarity: 0.8,
      retries: 1,
      runId: "r1",
      timestamp: "2026-04-19T00:00:00Z",
    });
    expect(r.stack).toBe("amase");
  });

  it("rejects unknown stack", () => {
    expect(() =>
      BenchResultSchema.parse({
        taskId: "x",
        stack: "other",
        pass: false,
        tokensIn: 0,
        tokensOut: 0,
        wallMs: 0,
        diffSimilarity: 0,
        retries: 0,
        runId: "r1",
        timestamp: "2026-04-19T00:00:00Z",
      }),
    ).toThrow();
  });
});
