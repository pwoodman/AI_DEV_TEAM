import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "@amase/validators";
import { runValidatorChain } from "@amase/validators";

export interface SelfCorrectArgs {
  produce: (feedback?: string) => Promise<AgentOutput>;
  validators: Validator[];
  ctx: ValidatorContext;
}

/**
 * Run first draft through the validator chain. If it fails, re-invoke
 * `produce` once with the concatenated failure messages as feedback and
 * return that second draft (without re-validating — the caller's normal
 * validator chain will see it).
 * Cap: one re-emit pass.
 */
export async function selfCorrect({
  produce,
  validators,
  ctx,
}: SelfCorrectArgs): Promise<AgentOutput> {
  const first = await produce();
  if (validators.length === 0) return first;
  const outcome = await runValidatorChain(first, ctx, validators);
  if (outcome.ok) return first;
  const feedback = outcome.results
    .filter((r) => !r.ok)
    .flatMap((r) => r.issues.map((i) => `${r.validator}: ${i.message}`))
    .join("; ");
  return await produce(feedback || "validator chain failed");
}
