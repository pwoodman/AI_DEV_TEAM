import type { EventEmitter } from "node:events";
import { cpus } from "node:os";
import type { AgentKind, TaskNode } from "@amase/contracts";
import type { DAGStore } from "@amase/memory";

export type NodeExecutor = (node: TaskNode) => Promise<"completed" | "failed" | "skipped">;

export type PoolName = "agent" | "validator";

export interface SchedulerPools {
  agent: number;
  validator: number;
}

export interface SchedulerOptions {
  /** Unified cap. If set alongside `pools`, `pools` wins for per-pool caps and
   *  `concurrency` is ignored. Kept for backward compatibility. */
  concurrency?: number;
  /** Split concurrency caps. Agent-bound nodes (LLM calls) and validator-bound
   *  nodes (local CPU) compete for different resources and should not starve
   *  each other. Defaults: agent=4 (Anthropic rate limits), validator=max(2,cpus). */
  pools?: SchedulerPools;
  isBlocked?: (node: TaskNode) => boolean;
  blockedChanged?: EventEmitter;
}

interface InFlight {
  id: string;
  promise: Promise<void>;
  done: boolean;
}

const VALIDATOR_KINDS: ReadonlySet<AgentKind> = new Set<AgentKind>([
  "qa",
  "ui-test",
  "security",
  "deployment",
]);

export function classifyNode(node: TaskNode): PoolName {
  return VALIDATOR_KINDS.has(node.kind) ? "validator" : "agent";
}

export async function runScheduler(
  dagId: string,
  store: DAGStore,
  execute: NodeExecutor,
  concurrencyOrOpts: number | SchedulerOptions = 8,
): Promise<void> {
  const opts: SchedulerOptions =
    typeof concurrencyOrOpts === "number" ? { concurrency: concurrencyOrOpts } : concurrencyOrOpts;
  const pools: SchedulerPools = opts.pools ?? {
    agent: opts.concurrency ?? 4,
    validator: opts.concurrency ?? Math.max(2, cpus().length),
  };
  const isBlocked = opts.isBlocked;
  const blockedChanged = opts.blockedChanged;

  const inFlight: Record<PoolName, Map<string, InFlight>> = {
    agent: new Map(),
    validator: new Map(),
  };
  const allInFlight = (): InFlight[] => [
    ...inFlight.agent.values(),
    ...inFlight.validator.values(),
  ];
  const isAnywhereInFlight = (id: string): boolean =>
    inFlight.agent.has(id) || inFlight.validator.has(id);

  while (true) {
    const readyAll = store.readyNodes(dagId).filter((n) => !isAnywhereInFlight(n.id));
    const ready = isBlocked ? readyAll.filter((n) => !isBlocked(n)) : readyAll;
    const skippedBlocked = isBlocked ? readyAll.filter((n) => isBlocked(n)) : [];

    for (const node of ready) {
      const pool = classifyNode(node);
      if (inFlight[pool].size >= pools[pool]) continue;
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
      inFlight[pool].set(node.id, entry);
    }

    const flight = allInFlight();
    if (flight.length === 0) {
      const graph = store.get(dagId);
      if (!graph) return;
      const allTerminal = graph.nodes.every((n) =>
        ["completed", "failed", "skipped"].includes(n.status ?? ""),
      );
      if (allTerminal) return;

      if (skippedBlocked.length > 0 && blockedChanged) {
        await new Promise<void>((resolve) => {
          blockedChanged.once("change", () => resolve());
        });
        continue;
      }
      return;
    }

    await Promise.race(flight.map((e) => e.promise));
    for (const pool of ["agent", "validator"] as const) {
      for (const [id, entry] of inFlight[pool]) {
        if (entry.done) inFlight[pool].delete(id);
      }
    }
  }
}
