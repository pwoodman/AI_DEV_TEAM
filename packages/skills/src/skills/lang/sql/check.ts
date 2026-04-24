import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const SQL_CONCAT =
  /['"]\s*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE)\b.*\+\s*\w|```sql\s*\n.*\+\s*\w/;
const SQL_TEMPLATE =
  /`\s*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE).*\$\{|`\s*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE).*\#\{/;
const SQL_FSTRING = /f['"].*(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE)/;
const PARAMETERIZED = /\b(\$\d+|\@\w+|\:\w+|\?)\b/;
const SELECT_STAR = /SELECT\s+\*\s+FROM/i;
const N_PLUS_ONE = /for\s*\(.*\{[\s\S]*?(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?\}/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    if (
      !/\b(sql|SQL|query|SELECT|INSERT|UPDATE)\b/.test(content) &&
      !/\.(sql|prisma|kysely|drizzle)$/.test(p.path)
    )
      continue;

    if (SQL_CONCAT.test(content) || SQL_TEMPLATE.test(content) || SQL_FSTRING.test(content)) {
      issues.push({
        file: p.path,
        message:
          "SQL query constructed via string concatenation/interpolation — SQL injection risk. Use parameterized queries.",
        severity: "error",
      });
    }

    if (
      /FROM|JOIN|WHERE|GROUP BY|ORDER BY/.test(content) &&
      !PARAMETERIZED.test(content) &&
      !p.path.endsWith(".sql") &&
      !/\.orm\.|prisma|drizzle|kysely|sqlalchemy|sequelize/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "Raw SQL query without parameterized placeholders detected. Prefer an ORM or parameterize all user inputs.",
        severity: "warning",
      });
    }

    if (SELECT_STAR.test(content) && !/COUNT\s*\(\s*\*\s*\)/i.test(content)) {
      issues.push({
        file: p.path,
        message:
          "SELECT * detected in application code. List explicit columns to prevent breaking on schema changes.",
        severity: "warning",
      });
    }

    if (N_PLUS_ONE.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Loop contains SQL query — potential N+1 problem. Use JOIN, bulk operations, or data loader pattern.",
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
