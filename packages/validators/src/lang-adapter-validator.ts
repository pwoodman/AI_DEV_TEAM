import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import type { LangAdapterRegistry } from "./lang-adapter-registry.js";
import { detectLanguages } from "./language-detector.js";

export function makeLangAdapterValidator(registry: LangAdapterRegistry): Validator {
  return {
    name: "lang-adapter",
    async run(output: AgentOutput, ctx: ValidatorContext) {
      const start = Date.now();

      const paths = output.patches
        .filter((p) => p.op !== "delete")
        .map((p) => p.path);

      if (paths.length === 0) {
        return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
      }

      const langs = await detectLanguages(paths);
      const adapters = registry.getForLanguages(langs);

      if (adapters.length === 0) {
        return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
      }

      const allResults = await Promise.all(
        adapters.flatMap((adapter) => {
          const adapterFiles = paths.filter((p) =>
            adapter.extensions.some((ext) => p.endsWith(ext)),
          );
          return [
            adapter.lint(adapterFiles, ctx.workspacePath),
            adapter.typecheck(adapterFiles, ctx.workspacePath),
            adapter.test(adapterFiles, ctx.workspacePath),
          ];
        }),
      );

      const firstFailure = allResults.find((r) => !r.ok);
      if (firstFailure) {
        return {
          validator: "lang-adapter",
          ok: false,
          issues: firstFailure.issues,
          durationMs: Date.now() - start,
        };
      }

      return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
    },
  };
}
