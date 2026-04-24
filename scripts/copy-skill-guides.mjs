import { cp, mkdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const from = resolve(process.cwd(), "src/skills");
const to = resolve(process.cwd(), "dist/skills");
await mkdir(to, { recursive: true });
await cp(from, to, {
  recursive: true,
  // Keep runtime payload minimal: only ship guides and directory structure.
  filter: async (src) => {
    if ((await stat(src)).isDirectory()) return true;
    return basename(src) === "guide.md";
  },
});
console.log(`copied skill guides -> ${to}`);
