export * from "./chain.js";
export * from "./schema.js";
export * from "./patch-safety.js";
export * from "./typecheck.js";
export * from "./lint.js";
export * from "./unit-tests.js";
export * from "./ui-tests.js";
export * from "./skill-checks.js";
export * from "./deployment-readiness.js";
export * from "./security.js";
export * from "./lang-adapter.js";
export * from "./language-detector.js";
export * from "./lang-adapter-registry.js";
export * from "./spawn-command.js";

import { typescriptAdapter } from "./adapters/typescript.js";
import { adapterRegistry } from "./lang-adapter-registry.js";

adapterRegistry.register(typescriptAdapter);

export { typescriptAdapter } from "./adapters/typescript.js";
