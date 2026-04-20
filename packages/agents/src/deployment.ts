import { BaseAgent } from "./base-agent.js";

export class DeploymentAgent extends BaseAgent {
  readonly kind = "deployment" as const;
  readonly promptFile = "deployment.md";
}
