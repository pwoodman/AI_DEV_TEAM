import { BaseAgent } from "./base-agent.js";

export class BackendAgent extends BaseAgent {
  readonly kind = "backend" as const;
  readonly promptFile = "backend.md";
}
