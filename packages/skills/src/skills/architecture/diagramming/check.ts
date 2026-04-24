import type { Patch, ValidationResult } from "@amase/contracts";
import type { SkillCheckContext } from "../../../types.js";

const BINARY_DIAGRAM = /\.(png|jpg|jpeg|gif|bmp|svg)\b/;
const MERMAID_BLOCK = /```mermaid/;
const PLANTUML_BLOCK = /```plantuml|@startuml/;
const D2_BLOCK = /```d2/;
const STRUCTURIZR = /workspace\s*\{|!identifiers\s+hierarchical/;
const ADR_FORMAT = /##\s+(Context|Decision|Consequences|Status)/i;

export async function check(patches: Patch[], _ctx: SkillCheckContext): Promise<ValidationResult> {
  const start = Date.now();
  const issues: Array<{ file: string; message: string; severity: "warning" | "error" }> = [];

  for (const p of patches) {
    if (p.op === "delete") continue;
    const content = p.content;

    if (/\.(md|mdx|adoc)$/.test(p.path)) {
      if (BINARY_DIAGRAM.test(content) && !/!\[.*\]\(.*\.(png|jpg)\)/.test(content)) {
        issues.push({
          file: p.path,
          message: "Binary image file referenced as diagram. Use diagrams-as-code (Mermaid, PlantUML, D2) for version-controlled, diffable documentation.",
          severity: "warning",
        });
      }

      if (!MERMAID_BLOCK.test(content) && !PLANTUML_BLOCK.test(content) && !D2_BLOCK.test(content) && !STRUCTURIZR.test(content)) {
        // Only flag if the file claims to contain architecture docs
        if (/architecture|diagram|system.*design|topology/i.test(content) && !/Check omitted/.test(content)) {
          issues.push({
            file: p.path,
            message: "Architecture documentation without a diagrams-as-code block. Add Mermaid, PlantUML, or D2 diagram.",
            severity: "warning",
          });
        }
      }
    }

    if (/\.(mmd|puml|pu|d2)$/.test(p.path)) {
      if (!/title|legend|date|version/i.test(content)) {
        issues.push({
          file: p.path,
          message: "Diagram file missing title, legend, or version metadata. Add context for maintainers.",
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
