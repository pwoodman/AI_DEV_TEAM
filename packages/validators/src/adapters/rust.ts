import type { ValidationResult } from "@amase/contracts";
import type { LangAdapter } from "../lang-adapter.js";
import { spawnCommand } from "../spawn-command.js";

export const rustAdapter: LangAdapter = {
  language: "rust",
  extensions: [".rs"],

  async lint(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "cargo",
      ["clippy", "--message-format=short", "--", "-D", "warnings"],
      workspace,
    );
    if (code === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "lint",
      ok: false,
      issues: parseClippyOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async typecheck(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand("cargo", ["check"], workspace);
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseClippyOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async format(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    const targets = files.filter((f) => f.endsWith(".rs"));
    if (targets.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "rustfmt",
      ["--edition", "2021", ...targets],
      workspace,
    );
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
      "cargo",
      ["test", "--quiet"],
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

function parseClippyOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^error(?:\[E\d+\])?:\s+(.+)$/) ??
              line.match(/^\s+--> (.+?):(\d+):\d+$/);
    if (!m) continue;
    if (m[2]) {
      issues.push({ file: m[1], line: Number(m[2]), message: line.trim(), severity: "error" });
    } else if (m[1]) {
      issues.push({ message: m[1]!, severity: "error" });
    }
  }
  if (issues.length === 0 && text.trim()) {
    issues.push({ message: text.slice(0, 500), severity: "error" });
  }
  return issues;
}
