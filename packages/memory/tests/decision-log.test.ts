import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DecisionLog } from "../src/index.js";

async function tempLog() {
  const dir = await mkdtemp(join(tmpdir(), "dlog-"));
  return new DecisionLog(join(dir, "decisions.jsonl"));
}

describe("DecisionLog", () => {
  it("appends and reads back entries", async () => {
    const log = await tempLog();
    await log.append({
      ts: new Date().toISOString(),
      dagId: "d",
      runId: "r",
      nodeId: "n",
      event: "node.started",
      data: { foo: 1 },
    });
    const all = await log.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.event).toBe("node.started");
    expect(all[0]?.data.foo).toBe(1);
  });

  it("tail returns last N entries", async () => {
    const log = await tempLog();
    for (let i = 0; i < 5; i++) {
      await log.append({
        ts: new Date().toISOString(),
        dagId: "d",
        runId: "r",
        nodeId: `n${i}`,
        event: "node.completed",
      });
    }
    const tail = await log.tail(2);
    expect(tail.map((e) => e.nodeId)).toEqual(["n3", "n4"]);
  });

  it("readAll on missing file returns []", async () => {
    const log = new DecisionLog(join(tmpdir(), `missing-${Date.now()}.jsonl`));
    expect(await log.readAll()).toEqual([]);
  });

  it("rejects invalid entries at append time", async () => {
    const log = await tempLog();
    await expect(
      log.append({
        ts: "not-iso",
        dagId: "d",
        runId: "r",
        nodeId: "n",
        event: "node.started",
      } as never),
    ).rejects.toThrow();
  });
});
