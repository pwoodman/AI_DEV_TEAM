import type { Patch, ValidatorResult } from "../pipeline.js";
export function schemaValidator(patch: Patch): ValidatorResult {
  if (typeof patch.path !== "string" || patch.path.length === 0) {
    return { ok: false, reason: "schema: path must be a non-empty string" };
  }
  if (typeof patch.content !== "string") {
    return { ok: false, reason: "schema: content must be a string" };
  }
  return { ok: true };
}
