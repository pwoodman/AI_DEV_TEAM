import type { ValidationResult } from "@amase/contracts";
import type { LangAdapter } from "../lang-adapter.js";
import { spawnCommand } from "../spawn-command.js";

export const goAdapter: LangAdapter = {
  language: "go",
  extensions: [".go"],

  async lint(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "golangci-lint",
      ["run", "--out-format=line-number", "./..."],
      workspace,
    );
    if (code === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "lint",
      ok: false,
      issues: parseGolangciOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async typecheck(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand("go", ["build", "./..."], workspace);
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseGoBuildOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async format(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand("gofmt", ["-w", ...files], workspace);
    if (code === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "lint",
      ok: false,
      issues: [{ message: (stdout + stderr).slice(0, 1000), severity: "error" as const }],
      durationMs: Date.now() - start,
    };
  },

  async test(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "unit-tests", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "go",
      ["test", "./...", "-count=1"],
      workspace,
    );
    if (code === 0) {
      return { validator: "unit-tests", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "unit-tests",
      ok: false,
      issues: [{ message: (stdout + stderr).slice(0, 2000), severity: "error" as const }],
      durationMs: Date.now() - start,
    };
  },
};

function parseGolangciOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?):(\d+):\d+:\s+(.+)$/);
    if (!m) continue;
    const [, file, lineNo, message] = m;
    if (!file || !lineNo || !message) continue;
    issues.push({ file, line: Number(lineNo), message, severity: "error" });
  }
  if (issues.length === 0 && text.trim()) {
    issues.push({ message: text.slice(0, 500), severity: "error" });
  }
  return issues;
}

function parseGoBuildOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\.\/(.+?):(\d+):\d+:\s+(.+)$/);
    if (!m) continue;
    const [, file, lineNo, message] = m;
    if (!file || !lineNo || !message) continue;
    issues.push({ file, line: Number(lineNo), message, severity: "error" });
  }
  if (issues.length === 0 && text.trim()) {
    issues.push({ message: text.slice(0, 500), severity: "error" });
  }
  return issues;
}
