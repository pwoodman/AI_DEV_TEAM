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
export * from "./lang-adapter-validator.js";
export * from "./spawn-command.js";
export * from "./forward-risk.js";

import { goAdapter } from "./adapters/go.js";
import { pythonAdapter } from "./adapters/python.js";
import { typescriptAdapter } from "./adapters/typescript.js";
import { adapterRegistry } from "./lang-adapter-registry.js";
import { makeLangAdapterValidator } from "./lang-adapter-validator.js";

adapterRegistry.register(typescriptAdapter);
adapterRegistry.register(pythonAdapter);
adapterRegistry.register(goAdapter);

export { goAdapter } from "./adapters/go.js";
export { pythonAdapter } from "./adapters/python.js";
export { typescriptAdapter } from "./adapters/typescript.js";

export const langAdapterValidator = makeLangAdapterValidator(adapterRegistry);
