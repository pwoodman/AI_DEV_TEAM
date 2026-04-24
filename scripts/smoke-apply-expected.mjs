#!/usr/bin/env node
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const fxDir = process.argv[2];
if (!fxDir) {
  console.error("usage: smoke-apply-expected.mjs <fixture-dir>");
  process.exit(2);
}
const work = mkdtempSync(join(tmpdir(), "amase-fx-"));
cpSync(join(fxDir, "before"), work, { recursive: true });
cpSync(join(fxDir, "tests"), join(work, "tests"), { recursive: true });
const patch = readFileSync(join(fxDir, "expected.patch"), "utf8");
writeFileSync(join(work, ".patch"), patch);
try {
  execSync("git init -q && git add -A && git commit -q -m base", { cwd: work });
  execSync("git apply --whitespace=nowarn .patch", { cwd: work });
} catch (e) {
  console.error("patch failed:", e.message);
  process.exit(1);
}
const repoRoot = resolve(__dirname, "..");
const vitestConfig = join(repoRoot, "packages/bench/vitest.fixture.config.ts");
execSync(`pnpm exec vitest run --root "${work}" --config "${vitestConfig}" --reporter=dot`, {
  stdio: "inherit",
  cwd: repoRoot,
});
console.log("ok:", fxDir);
