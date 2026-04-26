import { describe, expect, it } from "vitest";
import type { ValidationResult } from "@amase/contracts";
import type { LangAdapter } from "../src/lang-adapter.js";
import { LangAdapterRegistry } from "../src/lang-adapter-registry.js";

function makeAdapter(language: string, extensions: string[]): LangAdapter {
  const noop = async (): Promise<ValidationResult> => ({
    validator: "lint",
    ok: true,
    issues: [],
    durationMs: 0,
  });
  return { language, extensions, lint: noop, typecheck: noop, format: noop, test: noop };
}

describe("LangAdapterRegistry", () => {
  it("retrieves adapter by language name", () => {
    const reg = new LangAdapterRegistry();
    const adapter = makeAdapter("typescript", [".ts", ".tsx"]);
    reg.register(adapter);
    expect(reg.getByLanguage("typescript")).toBe(adapter);
  });

  it("retrieves adapter by extension", () => {
    const reg = new LangAdapterRegistry();
    const adapter = makeAdapter("python", [".py"]);
    reg.register(adapter);
    expect(reg.getByExtension(".py")).toBe(adapter);
  });

  it("extension lookup is case-insensitive", () => {
    const reg = new LangAdapterRegistry();
    const adapter = makeAdapter("python", [".py"]);
    reg.register(adapter);
    expect(reg.getByExtension(".PY")).toBe(adapter);
  });

  it("returns undefined for unregistered language", () => {
    const reg = new LangAdapterRegistry();
    expect(reg.getByLanguage("cobol")).toBeUndefined();
  });

  it("getForLanguages returns adapters for known languages only", () => {
    const reg = new LangAdapterRegistry();
    const ts = makeAdapter("typescript", [".ts"]);
    const py = makeAdapter("python", [".py"]);
    reg.register(ts);
    reg.register(py);
    const result = reg.getForLanguages(["typescript", "python", "cobol"]);
    expect(result).toHaveLength(2);
    expect(result).toContain(ts);
    expect(result).toContain(py);
  });

  it("getForLanguages deduplicates", () => {
    const reg = new LangAdapterRegistry();
    const ts = makeAdapter("typescript", [".ts"]);
    reg.register(ts);
    const result = reg.getForLanguages(["typescript", "typescript"]);
    expect(result).toHaveLength(1);
  });
});
