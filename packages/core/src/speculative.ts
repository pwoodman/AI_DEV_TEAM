import type { TaskNode } from "@amase/contracts";

/**
 * Returns true if the given node, or any of its transitive dependencies,
 * carries a `decisionId` that is currently in the `blockedDecisions` set.
 *
 * Used by the scheduler to skip speculative execution of nodes whose
 * existence/shape depends on an unanswered user question, while still
 * letting unblocked siblings proceed in parallel.
 */
export function isBlockedByQuestion(
  node: TaskNode,
  blockedDecisions: Set<string>,
  nodesById: Map<string, TaskNode>,
): boolean {
  if (blockedDecisions.size === 0) return false;
  const visited = new Set<string>();
  const stack: TaskNode[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (visited.has(n.id)) continue;
    visited.add(n.id);
    if (n.decisionId && blockedDecisions.has(n.decisionId)) return true;
    for (const depId of n.dependsOn ?? []) {
      const dep = nodesById.get(depId);
      if (dep) stack.push(dep);
    }
  }
  return false;
}
