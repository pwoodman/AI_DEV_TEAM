import { BaseAgent } from "./base-agent.js";

export class RefactorAgent extends BaseAgent {
  readonly kind = "refactor" as const;
  readonly promptFile = "refactor.md";
}
