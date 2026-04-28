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
  frontend:  8_000,
  backend:  16_000,
  refactor: 28_000,
  qa:        8_000,
  "ui-test": 8_000,
};

const ALLOWED_VALIDATORS_A: Partial<Record<AgentKind, ValidatorName[]>> = {
  frontend:  ["schema", "patch-safety", "lang-adapter"],
  backend:   ["schema", "patch-safety", "lang-adapter", "security"],
  refactor:  ["schema", "patch-safety", "lang-adapter"],
  qa:        ["schema", "patch-safety"],
  "ui-test": ["schema", "patch-safety", "ui-tests"],
};

const TOKEN_BUDGET_C: Partial<Record<AgentKind, number>> = {
  frontend:   600,
  backend:   1_000,
  refactor:  1_800,
  qa:         600,
  "ui-test":  600,
};

const ALL_VALIDATORS: ValidatorName[] = [
  "schema", "patch-safety", "lang-adapter", "ui-tests", "security",
];

function validatorsForNode(agent: AgentKind, language: string | undefined): ValidatorName[] {
  const base = ALLOWED_VALIDATORS_A[agent] ?? ["schema", "patch-safety", "lang-adapter"];
  const lang = language ?? "";
  if (!["typescript", "javascript"].includes(lang)) {
    return base.filter((v) => v !== "ui-tests");
  }
  return base;
}

export function routeNodeWithMode(node: TaskNode, opts: RouterOptions, mode: string): RouteResult {
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

  if (mode === "baseline") {
    return { agent, contextBudget: 16_000, allowedValidators: [...ALL_VALIDATORS] };
  }

  if (mode === "option-a" || mode === "option-b") {
    return {
      agent,
      contextBudget: CONTEXT_BUDGET_A[agent] ?? 16_000,
      allowedValidators: validatorsForNode(agent, node.language),
    };
  }

  if (mode === "option-c") {
    const tokenBudget = TOKEN_BUDGET_C[agent] ?? 1_000;
    return {
      agent,
      contextBudget: tokenBudget * 4,
      allowedValidators: validatorsForNode(agent, node.language),
    };
  }

  // Default fallback (unknown mode acts like baseline)
  return { agent, contextBudget: 16_000, allowedValidators: [...ALL_VALIDATORS] };
}

export function routeNode(node: TaskNode, opts: RouterOptions = {}): RouteResult {
  return routeNodeWithMode(node, opts, process.env.AMASE_ROUTER_MODE ?? "baseline");
}
