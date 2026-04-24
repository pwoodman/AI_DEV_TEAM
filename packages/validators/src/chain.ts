import type { AgentOutput, ValidationResult } from "@amase/contracts";

export interface ValidatorContext {
  workspacePath: string;
  allowedPaths: string[];
  touchesFrontend?: boolean;
}

export interface Validator {
  name: ValidationResult["validator"];
  run(output: AgentOutput, ctx: ValidatorContext): Promise<ValidationResult>;
}

export interface ChainOutcome {
  ok: boolean;
  results: ValidationResult[];
  firstFailure?: ValidationResult;
}

export async function runValidatorChain(
  output: AgentOutput,
  ctx: ValidatorContext,
  validators: Validator[],
): Promise<ChainOutcome> {
  // Run all validators in parallel — they are independent CPU-bound checks.
  // Collect results; short-circuit on first failure only for the final outcome.
  const results = await Promise.all(validators.map((v) => v.run(output, ctx)));
  const firstFailure = results.find((r) => !r.ok);
  return {
    ok: !firstFailure,
    results,
    firstFailure,
  };
}