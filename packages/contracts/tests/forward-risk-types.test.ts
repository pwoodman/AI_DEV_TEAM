import { expect, test } from "vitest";
import { ForwardRiskResultSchema } from "../src/validation.js";

test("parses a valid LOW result with no risks", () => {
  const result = ForwardRiskResultSchema.parse({
    regressionRisk: "LOW",
    forwardRisks: [],
  });
  expect(result.regressionRisk).toBe("LOW");
  expect(result.forwardRisks).toHaveLength(0);
});

test("parses a HIGH result with api-shape risk", () => {
  const result = ForwardRiskResultSchema.parse({
    regressionRisk: "HIGH",
    forwardRisks: [
      { kind: "api-shape", file: "src/api.ts", detail: "exported function 'fetch' removed" },
    ],
  });
  expect(result.regressionRisk).toBe("HIGH");
  expect(result.forwardRisks[0]?.kind).toBe("api-shape");
});

test("rejects invalid regressionRisk value", () => {
  expect(() =>
    ForwardRiskResultSchema.parse({ regressionRisk: "CRITICAL", forwardRisks: [] }),
  ).toThrow();
});
