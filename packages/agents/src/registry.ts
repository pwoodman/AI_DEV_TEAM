import type { AgentKind } from "@amase/contracts";
import type { LlmClient } from "@amase/llm";
import { ArchitectAgent } from "./architect.js";
import { BackendAgent } from "./backend.js";
import type { BaseAgent } from "./base-agent.js";
import { DeploymentAgent } from "./deployment.js";
import { FrontendAgent } from "./frontend.js";
import { QaAgent } from "./qa.js";
import { RefactorAgent } from "./refactor.js";
import { SecurityAgent } from "./security.js";
import { TestGenAgent } from "./test-gen.js";
import { UiTestAgent } from "./ui-test.js";

export function buildAgentRegistry(llm: LlmClient): Record<AgentKind, BaseAgent> {
  return {
    architect: new ArchitectAgent(llm),
    backend: new BackendAgent(llm),
    frontend: new FrontendAgent(llm),
    refactor: new RefactorAgent(llm),
    "test-gen": new TestGenAgent(llm),
    qa: new QaAgent(llm),
    "ui-test": new UiTestAgent(llm),
    security: new SecurityAgent(llm),
    deployment: new DeploymentAgent(llm),
  };
}
