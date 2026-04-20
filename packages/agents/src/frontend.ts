import { BaseAgent } from "./base-agent.js";

export class FrontendAgent extends BaseAgent {
  readonly kind = "frontend" as const;
  readonly promptFile = "frontend.md";
}
