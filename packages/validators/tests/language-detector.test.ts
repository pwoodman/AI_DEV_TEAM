import { describe, expect, it } from "vitest";
import { detectLanguages } from "../src/language-detector.js";

describe("detectLanguages", () => {
  it("detects typescript from .ts extension", async () => {
    const langs = await detectLanguages(["src/app.ts", "src/util.tsx"]);
    expect(langs).toContain("typescript");
  });

  it("detects python from .py extension", async () => {
    const langs = await detectLanguages(["scripts/run.py"]);
    expect(langs).toContain("python");
  });

  it("detects go from .go extension", async () => {
    const langs = await detectLanguages(["main.go", "handler.go"]);
    expect(langs).toContain("go");
  });

  it("detects rust from .rs extension", async () => {
    const langs = await detectLanguages(["src/main.rs"]);
    expect(langs).toContain("rust");
  });

  it("detects multiple languages from mixed files", async () => {
    const langs = await detectLanguages(["app.ts", "service.py", "main.go"]);
    expect(langs).toContain("typescript");
    expect(langs).toContain("python");
    expect(langs).toContain("go");
  });

  it("deduplicates repeated extensions", async () => {
    const langs = await detectLanguages(["a.ts", "b.ts", "c.ts"]);
    expect(langs.filter((l) => l === "typescript")).toHaveLength(1);
  });

  it("returns empty array for unknown extensions", async () => {
    const langs = await detectLanguages(["data.xyz", "config.toml"]);
    expect(langs).toHaveLength(0);
  });

  it("handles empty input", async () => {
    const langs = await detectLanguages([]);
    expect(langs).toEqual([]);
  });

  it("detects csharp from .cs extension", async () => {
    const langs = await detectLanguages(["Program.cs"]);
    expect(langs).toContain("csharp");
  });

  it("detects java from .java extension", async () => {
    const langs = await detectLanguages(["Main.java"]);
    expect(langs).toContain("java");
  });

  it("detects shell from .sh extension", async () => {
    const langs = await detectLanguages(["deploy.sh"]);
    expect(langs).toContain("shell");
  });

  it("detects sql from .sql extension", async () => {
    const langs = await detectLanguages(["migration.sql"]);
    expect(langs).toContain("sql");
  });
});
