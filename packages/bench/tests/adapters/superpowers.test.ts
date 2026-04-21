import { describe, expect, it } from "vitest";
import { runSuperpowers } from "../../src/adapters/superpowers.js";
import { loadFixture } from "../../src/fixtures.js";

const hasCli = process.env.CLAUDE_CLI_AVAILABLE === "1";

describe.skipIf(!hasCli)("superpowers adapter", () => {
  it("runs fix-failing-vitest via claude CLI and records tokens", async () => {
    const fx = await loadFixture("fix-failing-vitest");
    const result = await runSuperpowers(fx, { runId: "t1" });
    expect(result.stack).toBe("superpowers");
    expect(result.wallMs).toBeGreaterThan(0);
  });
});
