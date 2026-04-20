import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const from = resolve(process.cwd(), "src/prompts");
const to = resolve(process.cwd(), "dist/prompts");
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`copied prompts -> ${to}`);
