import type { AgentKind } from "@amase/contracts";
import type { LlmClient } from "@amase/llm";
import { ArchitectAgent } from "./architect.js";
import { BackendAgent } from "./backend.js";
import type { ASTIndexLike, BaseAgent } from "./base-agent.js";
import { DeploymentAgent } from "./deployment.js";
import { FrontendAgent } from "./frontend.js";
import { QaAgent } from "./qa.js";
import { RefactorAgent } from "./refactor.js";
import { SecurityAgent } from "./security.js";
import { TestGenAgent } from "./test-gen.js";
import { UiTestAgent } from "./ui-test.js";
import {
  buildSkillGuideCache,
  recordPatchQuality,
  recordSkillFailure,
  recordSkillSuccess,
  type QualityRecord,
} from "./shared/cache.js";

export {
  recordSkillFailure,
  recordSkillSuccess,
  recordPatchQuality,
};
export type { QualityRecord };

export function buildAgentRegistry(
  llm: LlmClient,
  astIndex?: ASTIndexLike,
): Record<AgentKind, BaseAgent> {
  // Warm caches in the background — non-blocking
  void buildSkillGuideCache();

  return {
    architect: new ArchitectAgent(llm, astIndex),
    backend: new BackendAgent(llm, astIndex),
    frontend: new FrontendAgent(llm, astIndex),
    refactor: new RefactorAgent(llm, astIndex),
    "test-gen": new TestGenAgent(llm, astIndex),
    qa: new QaAgent(llm, astIndex),
    "ui-test": new UiTestAgent(llm, astIndex),
    security: new SecurityAgent(llm, astIndex),
    deployment: new DeploymentAgent(llm, astIndex),
  };
}