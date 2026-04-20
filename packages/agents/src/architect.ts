import { BaseAgent } from "./base-agent.js";

export class ArchitectAgent extends BaseAgent {
  readonly kind = "architect" as const;
  readonly promptFile = "architect.md";
}
