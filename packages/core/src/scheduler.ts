import type { TaskNode } from "@amase/contracts";
import type { DAGStore } from "@amase/memory";

export type NodeExecutor = (node: TaskNode) => Promise<"completed" | "failed" | "skipped">;

interface InFlight {
  id: string;
  promise: Promise<void>;
  done: boolean;
}

export async function runScheduler(
  dagId: string,
  store: DAGStore,
  execute: NodeExecutor,
  concurrency = 8,
): Promise<void> {
  const inFlight = new Map<string, InFlight>();

  while (true) {
    const ready = store.readyNodes(dagId).filter((n) => !inFlight.has(n.id));
    for (const node of ready) {
      if (inFlight.size >= concurrency) break;
      const entry: InFlight = {
        id: node.id,
        done: false,
        promise: (async () => {
          await store.updateNode(dagId, node.id, { status: "running" });
          try {
            const status = await execute(node);
            await store.updateNode(dagId, node.id, { status });
          } catch {
            await store.updateNode(dagId, node.id, { status: "failed" });
          }
        })().finally(() => {
          entry.done = true;
        }),
      };
      inFlight.set(node.id, entry);
    }

    if (inFlight.size === 0) {
      const graph = store.get(dagId);
      const allTerminal = graph?.nodes.every((n) =>
        ["completed", "failed", "skipped"].includes(n.status ?? ""),
      );
      if (allTerminal || !graph) return;
      // No ready nodes and nothing in flight: remaining nodes are blocked by failed deps.
      return;
    }

    await Promise.race(Array.from(inFlight.values()).map((e) => e.promise));
    for (const [id, entry] of inFlight) {
      if (entry.done) inFlight.delete(id);
    }
  }
}
