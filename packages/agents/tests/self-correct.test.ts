import { patchSafetyValidator, schemaValidator } from "@amase/validators";
import { describe, expect, it } from "vitest";
import { selfCorrect } from "../src/self-correct.js";

describe("selfCorrect", () => {
  it("re-emits when validator fails the first draft", async () => {
    let draftCount = 0;
    const drafts = [
      // first draft fails patch-safety (path outside allowedPaths)
      {
        taskId: "t",
        patches: [{ path: "../escapes", op: "create" as const, content: "" }],
        notes: "n",
      },
      {
        taskId: "t",
        patches: [{ path: "src/ok.ts", op: "create" as const, content: "" }],
        notes: "n",
      },
    ];
    const result = await selfCorrect({
      produce: async () => {
        const draft = drafts[draftCount];
        draftCount++;
        if (!draft) throw new Error("missing draft");
        return draft;
      },
      validators: [schemaValidator, patchSafetyValidator],
      ctx: { workspacePath: "/tmp", allowedPaths: ["src/"], touchesFrontend: false },
    });
    expect(draftCount).toBe(2);
    expect(result.output.patches[0]?.path).toBe("src/ok.ts");
  });

  it("returns first draft when validators pass", async () => {
    let draftCount = 0;
    const result = await selfCorrect({
      produce: async () => {
        draftCount++;
        return {
          taskId: "t",
          patches: [{ path: "src/ok.ts", op: "create" as const, content: "x" }],
          notes: "n",
        };
      },
      validators: [schemaValidator, patchSafetyValidator],
      ctx: { workspacePath: "/tmp", allowedPaths: ["src/"], touchesFrontend: false },
    });
    expect(draftCount).toBe(1);
    expect(result.output.patches[0]?.path).toBe("src/ok.ts");
  });

  it("passes feedback string to the second produce call", async () => {
    const calls: Array<string | undefined> = [];
    await selfCorrect({
      produce: async (fb) => {
        calls.push(fb);
        return {
          taskId: "t",
          patches: [{ path: "outside/bad.ts", op: "create" as const, content: "" }],
          notes: "n",
        };
      },
      validators: [schemaValidator, patchSafetyValidator],
      ctx: { workspacePath: "/tmp", allowedPaths: ["src/"], touchesFrontend: false },
    });
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toBeDefined();
    expect(calls[1]?.length).toBeGreaterThan(0);
  });
});
