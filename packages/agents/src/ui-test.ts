import { BaseAgent } from "./base-agent.js";

export class UiTestAgent extends BaseAgent {
  readonly kind = "ui-test" as const;
  readonly promptFile = "ui-test.md";
}
