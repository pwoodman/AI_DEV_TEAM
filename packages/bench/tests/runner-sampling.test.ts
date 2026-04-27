import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as amaseMod from "../src/adapters/amase.js";
import * as spMod from "../src/adapters/superpowers.js";
import { runBench } from "../src/runner.js";
import type { BenchResult, RunOpts } from "../src/types.js";

function fakeResult(taskId: string, stack: "amase" | "superpowers", opts: RunOpts): BenchResult {
  return {
    runId: opts.runId,
    timestamp: "2026-04-21T00:00:00.000Z",
    taskId,
    stack,
    model: opts.model,
    runSeq: opts.runSeq,
    pass: true,
    tokensIn: 10,
    tokensOut: 5,
    tokensCached: 0,
    validatorFailures: 0,
    wallMs: 100,
    diffSimilarity: 0.5,
    retries: 0,
  };
}

describe("runBench sampling", () => {
  it("runs N=3 per (task, stack) when samples=3", async () => {
    // Use an isolated temp cache dir so real cached results don't interfere
    const cacheDir = join(tmpdir(), `amase-test-cache-${Date.now()}`);

    const amaseSpy = vi
      .spyOn(amaseMod, "runAmase")
      .mockImplementation((fx, o) => Promise.resolve(fakeResult(fx.id, "amase", o)));
    const spSpy = vi
      .spyOn(spMod, "runSuperpowers")
      .mockImplementation((fx, o) => Promise.resolve(fakeResult(fx.id, "superpowers", o)));
    const results = await runBench({
      stacks: ["amase", "superpowers"],
      tasks: ["add-cli-flag"],
      samples: 3,
      model: "claude-sonnet-4-6",
      fairness: "primary",
      outDir: undefined,
      cacheDir,
    });
    expect(results).toHaveLength(6); // 1 task × 2 stacks × 3 samples
    expect(results.map((r) => r.runSeq).sort()).toEqual([1, 1, 2, 2, 3, 3]);
    expect(amaseSpy).toHaveBeenCalledTimes(3);
    expect(spSpy).toHaveBeenCalledTimes(3);
  });
});
