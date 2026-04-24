import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const PROP_DRILL = /(?<!\w)(\w+)(?:\s*,\s*\1){3,}/;
const MIXED_STATE = /useState.*\n.*useEffect.*fetch|fetch.*\n.*useState/s;
const DIRECT_MUTATION = /\b(state|store)\.[a-zA-Z_$][\w$]*\s*=/;
const NO_FORM_LIBRARY = /const\s+\[\s*\w+\s*,\s*set\w+\s*\]\s*=\s*useState.*\n.*(?:email|password|username|form|input)/is;
const URL_STATE = /const\s+\[\s*(?:filter|sort|page|search|query)\s*,\s*set\w+\s*\]\s*=\s*useState/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    if (!/\b(React|Vue|Svelte|useState|useReducer|Pinia|Vuex)\b/.test(content)) continue;

    if (PROP_DRILL.test(content)) {
      issues.push({
        file: p.path,
        message: "Prop drilling detected (same prop passed through 4+ levels). Consider lifting state or using context/zustand/store.",
        severity: "warning",
      });
    }

    if (MIXED_STATE.test(content)) {
      issues.push({
        file: p.path,
        message: "Mixed server and local state in the same component. Use SWR/React Query/TanStack Query for server state.",
        severity: "warning",
      });
    }

    if (DIRECT_MUTATION.test(content)) {
      issues.push({
        file: p.path,
        message: "Direct state mutation detected. State updates must be immutable (spread, Immer, or library helpers).",
        severity: "error",
      });
    }

    if (NO_FORM_LIBRARY.test(content) && !/react-hook-form|formik|vee-validate|felte|vuelidate/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Hand-rolled form state detected. Use a form library (React Hook Form, Formik, VeeValidate) for validation and submission handling.",
        severity: "warning",
      });
    }

    if (URL_STATE.test(content) && !/useSearchParams|URLSearchParams|query-string|qs\./i.test(content)) {
      issues.push({
        file: p.path,
        message: "Filter/sort state stored in memory only. Sync to URL query params for shareable/filterable views.",
        severity: "warning",
      });
    }
  }

  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
