import { describe, expect, it } from "vitest";
import { scoreDecision } from "../src/rubric.js";
import { type DecisionDraft, DecisionDraftSchema } from "../src/types.js";

function draft(partial: Partial<DecisionDraft> = {}): DecisionDraft {
  return DecisionDraftSchema.parse({
    kind: "logic",
    summary: "test",
    touchedPaths: [],
    fileCount: 0,
    ...partial,
  });
}

describe("scoreDecision - plan fixtures", () => {
  it("empty draft -> decide, score 0", () => {
    const r = scoreDecision(draft());
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
    expect(r.reasons).toEqual([]);
  });

  it("only public API -> tier2, score 1", () => {
    const r = scoreDecision(draft({ changesPublicApi: true }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("public API");
  });

  it("only data model -> tier2, score 1", () => {
    const r = scoreDecision(draft({ changesDataModel: true }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("data model");
  });

  it("public API + data model -> ask, score 2", () => {
    const r = scoreDecision(draft({ changesPublicApi: true, changesDataModel: true }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("public API");
  });

  it("fileCount above threshold + dep -> ask", () => {
    const r = scoreDecision(draft({ fileCount: 5, addsDependency: "lodash" }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("new dep: lodash");
    expect(r.reasons.join("|")).toContain("fileCount=5");
  });
});

describe("scoreDecision - single predicate -> tier2", () => {
  it("module boundary alone", () => {
    const r = scoreDecision(draft({ crossesModuleBoundary: true }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("module boundary");
  });

  it("fileCount>threshold alone (default 3)", () => {
    const r = scoreDecision(draft({ fileCount: 4 }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("fileCount=4");
  });

  it("adds dependency alone", () => {
    const r = scoreDecision(draft({ addsDependency: "react" }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("new dep: react");
  });

  it("cross-cutting auth alone", () => {
    const r = scoreDecision(draft({ crossCuttingConcern: "auth" }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("cross-cutting: auth");
  });

  it("cross-cutting logging alone", () => {
    const r = scoreDecision(draft({ crossCuttingConcern: "logging" }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("cross-cutting: logging");
  });

  it("cross-cutting errors alone", () => {
    const r = scoreDecision(draft({ crossCuttingConcern: "errors" }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("cross-cutting: errors");
  });

  it("cross-cutting i18n alone", () => {
    const r = scoreDecision(draft({ crossCuttingConcern: "i18n" }));
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("cross-cutting: i18n");
  });
});

describe("scoreDecision - pairs -> ask", () => {
  it("module boundary + fileCount>threshold", () => {
    const r = scoreDecision(draft({ crossesModuleBoundary: true, fileCount: 10 }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("module boundary");
  });

  it("dep + cross-cutting", () => {
    const r = scoreDecision(draft({ addsDependency: "zod", crossCuttingConcern: "auth" }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("new dep: zod");
  });

  it("public API + module boundary", () => {
    const r = scoreDecision(draft({ changesPublicApi: true, crossesModuleBoundary: true }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("public API");
  });

  it("data model + fileCount>threshold", () => {
    const r = scoreDecision(draft({ changesDataModel: true, fileCount: 4 }));
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("data model");
  });

  it("all predicates together -> ask, high score", () => {
    const r = scoreDecision(
      draft({
        changesPublicApi: true,
        changesDataModel: true,
        addsDependency: "foo",
        crossesModuleBoundary: true,
        fileCount: 8,
        crossCuttingConcern: "errors",
      }),
    );
    expect(r.score).toBe(6);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("cross-cutting: errors");
  });
});

describe("scoreDecision - fileCount threshold edge cases", () => {
  it("fileCount equal to default threshold (3) -> not tripped", () => {
    const r = scoreDecision(draft({ fileCount: 3 }));
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
  });

  it("custom threshold 5: 4 files -> decide", () => {
    const r = scoreDecision(draft({ fileCount: 4 }), { fileCountThreshold: 5 });
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
    expect(r.reasons).toEqual([]);
  });

  it("custom threshold 5: 6 files -> tier2", () => {
    const r = scoreDecision(draft({ fileCount: 6 }), { fileCountThreshold: 5 });
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("fileCount=6");
  });

  it("fileCount=0 with nothing else -> decide", () => {
    const r = scoreDecision(draft({ fileCount: 0 }));
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
  });
});

describe("scoreDecision - touchedPaths independence & extraPredicates", () => {
  it("touchedPaths content does not affect score", () => {
    const r = scoreDecision(
      draft({ touchedPaths: ["a.ts", "b.ts", "c.ts", "d.ts"], fileCount: 0 }),
    );
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
  });

  it("extraPredicates hit adds a reason -> tier2", () => {
    const r = scoreDecision(draft(), {
      extraPredicates: [(d) => (d.summary === "test" ? "custom:summary-hit" : null)],
    });
    expect(r.score).toBe(1);
    expect(r.decision).toBe("tier2");
    expect(r.reasons.join("|")).toContain("custom:summary-hit");
  });

  it("extraPredicates combined with built-in pushes to ask", () => {
    const r = scoreDecision(draft({ changesPublicApi: true }), {
      extraPredicates: [() => "custom:always"],
    });
    expect(r.score).toBe(2);
    expect(r.decision).toBe("ask");
    expect(r.reasons.join("|")).toContain("custom:always");
    expect(r.reasons.join("|")).toContain("public API");
  });

  it("extraPredicates returning null adds nothing", () => {
    const r = scoreDecision(draft(), {
      extraPredicates: [() => null, () => null],
    });
    expect(r.score).toBe(0);
    expect(r.decision).toBe("decide");
    expect(r.reasons).toEqual([]);
  });
});
