import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "@amase/validators";
import { runValidatorChain } from "@amase/validators";

export interface SelfCorrectArgs {
  produce: (feedback?: string) => Promise<AgentOutput>;
  validators: Validator[];
  ctx: ValidatorContext;
}

export interface SelfCorrectResult {
  output: AgentOutput;
  /** The name of the first failing validator, if any */
  firstFailureValidator?: string;
}

/**
 * Run first draft through the validator chain. If it fails, re-invoke
 * `produce` once with the concatenated failure messages as feedback and
 * return that second draft (without re-validating — the caller's normal
 * validator chain will see it).
 * Cap: one re-emit pass.
 *
 * Returns both the output and the name of the first validator that failed
 * on the first pass (so the caller can record skill failures accurately).
 */
export async function selfCorrect({
  produce,
  validators,
  ctx,
}: SelfCorrectArgs): Promise<SelfCorrectResult> {
  const first = await produce();
  if (validators.length === 0) return { output: first };

  const outcome = await runValidatorChain(first, ctx, validators);
  if (outcome.ok) return { output: first };

  const feedback = outcome.results
    .filter((r) => !r.ok)
    .flatMap((r) => r.issues.map((i) => `${r.validator}: ${i.message}`))
    .join("; ");

  const firstFailureValidator = outcome.firstFailure?.validator;

  const second = await produce(feedback || "validator chain failed");
  return { output: second, firstFailureValidator };
}
