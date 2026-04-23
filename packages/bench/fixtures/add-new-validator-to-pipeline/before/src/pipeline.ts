export type Patch = { path: string; content: string };
export type ValidatorResult = { ok: true } | { ok: false; reason: string };
export type Validator = (patch: Patch) => ValidatorResult;

export function runPipeline(validators: Validator[], patch: Patch): ValidatorResult {
  for (const v of validators) {
    const r = v(patch);
    if (!r.ok) return r;
  }
  return { ok: true };
}
