import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../src/skills", import.meta.url)));

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("skill guide format", () => {
  it("ships only guide.md docs under src/skills", async () => {
    const files = await walk(ROOT);
    const legacy = files.filter((p) => p.endsWith("SKILL.md"));
    expect(legacy).toEqual([]);
  });

  it("enforces guide template with required sections", async () => {
    const files = (await walk(ROOT)).filter((p) => p.endsWith("guide.md"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text).toMatch(/^# .+/m);
      expect(text).toMatch(/^## Scope/m);
      expect(text).toMatch(/^## Non-negotiables/m);
      expect(text).toMatch(/^## Review checks/m);

      // Guides should be substantive enough to provide real value
      const words = countWords(text);
      expect(words).toBeGreaterThanOrEqual(150);

      // Every non-negotiables section should have concrete, actionable rules
      expect(text).toMatch(/^- /m);

      // Every review checks section should have specific verification items
      expect(text.match(/^## Review checks[\s\S]*^- /m)).toBeTruthy();

      // Should include at least one concrete example or anti-pattern reference
      expect(text).toMatch(/(?:\`{3}|example|anti-pattern|do not|avoid|never|bad:|good:)/i);
    }
  });

  it("every guide has a corresponding check.ts or explicitly opts out", async () => {
    const files = (await walk(ROOT)).filter((p) => p.endsWith("guide.md"));
    for (const file of files) {
      const dir = dirname(file);
      const hasCheck = (await walk(dir)).some((p) => p.endsWith("check.ts"));
      if (!hasCheck) {
        const text = await readFile(file, "utf8");
        // If no check.ts, guide must explicitly state it in a note
        expect(text, `${file} missing check.ts without explanation`).toMatch(
          /no automated check|manual review only|check omitted/i,
        );
      }
    }
  });
});
