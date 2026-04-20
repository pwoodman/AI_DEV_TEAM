import { BaseAgent } from "./base-agent.js";

export class TestGenAgent extends BaseAgent {
  readonly kind = "test-gen" as const;
  readonly promptFile = "test-gen.md";
}
