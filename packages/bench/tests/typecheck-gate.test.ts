import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTypecheck } from "../src/typecheck-gate.js";

function makeWs(files: Record<string, string>) {
  const d = mkdtempSync(join(tmpdir(), "tcgate-"));
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(d, rel), content);
  }
  return d;
}

describe("runTypecheck", () => {
  it("passes on a clean TS workspace", async () => {
    const ws = makeWs({
      "package.json": JSON.stringify({ name: "t", type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
        },
        include: ["**/*.ts"],
      }),
      "index.ts": "export const x: number = 1;\n",
    });
    const res = await runTypecheck(ws, "ts");
    expect(res.ok).toBe(true);
  });

  it("fails on a TS workspace with a type error", async () => {
    const ws = makeWs({
      "package.json": JSON.stringify({ name: "t", type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
        },
        include: ["**/*.ts"],
      }),
      "index.ts": 'export const x: number = "not a number";\n',
    });
    const res = await runTypecheck(ws, "ts");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not assignable|Type/);
  });
});
