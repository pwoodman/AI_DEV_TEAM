import { BaseAgent } from "./base-agent.js";

export class QaAgent extends BaseAgent {
  readonly kind = "qa" as const;
  readonly promptFile = "qa.md";
}
