import type { AgentOutput, Patch, ValidationResult } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";

export interface DeploymentReadinessOptions {
  requireDockerfile?: boolean;
  requireCiConfig?: boolean;
  requireHealthcheck?: boolean;
  requireObservability?: boolean;
}

const DEFAULTS: Required<DeploymentReadinessOptions> = {
  requireDockerfile: true,
  requireCiConfig: true,
  requireHealthcheck: true,
  requireObservability: true,
};

export function buildDeploymentReadinessGate(opts: DeploymentReadinessOptions = {}): Validator {
  const cfg = { ...DEFAULTS, ...opts };
  return {
    name: "deployment-readiness",
    async run(_output: AgentOutput, _ctx: ValidatorContext): Promise<ValidationResult> {
      // AgentOutput-level gate — called with synthesized "final" output that
      // aggregates all patches produced across the DAG. Orchestrator builds that view.
      return runReadinessOnPatches(_output.patches, cfg);
    },
  };
}

export async function runReadinessOnPatches(
  patches: Patch[],
  cfg: Required<DeploymentReadinessOptions>,
): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];
  const paths = patches.map((p) => p.path);

  const hasDockerfile = paths.some((p) => /(^|[\\/])Dockerfile(\.|$)/.test(p));
  const hasCi = paths.some(
    (p) => /\.github[\\/]workflows[\\/].+\.ya?ml$/.test(p) || /\.gitlab-ci\.ya?ml$/.test(p),
  );
  const hasHealthcheck = patches.some(
    (p) => /HEALTHCHECK/i.test(p.content) || /\/health(z)?\b/.test(p.content),
  );
  const hasObservability = patches.some((p) =>
    /logger|trace|metric|span|observab/i.test(p.content),
  );

  if (cfg.requireDockerfile && !hasDockerfile) {
    issues.push({
      file: "<release>",
      message: "No Dockerfile present in release set.",
      severity: "error",
    });
  }
  if (cfg.requireCiConfig && !hasCi) {
    issues.push({
      file: "<release>",
      message: "No CI workflow config present in release set.",
      severity: "warning",
    });
  }
  if (cfg.requireHealthcheck && !hasHealthcheck) {
    issues.push({
      file: "<release>",
      message: "No HEALTHCHECK or /health endpoint detected.",
      severity: "warning",
    });
  }
  if (cfg.requireObservability && !hasObservability) {
    issues.push({
      file: "<release>",
      message: "No logger/trace/metric references detected. Add observability.",
      severity: "warning",
    });
  }

  return {
    validator: "deployment-readiness",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
