import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const TEST_ONLY_MOCKS = /jest\.(mock|spyOn)|vi\.(mock|spyOn)|sinon|mock|stub/;
const NO_ASSERTION = /it\s*\(\s*['"`]/;
const SETTIMEOUT_IN_TEST = /setTimeout|setInterval/;
const MATH_RANDOM = /Math\.random\(\)/;
const DATE_NOW = /new\s+Date\(\s*\)|Date\.now\(\)/;
const TODO_TEST = /it\.todo|test\.todo|it\.(skip|only)|test\.(skip|only)/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(test|spec)\.(ts|tsx|js|jsx|py|go)$/.test(p.path)) continue;
    const content = p.content;

    if (SETTIMEOUT_IN_TEST.test(content) && !/jest\.useFakeTimers|vi\.useFakeTimers|clock\.install/i.test(content)) {
      issues.push({
        file: p.path,
        message: "setTimeout/setInterval in test without fake timers. Tests with real timers are flaky.",
        severity: "warning",
      });
    }

    if (MATH_RANDOM.test(content) && !/mock|seed|fake/i.test(content)) {
      issues.push({
        file: p.path,
        message: "Math.random() in test without mocking/seeding. Use a deterministic random source.",
        severity: "warning",
      });
    }

    if (DATE_NOW.test(content) && !/mock|freeze|fake/i.test(content)) {
      issues.push({
        file: p.path,
        message: "new Date() or Date.now() in test without mocking. Use a frozen clock for determinism.",
        severity: "warning",
      });
    }

    const todoMatches = content.match(TODO_TEST);
    if (todoMatches) {
      issues.push({
        file: p.path,
        message: `Skipped or todo tests detected (${todoMatches.length}). Complete or remove before merge.`,
        severity: "warning",
      });
    }

    // Check for tests with no assertions
    const testBlocks = content.match(/it\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{[^}]*\}/g) ?? [];
    for (const block of testBlocks) {
      if (!/expect|assert|should|to\.|\.ok\(|\.equal\(|\.deepEqual\(/.test(block)) {
        issues.push({
          file: p.path,
          message: "Test block without assertions. Every test must verify expected behavior.",
          severity: "warning",
        });
      }
    }
  }

  return {
    validator: "skill-checks",
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    durationMs: Date.now() - start,
  };
}
