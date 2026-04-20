import { describe, expect, it } from "vitest";
import { runAmase } from "../../src/adapters/amase.js";
import { loadFixture } from "../../src/fixtures.js";

describe("amase adapter", () => {
  it("runs fix-failing-vitest to completion with stub LLM and reports a BenchResult", async () => {
    process.env.AMASE_LLM_STUB = "1";
    const fx = await loadFixture("fix-failing-vitest");
    const result = await runAmase(fx, { runId: "t1" });
    expect(result.stack).toBe("amase");
    expect(typeof result.wallMs).toBe("number");
    expect(result.wallMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.pass).toBe("boolean");
    expect(typeof result.tokensIn).toBe("number");
    expect(typeof result.tokensOut).toBe("number");
    expect(result.taskId).toBe("fix-failing-vitest");
    expect(result.runId).toBe("t1");
  }, 60_000);
});
