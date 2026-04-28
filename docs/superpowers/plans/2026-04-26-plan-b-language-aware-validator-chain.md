# Plan B: Language-Aware Validator Chain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded TypeScript-only validator trio (lint, typecheck, unit-tests) with a language-aware `LangAdapterValidator` that dispatches to registered adapters based on file language, and add Python and Go as the second and third language implementations.

**Architecture:** A single `langAdapterValidator` detects languages from patch file paths, looks up registered adapters, and runs lint + typecheck + test per adapter — all in parallel. It replaces `lintValidator + typecheckValidator + unitTestsValidator` in the default chain, falling back gracefully (pass) when no adapter is registered. Python (ruff + mypy + pytest) and Go (golangci-lint + go build + gofmt + go test) adapters are added and registered at startup alongside the existing TypeScript adapter.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, Vitest, `@amase/contracts`, `@amase/validators`, ruff, mypy, pytest, golangci-lint, go toolchain

---

## File Map

### New files
- `packages/validators/src/lang-adapter-validator.ts` — `langAdapterValidator`: detects language from patches, dispatches to adapters
- `packages/validators/src/adapters/python.ts` — Python `LangAdapter` (ruff + mypy + pytest)
- `packages/validators/src/adapters/go.ts` — Go `LangAdapter` (golangci-lint + go build + gofmt + go test)
- `packages/validators/tests/lang-adapter-validator.test.ts`
- `packages/validators/tests/adapters/python.test.ts`
- `packages/validators/tests/adapters/go.test.ts`

### Modified files
- `packages/contracts/src/validation.ts` — add `"lang-adapter"` to `ValidatorNameSchema`
- `packages/contracts/tests/schemas.test.ts` — add test asserting `"lang-adapter"` is valid
- `packages/validators/src/index.ts` — export `langAdapterValidator`; register python + go adapters
- `packages/mcp-server/src/index.ts` — use `langAdapterValidator` instead of `lintValidator + typecheckValidator + unitTestsValidator`

---

## Task 1: Add "lang-adapter" to ValidatorNameSchema

**Files:**
- Modify: `packages/contracts/src/validation.ts`
- Modify: `packages/contracts/tests/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/contracts/tests/schemas.test.ts` inside the existing `describe("ValidationResult")` block:

```ts
it("accepts lang-adapter as a validator name", () => {
  const r = ValidationResultSchema.parse({ validator: "lang-adapter", ok: true, durationMs: 1 });
  expect(r.validator).toBe("lang-adapter");
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @amase/contracts test
```

Expected: FAIL — `"lang-adapter"` not in enum.

- [ ] **Step 3: Add "lang-adapter" to the enum**

In `packages/contracts/src/validation.ts`, replace the `ValidatorNameSchema` definition:

```ts
export const ValidatorNameSchema = z.enum([
  "schema",
  "patch-safety",
  "skill-checks",
  "typecheck",
  "lint",
  "unit-tests",
  "ui-tests",
  "security",
  "deployment-readiness",
  "lang-adapter",
]);
```

- [ ] **Step 4: Run contracts tests**

```bash
pnpm --filter @amase/contracts test
```

Expected: all tests pass.

- [ ] **Step 5: Rebuild contracts so downstream packages pick up the new type**

```bash
pnpm --filter @amase/contracts build
```

Expected: clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/validation.ts packages/contracts/tests/schemas.test.ts
git commit -m "feat(contracts): add lang-adapter to ValidatorNameSchema"
```

---

## Task 2: Create LangAdapterValidator

**Files:**
- Create: `packages/validators/src/lang-adapter-validator.ts`
- Create: `packages/validators/tests/lang-adapter-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/validators/tests/lang-adapter-validator.test.ts`:

```ts
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
    // Only .py files should have been passed to the python adapter
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `makeLangAdapterValidator` not found.

- [ ] **Step 3: Create lang-adapter-validator.ts**

Create `packages/validators/src/lang-adapter-validator.ts`:

```ts
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import type { LangAdapterRegistry } from "./lang-adapter-registry.js";
import { detectLanguages } from "./language-detector.js";

export function makeLangAdapterValidator(registry: LangAdapterRegistry): Validator {
  return {
    name: "lang-adapter",
    async run(output: AgentOutput, ctx: ValidatorContext) {
      const start = Date.now();

      const paths = output.patches
        .filter((p) => p.op !== "delete")
        .map((p) => p.path);

      if (paths.length === 0) {
        return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
      }

      const langs = await detectLanguages(paths);
      const adapters = registry.getForLanguages(langs);

      if (adapters.length === 0) {
        return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
      }

      const allResults = await Promise.all(
        adapters.flatMap((adapter) => {
          const adapterFiles = paths.filter((p) =>
            adapter.extensions.some((ext) => p.endsWith(ext)),
          );
          return [
            adapter.lint(adapterFiles, ctx.workspacePath),
            adapter.typecheck(adapterFiles, ctx.workspacePath),
            adapter.test(adapterFiles, ctx.workspacePath),
          ];
        }),
      );

      const firstFailure = allResults.find((r) => !r.ok);
      if (firstFailure) {
        return {
          validator: "lang-adapter",
          ok: false,
          issues: firstFailure.issues,
          durationMs: Date.now() - start,
        };
      }

      return { validator: "lang-adapter", ok: true, issues: [], durationMs: Date.now() - start };
    },
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all lang-adapter-validator tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/lang-adapter-validator.ts packages/validators/tests/lang-adapter-validator.test.ts
git commit -m "feat(validators): add makeLangAdapterValidator — language-aware dispatch"
```

---

## Task 3: Add Python LangAdapter

**Files:**
- Create: `packages/validators/src/adapters/python.ts`
- Create: `packages/validators/tests/adapters/python.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/validators/tests/adapters/python.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pythonAdapter } from "../../src/adapters/python.js";

describe("pythonAdapter", () => {
  it("has correct language and extensions", () => {
    expect(pythonAdapter.language).toBe("python");
    expect(pythonAdapter.extensions).toContain(".py");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("typecheck returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.typecheck([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("test returns ok:true for empty file list", async () => {
    const result = await pythonAdapter.test([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("all methods return a durationMs", async () => {
    const results = await Promise.all([
      pythonAdapter.lint([], process.cwd()),
      pythonAdapter.typecheck([], process.cwd()),
      pythonAdapter.format([], process.cwd()),
      pythonAdapter.test([], process.cwd()),
    ]);
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `adapters/python.js` not found.

- [ ] **Step 3: Create the Python adapter**

Create `packages/validators/src/adapters/python.ts`:

```ts
import type { ValidationResult } from "@amase/contracts";
import type { LangAdapter } from "../lang-adapter.js";
import { spawnCommand } from "../spawn-command.js";

export const pythonAdapter: LangAdapter = {
  language: "python",
  extensions: [".py", ".pyw"],

  async lint(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "ruff",
      ["check", ...files],
      workspace,
    );
    if (code === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "lint",
      ok: false,
      issues: parseRuffOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async typecheck(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "mypy",
      [...files, "--no-error-summary"],
      workspace,
    );
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseMypyOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async format(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    if (files.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "ruff",
      ["format", ...files],
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
      "pytest",
      [...files, "--tb=short", "-q"],
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

function parseRuffOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    // ruff format: path/file.py:10:5: E501 message
    const m = line.match(/^(.+?):(\d+):\d+:\s+(\S+\s+.+)$/);
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

function parseMypyOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    // mypy format: path/file.py:10: error: message
    const m = line.match(/^(.+?):(\d+):\s+error:\s+(.+)$/);
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all python adapter tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/adapters/python.ts packages/validators/tests/adapters/python.test.ts
git commit -m "feat(validators): add Python LangAdapter — ruff + mypy + pytest"
```

---

## Task 4: Add Go LangAdapter

**Files:**
- Create: `packages/validators/src/adapters/go.ts`
- Create: `packages/validators/tests/adapters/go.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/validators/tests/adapters/go.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { goAdapter } from "../../src/adapters/go.js";

describe("goAdapter", () => {
  it("has correct language and extensions", () => {
    expect(goAdapter.language).toBe("go");
    expect(goAdapter.extensions).toContain(".go");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await goAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("typecheck returns ok:true for empty file list", async () => {
    const result = await goAdapter.typecheck([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await goAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("test returns ok:true for empty file list", async () => {
    const result = await goAdapter.test([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("all methods return a durationMs", async () => {
    const results = await Promise.all([
      goAdapter.lint([], process.cwd()),
      goAdapter.typecheck([], process.cwd()),
      goAdapter.format([], process.cwd()),
      goAdapter.test([], process.cwd()),
    ]);
    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `adapters/go.js` not found.

- [ ] **Step 3: Create the Go adapter**

Create `packages/validators/src/adapters/go.ts`:

```ts
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
    // golangci-lint runs on packages, not individual files — use ./... if available
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
    const { code, stdout, stderr } = await spawnCommand(
      "go",
      ["build", "./..."],
      workspace,
    );
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
    const { code, stdout, stderr } = await spawnCommand(
      "gofmt",
      ["-w", ...files],
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
    // golangci-lint line-number format: file.go:10:5: message (linter)
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
    // go build format: ./file.go:10:5: message
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all go adapter tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validators/src/adapters/go.ts packages/validators/tests/adapters/go.test.ts
git commit -m "feat(validators): add Go LangAdapter — golangci-lint + go build + go test"
```

---

## Task 5: Register adapters and export langAdapterValidator

**Files:**
- Modify: `packages/validators/src/index.ts`

- [ ] **Step 1: Update validators/src/index.ts**

Replace the contents of `packages/validators/src/index.ts`:

```ts
export * from "./chain.js";
export * from "./schema.js";
export * from "./patch-safety.js";
export * from "./typecheck.js";
export * from "./lint.js";
export * from "./unit-tests.js";
export * from "./ui-tests.js";
export * from "./skill-checks.js";
export * from "./deployment-readiness.js";
export * from "./security.js";
export * from "./lang-adapter.js";
export * from "./language-detector.js";
export * from "./lang-adapter-registry.js";
export * from "./lang-adapter-validator.js";
export * from "./spawn-command.js";

import { goAdapter } from "./adapters/go.js";
import { pythonAdapter } from "./adapters/python.js";
import { typescriptAdapter } from "./adapters/typescript.js";
import { adapterRegistry } from "./lang-adapter-registry.js";
import { makeLangAdapterValidator } from "./lang-adapter-validator.js";

adapterRegistry.register(typescriptAdapter);
adapterRegistry.register(pythonAdapter);
adapterRegistry.register(goAdapter);

export { goAdapter } from "./adapters/go.js";
export { pythonAdapter } from "./adapters/python.js";
export { typescriptAdapter } from "./adapters/typescript.js";

export const langAdapterValidator = makeLangAdapterValidator(adapterRegistry);
```

- [ ] **Step 2: Run all validators tests**

```bash
pnpm --filter @amase/validators test
```

Expected: all tests pass.

- [ ] **Step 3: Typecheck validators**

```bash
pnpm --filter @amase/validators typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/validators/src/index.ts
git commit -m "feat(validators): register python + go adapters; export langAdapterValidator"
```

---

## Task 6: Wire langAdapterValidator into mcp-server

**Files:**
- Modify: `packages/mcp-server/src/index.ts`

- [ ] **Step 1: Update buildValidators() in mcp-server/src/index.ts**

In `packages/mcp-server/src/index.ts`, update the imports and `buildValidators` function.

Replace the import block that imports the individual validators:

```ts
import {
  type Validator,
  buildSecurityValidator,
  langAdapterValidator,
  patchSafetyValidator,
  schemaValidator,
  uiTestsValidator,
} from "@amase/validators";
```

Replace the `buildValidators` function body:

```ts
function buildValidators(): Validator[] {
  if (process.env.AMASE_MINIMAL_VALIDATORS === "1") {
    return [schemaValidator, patchSafetyValidator];
  }
  return [
    schemaValidator,
    patchSafetyValidator,
    langAdapterValidator,
    uiTestsValidator,
    buildSecurityValidator(),
  ];
}
```

Note: `lintValidator`, `typecheckValidator`, and `unitTestsValidator` are removed from this chain — they are now handled internally by the TypeScript LangAdapter that `langAdapterValidator` dispatches to. Their exports remain for backwards compat.

- [ ] **Step 2: Build the mcp-server package**

```bash
pnpm --filter @amase/mcp-server build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass. The bench adapter test (`packages/bench/tests/adapters/amase.test.ts`) must still pass — it uses `AMASE_MINIMAL_VALIDATORS=1` internally which returns `[schemaValidator, patchSafetyValidator]`, so `langAdapterValidator` is not in that path.

If you see TypeScript errors about removed exports, check if any other file still imports `lintValidator`/`typecheckValidator`/`unitTestsValidator` from `@amase/validators` — those exports still exist so no import errors should appear.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/index.ts
git commit -m "feat(mcp-server): replace hardcoded TS validators with langAdapterValidator"
```

---

## Task 7: Final smoke test

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: all packages build cleanly.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (176+ tests, 0 failures).

- [ ] **Step 3: Verify the bench adapter still runs end-to-end**

```bash
pnpm --filter @amase/bench test
```

Expected: the `amase.test.ts` stub test completes and reports a `BenchResult` with `pass: false` (stub doesn't produce correct output — that's expected at this scope).

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix(validators): plan-b fixups from smoke test"
```

Only commit if there are actual changes. Skip if nothing changed.
