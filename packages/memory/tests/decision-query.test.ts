import type { DecisionDraft } from "@amase/contracts";
import { describe, expect, it } from "vitest";
import {
  type LoggedDecision,
  findReusableDecision,
  touchedPathsSignature,
} from "../src/decision-query.js";

const base: DecisionDraft = {
  kind: "logic",
  summary: "s",
  touchedPaths: ["src/a/b.ts", "src/a/c.ts"],
  fileCount: 2,
  changesPublicApi: false,
  changesDataModel: false,
  crossesModuleBoundary: false,
  crossCuttingConcern: "none",
};

describe("decision-query", () => {
  it("signature collapses siblings to a glob", () => {
    expect(touchedPathsSignature(base)).toEqual(["src/a/*.ts"]);
  });
  it("finds a prior matching entry", () => {
    const log: LoggedDecision[] = [
      { id: "e1", kind: "logic", signature: ["src/a/*.ts"], answer: { choice: 0 } },
    ];
    expect(findReusableDecision(log, base)?.id).toBe("e1");
  });
  it("misses when kind differs", () => {
    const log: LoggedDecision[] = [
      { id: "e1", kind: "data-model", signature: ["src/a/*.ts"], answer: { choice: 0 } },
    ];
    expect(findReusableDecision(log, base)).toBeNull();
  });
  it("misses when signature differs", () => {
    const log: LoggedDecision[] = [
      { id: "e1", kind: "logic", signature: ["src/b/*.ts"], answer: { choice: 0 } },
    ];
    expect(findReusableDecision(log, base)).toBeNull();
  });
  it("handles mixed extensions via multi-bucket signature", () => {
    const d = { ...base, touchedPaths: ["src/a/b.ts", "src/a/c.md", "src/a/d.ts"] };
    expect(touchedPathsSignature(d)).toEqual(["src/a/*.md", "src/a/*.ts"]);
  });
});
