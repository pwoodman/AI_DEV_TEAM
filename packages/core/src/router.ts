import type { AgentKind, TaskNode, ValidatorName } from "@amase/contracts";

export interface RouterOptions {
  skipFrontend?: boolean;
  skipBackend?: boolean;
  refactorOnly?: boolean;
}

export interface RouteResult {
  agent: AgentKind | "skip";
  contextBudget: number;
  allowedValidators: ValidatorName[];
}

const CONTEXT_BUDGET_A: Partial<Record<AgentKind, number>> = {
  frontend:   8_000,
  backend:   16_000,
  refactor:  28_000,
  qa:         8_000,
  "ui-test":  8_000,
  // These kinds are handled by the orchestrator's own routing; safe defaults:
  "test-gen":   16_000,
  security:     16_000,
  deployment:   16_000,
  architect:    16_000,
};

const ALLOWED_VALIDATORS_A: Partial<Record<AgentKind, ValidatorName[]>> = {
  frontend:   ["schema", "patch-safety", "lang-adapter", "ui-tests"],
  backend:    ["schema", "patch-safety", "lang-adapter", "security"],
  refactor:   ["schema", "patch-safety", "lang-adapter"],
  qa:         ["schema", "patch-safety"],
  "ui-test":  ["schema", "patch-safety", "ui-tests"],
  "test-gen": ["schema", "patch-safety", "lang-adapter"],
  security:   ["schema", "patch-safety", "lang-adapter", "security"],
  deployment: ["schema", "patch-safety"],
  architect:  [],
};

function validatorsForNode(agent: AgentKind, language: string | undefined): ValidatorName[] {
  const base = ALLOWED_VALIDATORS_A[agent] ?? ["schema", "patch-safety", "lang-adapter"];
  if (!["typescript", "javascript"].includes(language ?? "")) {
    return base.filter((v) => v !== "ui-tests");
  }
  return base;
}

export function routeNode(node: TaskNode, opts: RouterOptions = {}): RouteResult {
  let agent: AgentKind | "skip";
  if (opts.refactorOnly && node.kind !== "refactor" && node.kind !== "qa") {
    agent = "skip";
  } else if (opts.skipFrontend && (node.kind === "frontend" || node.kind === "ui-test")) {
    agent = "skip";
  } else if (opts.skipBackend && node.kind === "backend") {
    agent = "skip";
  } else {
    agent = node.kind;
  }

  if (agent === "skip") {
    return { agent: "skip", contextBudget: 0, allowedValidators: [] };
  }

  return {
    agent,
    contextBudget: CONTEXT_BUDGET_A[agent] ?? 16_000,
    allowedValidators: validatorsForNode(agent, node.language),
  };
}
