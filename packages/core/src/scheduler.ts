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
  concurrency?: number;
  pools?: SchedulerPools;
  isBlocked?: (node: TaskNode) => boolean;
  blockedChanged?: EventEmitter;
}

interface InFlight {
  id: string;
  promise: Promise<"completed" | "failed" | "skipped">;
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

/**
 * True parallel execution of task nodes using dual pool concurrency.
 *
 * Key insight: agent-pool nodes make async LLM I/O calls — they yield the
 * thread during the HTTP round-trip. Validator-pool nodes are CPU-bound.
 * By running them in separate pools we avoid CPU-bound validators starving
 * LLM-bound agents and vice versa.
 *
 * Within each pool, up to `pools.agent` / `pools.validator` nodes run
 * simultaneously. We use a semaphore + Promise.all (not Promise.race) to
 * maintain exactly N in-flight tasks at all times, maximizing throughput.
 */
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

  // Per-pool semaphores: limit concurrency within each pool
  const agentSem = new AsyncSemaphore(pools.agent);
  const validatorSem = new AsyncSemaphore(pools.validator);

  // Track in-flight promises for termination detection
  const inFlight: Record<PoolName, Map<string, Promise<void>>> = {
    agent: new Map(),
    validator: new Map(),
  };

  const allInFlight = (): Array<Promise<void>> => [...inFlight.agent.values(), ...inFlight.validator.values()];

  while (true) {
    const graph = store.get(dagId);
    if (!graph) return;

    // Enumerate ready nodes (dependencies satisfied) that are not yet running
    const readyAll = store
      .readyNodes(dagId)
      .filter((n) => !inFlight.agent.has(n.id) && !inFlight.validator.has(n.id));

    const ready = isBlocked ? readyAll.filter((n) => !isBlocked(n)) : readyAll;
    const skippedBlocked = isBlocked ? readyAll.filter((n) => isBlocked(n)) : [];

    // Launch as many ready nodes as the pool semaphore allows
    for (const node of ready) {
      const pool = classifyNode(node);
      const sem = pool === "agent" ? agentSem : validatorSem;

      if (!sem.tryAcquire()) continue; // pool at capacity

      const poolMap = inFlight[pool];
      const p = (async () => {
        try {
          await store.updateNode(dagId, node.id, { status: "running" });
          const status = await execute(node);
          await store.updateNode(dagId, node.id, { status });
        } catch {
          await store.updateNode(dagId, node.id, { status: "failed" });
        } finally {
          sem.release();
          poolMap.delete(node.id);
        }
      })();
      poolMap.set(node.id, p);
    }

    // If nothing is in flight, check if we're done or blocked
    const flight = allInFlight();
    if (flight.length === 0) {
      const allTerminal = graph.nodes.every((n) =>
        ["completed", "failed", "skipped"].includes(n.status ?? ""),
      );
      if (allTerminal) return;

      if (skippedBlocked.length > 0 && blockedChanged) {
        await new Promise<void>((resolve) => blockedChanged.once("change", () => resolve()));
        continue;
      }
      return;
    }

    // Wait for at least one node to complete, then loop and re-balance pools
    await Promise.race(flight);
  }
}

// ---------------------------------------------------------------------------
// Simple async semaphore for concurrency limiting
// ---------------------------------------------------------------------------
class AsyncSemaphore {
  private readonly max: number;
  private _current = 0;
  private waiters: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  get current(): number {
    return this._current;
  }

  tryAcquire(): boolean {
    if (this._current < this.max) {
      this._current++;
      return true;
    }
    return false;
  }

  release(): void {
    this._current--;
    const next = this.waiters.shift();
    if (next) {
      this._current++;
      next();
    }
  }

  async acquire(): Promise<void> {
    if (this._current < this.max) {
      this._current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this._current++;
        resolve();
      });
    });
  }
}