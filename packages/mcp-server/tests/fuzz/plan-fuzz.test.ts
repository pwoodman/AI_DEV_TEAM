import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type McpClient, callTool, spawnMcp } from "../contract-helpers.js";

// Property-based fuzz: random plan requests must always produce a well-formed
// DAG — every dep resolves, retries bounded, no cycles, unique ids.
// Gated behind AMASE_FUZZ=1 so it is only run by the nightly `pnpm test:fuzz`
// script, not on per-PR `pnpm test`.
const shouldRun = process.env.AMASE_FUZZ === "1";
const describeIf = shouldRun ? describe : describe.skip;
const NUM_RUNS = Number.parseInt(process.env.AMASE_FUZZ_RUNS ?? "100", 10);

describeIf("amase_plan fuzz", () => {
  let client: McpClient;
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "amase-fuzz-"));
    client = await spawnMcp();
  }, 60_000);

  afterAll(() => {
    client?.close();
  });

  it(`DAG invariants hold for ${NUM_RUNS} random requests`, async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 5, maxLength: 200 }), async (req) => {
        const res = await callTool<{
          dagId: string;
          nodes: Array<{ id: string; dependsOn: string[]; retries?: number }>;
        }>(client, "amase_plan", { request: req, workspacePath: workspace });

        const ids = new Set<string>();
        for (const n of res.nodes) {
          expect(ids.has(n.id)).toBe(false); // unique
          ids.add(n.id);
        }
        for (const n of res.nodes) {
          for (const dep of n.dependsOn) expect(ids.has(dep)).toBe(true);
          expect(n.retries ?? 0).toBeLessThanOrEqual(2);
        }
        // acyclic check via topo sort
        const indeg = new Map<string, number>();
        for (const n of res.nodes) indeg.set(n.id, n.dependsOn.length);
        const queue: string[] = [];
        for (const [id, d] of indeg) if (d === 0) queue.push(id);
        let visited = 0;
        const byId = new Map(res.nodes.map((n) => [n.id, n]));
        const dependents = new Map<string, string[]>();
        for (const n of res.nodes)
          for (const d of n.dependsOn) {
            if (!dependents.has(d)) dependents.set(d, []);
            dependents.get(d)?.push(n.id);
          }
        while (queue.length > 0) {
          const id = queue.shift() as string;
          visited++;
          for (const child of dependents.get(id) ?? []) {
            const next = (indeg.get(child) ?? 0) - 1;
            indeg.set(child, next);
            if (next === 0) queue.push(child);
          }
        }
        expect(visited).toBe(byId.size);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 300_000);
});
