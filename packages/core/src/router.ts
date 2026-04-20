import type { AgentKind, TaskNode } from "@amase/contracts";

export interface RouterOptions {
  skipFrontend?: boolean;
  skipBackend?: boolean;
  refactorOnly?: boolean;
}

export function routeNode(node: TaskNode, opts: RouterOptions = {}): AgentKind | "skip" {
  if (opts.refactorOnly && node.kind !== "refactor" && node.kind !== "qa") return "skip";
  if (opts.skipFrontend && (node.kind === "frontend" || node.kind === "ui-test")) return "skip";
  if (opts.skipBackend && node.kind === "backend") return "skip";
  return node.kind;
}
