import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const DIALECT_STRING_CONCAT = /\+\s*['"`]\s*(?:SELECT|INSERT|UPDATE|DELETE)/i;
const MISSING_PLACEHOLDER =
  /(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?(?:WHERE|VALUES|SET)[\s\S]*?['"`][^'"`]*\{[^}]*\}/;
const MYSQL_MYISAM = /ENGINE\s*=\s*MyISAM/i;
const SQLITE_NO_WAL = /PRAGMA\s+journal_mode/i;
const SQLSERVER_SELECT_INTO = /SELECT\s+.*\s+INTO\s+\w+/i;
const NESTED_SUBQUERIES = /\(SELECT[^)]*\(SELECT/;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;
    const isSql =
      /\b(sql|SQL|query|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(content) ||
      /\.(sql|prisma|kysely|drizzle|migration)$/.test(p.path);
    if (!isSql) continue;

    if (MYSQL_MYISAM.test(content)) {
      issues.push({
        file: p.path,
        message:
          "MyISAM engine detected. Use InnoDB for ACID compliance, transactions, and foreign keys.",
        severity: "error",
      });
    }

    if (
      /SQLite|sqlite/.test(content) &&
      !/WAL|journal_mode\s*=\s*wal/i.test(content) &&
      /CREATE\s+TABLE/i.test(content)
    ) {
      issues.push({
        file: p.path,
        message:
          "SQLite database without WAL mode. Enable WAL for better concurrency and performance.",
        severity: "warning",
      });
    }

    if (SQLSERVER_SELECT_INTO.test(content) && !/_test|test_|migration/i.test(p.path)) {
      issues.push({
        file: p.path,
        message:
          "SELECT INTO in production SQL Server code. It locks schema and is not transaction-safe. Use CREATE TABLE + INSERT.",
        severity: "warning",
      });
    }

    if (NESTED_SUBQUERIES.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Nested subquery detected. Consider JOIN or CTE for better readability and optimizer performance.",
        severity: "warning",
      });
    }

    if (/DELETE\s+FROM\s+\w+\s*;?\s*$/im.test(content) && !/WHERE/i.test(content)) {
      issues.push({
        file: p.path,
        message:
          "DELETE without WHERE clause detected. This truncates the entire table. Add a WHERE condition.",
        severity: "error",
      });
    }

    if (/UPDATE\s+\w+\s+SET/i.test(content) && !/WHERE/i.test(content)) {
      issues.push({
        file: p.path,
        message:
          "UPDATE without WHERE clause detected. This modifies every row. Add a WHERE condition.",
        severity: "error",
      });
    }

    if (/SELECT\s+\*\s+FROM\s+information_schema/i.test(content)) {
      issues.push({
        file: p.path,
        message:
          "Querying information_schema with SELECT * can be slow on large schemas. Select only needed columns.",
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
