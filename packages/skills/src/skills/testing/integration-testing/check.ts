import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const REAL_HTTP_CALLS = /\b(fetch|axios|request)\s*\(\s*['"`]https?:\/\//;
const MOCK_EXTERNAL = /\b(nock|wiremock|mountebank|responses|polly|vcr)\b/i;
const TESTCONTAINER = /\b(testcontainer|postgres|mysql|redis|mongodb)\b/i;
const DB_CLEANUP = /\b(rollback|truncate|cleanup|afterEach|tearDown)\b/i;
const PROD_URL = /https?:\/\/(?:api\.)?[\w-]+\.(com|org|net|io)/;
const FACTORY_USAGE = /\b(factory|Factory|faker|chance)\b/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    if (!/\.(test|spec|integration)\.(ts|tsx|js|jsx|py|go)$|integration/.test(p.path)) continue;
    const content = p.content;

    if (REAL_HTTP_CALLS.test(content) && !MOCK_EXTERNAL.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Real HTTP calls detected in integration test. Stub external APIs with nock, WireMock, or VCR.",
        severity: "error",
      });
    }

    if (PROD_URL.test(content) && !/example\.|localhost|127\.0\.0\.1|0\.0\.0\.0/.test(content)) {
      issues.push({
        file: p.path,
        message: "Production URL detected in test. Use test-specific endpoints or mocks.",
        severity: "error",
      });
    }

    if (
      /\b(sequelize|prisma|sqlalchemy|gorm|db\.query)\b/i.test(content) &&
      !DB_CLEANUP.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Database interaction without cleanup/rollback. Ensure test data is removed after each test.",
        severity: "warning",
      });
    }

    if (
      /\bINSERT\s+INTO|CREATE\s+TABLE|DROP\s+TABLE/i.test(content) &&
      !TESTCONTAINER.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Direct DDL/DML in integration test without testcontainers or ephemeral database. Use isolated test databases.",
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
