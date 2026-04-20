import { describe, expect, it } from "vitest";
import type { AgentOutput } from "@amase/contracts";
import {
  patchSafetyValidator,
  runValidatorChain,
  schemaValidator,
} from "../src/index.js";

const okOutput: AgentOutput = {
  taskId: "t1",
  patches: [{ path: "src/a.ts", op: "create", content: "x" }],
  notes: "ok",
};

describe("schemaValidator", () => {
  it("passes valid AgentOutput", async () => {
    const r = await schemaValidator.run(okOutput, { workspacePath: ".", allowedPaths: ["src/"] });
    expect(r.ok).toBe(true);
  });

  it("fails invalid AgentOutput", async () => {
    const bad = { ...okOutput, notes: "a".repeat(300) } as unknown as AgentOutput;
    const r = await schemaValidator.run(bad, { workspacePath: ".", allowedPaths: ["src/"] });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe("patchSafetyValidator", () => {
  const ctx = { workspacePath: ".", allowedPaths: ["src/", "tests/"] };

  it("accepts paths inside allowed roots", async () => {
    const r = await patchSafetyValidator.run(okOutput, ctx);
    expect(r.ok).toBe(true);
  });

  it("rejects absolute paths", async () => {
    const r = await patchSafetyValidator.run(
      { ...okOutput, patches: [{ path: "/etc/passwd", op: "create", content: "x" }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toMatch(/absolute/);
  });

  it("rejects parent-traversal paths", async () => {
    const r = await patchSafetyValidator.run(
      { ...okOutput, patches: [{ path: "../evil.ts", op: "create", content: "x" }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toMatch(/traversal/);
  });

  it("rejects paths outside allowedPaths", async () => {
    const r = await patchSafetyValidator.run(
      { ...okOutput, patches: [{ path: "lib/other.ts", op: "create", content: "x" }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toMatch(/outside/);
  });

  it("accepts multiple allowed roots", async () => {
    const r = await patchSafetyValidator.run(
      {
        ...okOutput,
        patches: [
          { path: "src/a.ts", op: "create", content: "x" },
          { path: "tests/a.test.ts", op: "create", content: "x" },
        ],
      },
      ctx,
    );
    expect(r.ok).toBe(true);
  });
});

describe("runValidatorChain", () => {
  it("stops at first failure", async () => {
    const bad = { ...okOutput, notes: "a".repeat(300) } as unknown as AgentOutput;
    const outcome = await runValidatorChain(bad, { workspacePath: ".", allowedPaths: ["src/"] }, [
      schemaValidator,
      patchSafetyValidator,
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.firstFailure?.validator).toBe("schema");
    expect(outcome.results).toHaveLength(1);
  });

  it("runs all validators when they pass", async () => {
    const outcome = await runValidatorChain(okOutput, { workspacePath: ".", allowedPaths: ["src/"] }, [
      schemaValidator,
      patchSafetyValidator,
    ]);
    expect(outcome.ok).toBe(true);
    expect(outcome.results).toHaveLength(2);
  });
});
