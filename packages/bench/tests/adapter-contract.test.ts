import { describe, expect, it } from "vitest";
import { runAmase } from "../src/adapters/amase.js";
import { loadFixture } from "../src/fixtures.js";
import { BenchResultSchema } from "../src/types.js";

describe("adapter contract", () => {
  it("amase adapter (stub mode) returns a schema-valid BenchResult", async () => {
    const fx = await loadFixture("add-cli-flag");
    const r = await runAmase(fx, {
      runId: "test",
      runSeq: 1,
      model: "stub",
      fairness: "primary",
      live: false,
    });
    expect(() => BenchResultSchema.parse(r)).not.toThrow();
    expect(r.stack).toBe("amase");
    expect(r.runSeq).toBe(1);
  }, 60_000);
});
