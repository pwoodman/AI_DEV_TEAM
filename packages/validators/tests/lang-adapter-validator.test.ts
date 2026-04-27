import { describe, expect, it } from "vitest";
import type { AgentOutput } from "@amase/contracts";
import { LangAdapterRegistry } from "../src/lang-adapter-registry.js";
import { makeLangAdapterValidator } from "../src/lang-adapter-validator.js";
import type { LangAdapter } from "../src/lang-adapter.js";
import type { ValidationResult } from "@amase/contracts";

const ctx = { workspacePath: ".", allowedPaths: ["src/"] };

function makePassAdapter(language: string, extensions: string[]): LangAdapter {
  const pass = async (): Promise<ValidationResult> => ({
    validator: "lint",
    ok: true,
    issues: [],
    durationMs: 0,
  });
  return { language, extensions, lint: pass, typecheck: pass, format: pass, test: pass };
}

function makeFailAdapter(language: string, extensions: string[]): LangAdapter {
  const fail = async (): Promise<ValidationResult> => ({
    validator: "lint",
    ok: false,
    issues: [{ message: "fail", severity: "error" }],
    durationMs: 0,
  });
  return { language, extensions, lint: fail, typecheck: fail, format: fail, test: fail };
}

function makeOutput(paths: string[]): AgentOutput {
  return {
    taskId: "t1",
    patches: paths.map((path) => ({ path, op: "create", content: "x" })),
    notes: "",
  };
}

describe("makeLangAdapterValidator", () => {
  it("passes when no adapter registered for detected language", async () => {
    const reg = new LangAdapterRegistry();
    const v = makeLangAdapterValidator(reg);
    const output = makeOutput(["src/main.go"]);
    const result = await v.run(output, ctx);
    expect(result.ok).toBe(true);
    expect(result.validator).toBe("lang-adapter");
  });

  it("passes when output has no patches", async () => {
    const reg = new LangAdapterRegistry();
    const v = makeLangAdapterValidator(reg);
    const output = makeOutput([]);
    const result = await v.run(output, ctx);
    expect(result.ok).toBe(true);
  });

  it("passes when all adapter ops pass", async () => {
    const reg = new LangAdapterRegistry();
    reg.register(makePassAdapter("python", [".py"]));
    const v = makeLangAdapterValidator(reg);
    const output = makeOutput(["src/main.py"]);
    const result = await v.run(output, ctx);
    expect(result.ok).toBe(true);
  });

  it("fails when any adapter op fails", async () => {
    const reg = new LangAdapterRegistry();
    reg.register(makeFailAdapter("python", [".py"]));
    const v = makeLangAdapterValidator(reg);
    const output = makeOutput(["src/main.py"]);
    const result = await v.run(output, ctx);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("runs adapter only for files matching its extensions", async () => {
    const reg = new LangAdapterRegistry();
    const calls: string[] = [];
    const adapter: LangAdapter = {
      language: "python",
      extensions: [".py"],
      async lint(files) {
        calls.push(...files);
        return { validator: "lint", ok: true, issues: [], durationMs: 0 };
      },
      async typecheck(files) {
        calls.push(...files);
        return { validator: "typecheck", ok: true, issues: [], durationMs: 0 };
      },
      async format() {
        return { validator: "lint", ok: true, issues: [], durationMs: 0 };
      },
      async test(files) {
        calls.push(...files);
        return { validator: "unit-tests", ok: true, issues: [], durationMs: 0 };
      },
    };
    reg.register(adapter);
    const v = makeLangAdapterValidator(reg);
    const output = makeOutput(["src/main.py", "src/util.ts"]);
    await v.run(output, ctx);
    expect(calls.every((f) => f.endsWith(".py"))).toBe(true);
  });

  it("skips delete patches", async () => {
    const reg = new LangAdapterRegistry();
    const called: string[] = [];
    const adapter: LangAdapter = {
      language: "python",
      extensions: [".py"],
      async lint(files) { called.push(...files); return { validator: "lint", ok: true, issues: [], durationMs: 0 }; },
      async typecheck(files) { called.push(...files); return { validator: "typecheck", ok: true, issues: [], durationMs: 0 }; },
      async format() { return { validator: "lint", ok: true, issues: [], durationMs: 0 }; },
      async test(files) { called.push(...files); return { validator: "unit-tests", ok: true, issues: [], durationMs: 0 }; },
    };
    reg.register(adapter);
    const v = makeLangAdapterValidator(reg);
    const output: AgentOutput = {
      taskId: "t1",
      patches: [{ path: "src/old.py", op: "delete" }],
      notes: "",
    };
    await v.run(output, ctx);
    expect(called).toHaveLength(0);
  });

  it("has validator name lang-adapter", () => {
    const reg = new LangAdapterRegistry();
    const v = makeLangAdapterValidator(reg);
    expect(v.name).toBe("lang-adapter");
  });
});
