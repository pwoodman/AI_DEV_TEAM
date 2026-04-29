import { expect, test, vi } from "vitest";
import { runForwardRiskAnalysis } from "../src/forward-risk.js";
import type { Patch } from "@amase/contracts";
import type { LangAdapter } from "../src/lang-adapter.js";

function makePatch(path: string, content: string, op: "create" | "modify" | "delete" = "modify"): Patch {
  return { path, op, content };
}

function makeAdapter(testOk: boolean): LangAdapter {
  return {
    language: "typescript",
    extensions: [".ts"],
    lint: vi.fn().mockResolvedValue({ validator: "lint" as const, ok: true, issues: [], durationMs: 0 }),
    typecheck: vi.fn().mockResolvedValue({ validator: "typecheck" as const, ok: true, issues: [], durationMs: 0 }),
    format: vi.fn().mockResolvedValue({ validator: "lint" as const, ok: true, issues: [], durationMs: 0 }),
    test: vi.fn().mockResolvedValue({
      validator: "unit-tests" as const,
      ok: testOk,
      issues: testOk ? [] : [{ message: "test failed", severity: "error" as const }],
      durationMs: 10,
    }),
  };
}

// --- Heuristic scan ---

test("heuristic: detects removed export in patch content", async () => {
  const patch = makePatch("src/api.ts", `
-export function fetchUser(id: string) {
+function fetchUser(id: string) {
`);
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", null);
  expect(result.forwardRisks.some((r) => r.kind === "api-shape")).toBe(true);
});

test("heuristic: detects zod schema mutation", async () => {
  const patch = makePatch("src/schema.ts", `
-  name: z.string(),
+  name: z.string().min(1),
`);
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", null);
  expect(result.forwardRisks.some((r) => r.kind === "schema")).toBe(true);
});

test("heuristic: detects perf-path file", async () => {
  const patch = makePatch("src/middleware/auth.ts", "// some change");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", null);
  expect(result.forwardRisks.some((r) => r.kind === "perf-path")).toBe(true);
});

test("heuristic: returns empty risks for clean patch", async () => {
  const patch = makePatch("src/utils.ts", `
-const x = 1;
+const x = 2;
`);
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", null);
  expect(result.forwardRisks).toHaveLength(0);
});

// --- Adapter test run ---

test("adapter test pass returns LOW regression risk", async () => {
  const adapter = makeAdapter(true);
  const patch = makePatch("src/sum.ts", "+return a + b;");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", adapter);
  expect(result.regressionRisk).toBe("LOW");
});

test("adapter test fail returns HIGH regression risk", async () => {
  const adapter = makeAdapter(false);
  const patch = makePatch("src/sum.ts", "+return a - b;");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", adapter);
  expect(result.regressionRisk).toBe("HIGH");
});

test("null adapter returns LOW regression risk", async () => {
  const patch = makePatch("src/sum.py", "+return a + b");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "python", null);
  expect(result.regressionRisk).toBe("LOW");
});

test("adapter test throw returns LOW regression risk (no degradation)", async () => {
  const adapter = makeAdapter(true);
  adapter.test = vi.fn().mockRejectedValue(new Error("tool not found"));
  const patch = makePatch("src/sum.ts", "+return a + b;");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", adapter);
  expect(result.regressionRisk).toBe("LOW");
});

// --- Merge ---

test("HIGH from adapter overrides MEDIUM from AST (no TS files = LOW, HIGH wins)", async () => {
  const adapter = makeAdapter(false);
  const patch = makePatch("src/sum.ts", "+return a - b;");
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", adapter);
  expect(result.regressionRisk).toBe("HIGH");
});

test("forwardRisks accumulate from heuristic scan independently of regressionRisk", async () => {
  const adapter = makeAdapter(true);
  const patch = makePatch("src/middleware/auth.ts", `-export function check() {}\n+function check() {}`);
  const result = await runForwardRiskAnalysis([patch], "/workspace", "typescript", adapter);
  expect(result.regressionRisk).toBe("LOW");
  expect(result.forwardRisks.length).toBeGreaterThan(0);
});
