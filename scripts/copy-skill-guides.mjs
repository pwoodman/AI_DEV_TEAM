import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const from = resolve(process.cwd(), "src/skills");
const to = resolve(process.cwd(), "dist/skills");
await mkdir(to, { recursive: true });
await cp(from, to, {
  recursive: true,
  filter: (src) => !src.endsWith(".ts") || src.endsWith(".d.ts"),
});
console.log(`copied skill guides -> ${to}`);
