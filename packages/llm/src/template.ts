import { readFile } from "node:fs/promises";

export async function loadTemplate(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`template var missing: ${k}`);
    return v;
  });
}
