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
  const results: ValidationResult[] = [];
  for (const v of validators) {
    const r = await v.run(output, ctx);
    results.push(r);
    if (!r.ok) return { ok: false, results, firstFailure: r };
  }
  return { ok: true, results };
}
