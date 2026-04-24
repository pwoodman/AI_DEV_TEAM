import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const TOO_MANY_PROPS = /(?:props?|options?|config)\s*[:\(].{250,}/;
const FETCH_IN_COMPONENT = /\buseEffect\b.*\bfetch\b|\bfetch\b.*\buseEffect\b/s;
const WINDOW_GLOBAL = /\bwindow\.[a-zA-Z_$][\w$]*\b/;
const INLINE_STYLES = /style\s*=\s*\{\s*\{/;
const SELECTOR_BY_TEXT = /getByText|queryByText|findByText/;
const MEGA_COMPONENT = /\b(?:isPrimary|isGhost|isLoading|isDisabled|size|variant|color)\b/g;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    const isComponent =
      /\b(React\.memo|defineComponent|Vue\.component|SvelteComponent|function\s+\w+Component|const\s+\w+Component)\b/.test(
        content,
      ) || /\b(jsx|tsx|vue|svelte)\b/.test(p.path);
    if (!isComponent) continue;

    if (TOO_MANY_PROPS.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Props object is very large. Consider splitting into smaller, focused sub-objects (composition pattern).",
        severity: "warning",
      });
    }

    if (FETCH_IN_COMPONENT.test(content)) {
      issues.push({
        file: p.path,
        message:
          "fetch() called inside component. Extract data fetching into a custom hook, loader, or container.",
        severity: "warning",
      });
    }

    if (WINDOW_GLOBAL.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Direct window global access in component. Inject via props or context for testability.",
        severity: "warning",
      });
    }

    const megaMatches = content.match(MEGA_COMPONENT);
    if (megaMatches && new Set(megaMatches).size >= 4) {
      issues.push({
        file: p.path,
        message:
          "Flag-driven mega-component detected (4+ boolean/size props). Prefer composition pattern.",
        severity: "warning",
      });
    }

    // Check for components doing too many things
    const hookMatches = content.match(/\buse[A-Z]\w+/g) ?? [];
    const uniqueHooks = new Set(hookMatches);
    if (uniqueHooks.size > 5) {
      issues.push({
        file: p.path,
        message: `Component uses ${uniqueHooks.size} unique hooks. Extract concerns into smaller components or custom hooks.`,
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
