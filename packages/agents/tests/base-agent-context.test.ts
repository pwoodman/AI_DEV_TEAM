import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInput } from "@amase/contracts";
import { StubLlmClient } from "@amase/llm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ASTIndexLike, BackendAgent } from "../src/index.js";

const okResponse = () =>
  JSON.stringify({
    taskId: "t1",
    patches: [{ path: "src/a.ts", op: "create", content: "x" }],
    notes: "ok",
  });

function makeInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    taskId: "t1",
    kind: "backend",
    goal: "do a thing",
    context: { files: [] },
    constraints: { maxTokens: 1024, timeoutMs: 10_000, allowedPaths: ["src/"] },
    ...overrides,
  };
}

/**
 * A BackendAgent subclass that exposes the final user message it built so
 * tests can assert on injected context.
 */
class CapturingBackendAgent extends BackendAgent {
  public capturedUser = "";
  public capturedFiles: Array<{ path: string; slice: string }> = [];
  protected override buildUserMessage(input: AgentInput): string {
    this.capturedFiles = input.context.files.map((f) => ({ ...f }));
    const msg = super.buildUserMessage(input);
    this.capturedUser = msg;
    return msg;
  }
}

describe("BaseAgent contextSlice resolution", () => {
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "amase-ctx-"));
    await writeFile(join(workspace, "types.ts"), "export type Foo = { a: number };\n");
    await writeFile(
      join(workspace, "logic.ts"),
      "export function barFn(n: number): number {\n  return n + 1;\n}\n",
    );
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("resolves contextSlice.files from disk and injects into context.files", async () => {
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm);
    await agent.run(makeInput({ contextSlice: { files: ["types.ts"] } }), workspace);
    expect(agent.capturedFiles.map((f) => f.path)).toEqual(["types.ts"]);
    expect(agent.capturedFiles[0]?.slice).toContain("type Foo");
  });

  it("resolves contextSlice.symbols via the AST index", async () => {
    const ast: ASTIndexLike = {
      async getSlice(path: string, name: string) {
        expect(path.endsWith("logic.ts")).toBe(true);
        expect(name).toBe("barFn");
        return "function barFn(n: number): number { return n + 1; }";
      },
    };
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm, ast);
    await agent.run(
      makeInput({
        contextSlice: { symbols: [{ path: "logic.ts", name: "barFn" }] },
      }),
      workspace,
    );
    expect(agent.capturedFiles).toHaveLength(1);
    expect(agent.capturedFiles[0]?.path).toBe("logic.ts#barFn");
    expect(agent.capturedFiles[0]?.slice).toContain("barFn");
  });

  it("runs normally when no contextSlice is provided (fallback)", async () => {
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm);
    const seededFiles = [{ path: "preexisting.ts", slice: "// already here" }];
    const { output } = await agent.run(makeInput({ context: { files: seededFiles } }), workspace);
    expect(output.patches[0]?.path).toBe("src/a.ts");
    // Existing files untouched
    expect(agent.capturedFiles).toEqual(seededFiles);
  });

  it("skips unresolvable symbols gracefully (getSlice returns undefined)", async () => {
    const ast: ASTIndexLike = {
      async getSlice() {
        return undefined;
      },
    };
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm, ast);
    await agent.run(
      makeInput({
        contextSlice: {
          symbols: [{ path: "logic.ts", name: "doesNotExist" }],
          files: ["types.ts"],
        },
      }),
      workspace,
    );
    // Only the file survived; missing symbol was silently dropped.
    expect(agent.capturedFiles.map((f) => f.path)).toEqual(["types.ts"]);
  });

  it("skips unreadable files gracefully", async () => {
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm);
    await agent.run(makeInput({ contextSlice: { files: ["does-not-exist.ts"] } }), workspace);
    // Nothing resolved — context.files remains empty and run still completes.
    expect(agent.capturedFiles).toEqual([]);
  });

  it("swallows AST index exceptions", async () => {
    const ast: ASTIndexLike = {
      async getSlice() {
        throw new Error("boom");
      },
    };
    const llm = new StubLlmClient(okResponse);
    const agent = new CapturingBackendAgent(llm, ast);
    const { output } = await agent.run(
      makeInput({
        contextSlice: { symbols: [{ path: "logic.ts", name: "barFn" }] },
      }),
      workspace,
    );
    expect(output.patches).toHaveLength(1);
    expect(agent.capturedFiles).toEqual([]);
  });
});
