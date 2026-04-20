import { BaseAgent } from "./base-agent.js";

export class SecurityAgent extends BaseAgent {
  readonly kind = "security" as const;
  readonly promptFile = "security.md";
}
