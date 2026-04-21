import { EventEmitter } from "node:events";
import type { TaskNode } from "@amase/contracts";
import type { DAGStore } from "@amase/memory";

export type NodeExecutor = (node: TaskNode) => Promise<"completed" | "failed" | "skipped">;

export interface SchedulerOptions {
  concurrency?: number;
  /** Optional predicate that returns true if `node` is currently blocked by an
   *  unanswered decision. Blocked nodes are skipped from the ready set (not failed)
   *  and picked up again once `blockedChanged` signals a state change. */
  isBlocked?: (node: TaskNode) => boolean;
  /** Event emitter that the orchestrator nudges (`emit("change")`) when the
   *  underlying blocked-decisions state changes (e.g. after answering a question). */
  blockedChanged?: EventEmitter;
}

interface InFlight {
  id: string;
  promise: Promise<void>;
  done: boolean;
}

export async function runScheduler(
  dagId: string,
  store: DAGStore,
  execute: NodeExecutor,
  concurrencyOrOpts: number | SchedulerOptions = 8,
): Promise<void> {
  const opts: SchedulerOptions =
    typeof concurrencyOrOpts === "number"
      ? { concurrency: concurrencyOrOpts }
      : concurrencyOrOpts;
  const concurrency = opts.concurrency ?? 8;
  const isBlocked = opts.isBlocked;
  const blockedChanged = opts.blockedChanged;

  const inFlight = new Map<string, InFlight>();

  while (true) {
    const readyAll = store.readyNodes(dagId).filter((n) => !inFlight.has(n.id));
    const ready = isBlocked ? readyAll.filter((n) => !isBlocked(n)) : readyAll;
    const skippedBlocked = isBlocked ? readyAll.filter((n) => isBlocked(n)) : [];

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
      if (!graph) return;
      const allTerminal = graph.nodes.every((n) =>
        ["completed", "failed", "skipped"].includes(n.status ?? ""),
      );
      if (allTerminal) return;

      // If there are nodes that are ready-except-blocked, wait for a blocked-state change
      // and re-poll. Otherwise remaining nodes are blocked by failed deps — terminate.
      if (skippedBlocked.length > 0 && blockedChanged) {
        await new Promise<void>((resolve) => {
          blockedChanged.once("change", () => resolve());
        });
        continue;
      }
      return;
    }

    await Promise.race(Array.from(inFlight.values()).map((e) => e.promise));
    for (const [id, entry] of inFlight) {
      if (entry.done) inFlight.delete(id);
    }
  }
}
