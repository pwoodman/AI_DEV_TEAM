import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type TaskGraph, TaskGraphSchema, type TaskNode } from "@amase/contracts";

export class DAGStore {
  private graphs = new Map<string, TaskGraph>();
  private snapshotPaths = new Map<string, string>();

  async put(graph: TaskGraph, snapshotPath: string): Promise<void> {
    const validated = TaskGraphSchema.parse(graph);
    this.graphs.set(validated.dagId, validated);
    this.snapshotPaths.set(validated.dagId, snapshotPath);
    await this.snapshot(validated.dagId);
  }

  get(dagId: string): TaskGraph | undefined {
    return this.graphs.get(dagId);
  }

  async updateNode(dagId: string, nodeId: string, patch: Partial<TaskNode>): Promise<void> {
    const graph = this.graphs.get(dagId);
    if (!graph) throw new Error(`unknown dagId: ${dagId}`);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`unknown node: ${nodeId}`);
    Object.assign(node, patch);
    await this.snapshot(dagId);
  }

  readyNodes(dagId: string): TaskNode[] {
    const graph = this.graphs.get(dagId);
    if (!graph) return [];
    const completed = new Set(
      graph.nodes
        .filter((n) => n.status === "completed" || n.status === "skipped")
        .map((n) => n.id),
    );
    return graph.nodes.filter(
      (n) =>
        (n.status === undefined || n.status === "pending" || n.status === "ready") &&
        (n.dependsOn ?? []).every((d) => completed.has(d)),
    );
  }

  private async snapshot(dagId: string): Promise<void> {
    const path = this.snapshotPaths.get(dagId);
    const graph = this.graphs.get(dagId);
    if (!path || !graph) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(graph, null, 2), "utf8");
  }
}
