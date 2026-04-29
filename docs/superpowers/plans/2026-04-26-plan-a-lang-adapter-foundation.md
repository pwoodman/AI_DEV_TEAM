# Plan A: LangAdapter Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Establish the LangAdapter interface, registry, language detector, shared spawn utility, and TypeScript reference adapter — the foundation that Plans B, C, and D build on.

**Architecture:** A thin `LangAdapter` interface maps the four validator operations (lint, typecheck, format, test) to language-specific CLI invocations. A `LangAdapterRegistry` singleton maps languages and file extensions to adapters. A `LanguageDetector` identifies languages deterministically from file extensions and shebangs. The existing TypeScript validators (tsc, biome, vitest) are wrapped into the first `LangAdapter` implementation.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, Vitest, `@amase/contracts`, `@amase/validators`

---

## File Map

### New files
- `packages/validators/src/spawn-command.ts` — shared CLI spawn util (replaces duplicated code in lint.ts, typecheck.ts, unit-tests.ts)
- `packages/validators/src/lang-adapter.ts` — `LangAdapter` interface + `AdapterValidationResult` type
- `packages/validators/src/language-detector.ts` — `detectLanguages(files)` — extension map + shebang fallback
- `packages/validators/src/lang-adapter-registry.ts` — `LangAdapterRegistry` class + `adapterRegistry` singleton
- `packages/validators/src/adapters/typescript.ts` — TypeScript `LangAdapter` (wraps tsc, biome, vitest)
- `packages/validators/tests/spawn-command.test.ts`
- `packages/validators/tests/language-detector.test.ts`
- `packages/validators/tests/lang-adapter-registry.test.ts`
- `packages/validators/tests/adapters/typescript.test.ts`

### Modified files
- `packages/contracts/src/kinds.ts` — expand `LanguageSchema` from 6 short codes to 21 full names
- `packages/skills/src/registry.ts` — update short language codes to full names
- `packages/skills/tests/resolver.test.ts` — update test language values
- `packages/mcp-server/tests/tools-contract.test.ts` — update `language: "ts"` → `language: "typescript"`
- `packages/validators/src/lint.ts` — use shared `spawnCommand`
- `packages/validators/src/typecheck.ts` — use shared `spawnCommand`
- `packages/validators/src/unit-tests.ts` — use shared `spawnCommand`
- `packages/validators/src/index.ts` — export new types and registry

---

## Task 1: Expand LanguageSchema

**Files:**
- Modify: `packages/contracts/src/kinds.ts`
- Modify: `packages/skills/src/registry.ts`
- Modify: `packages/skills/tests/resolver.test.ts`
- Modify: `packages/mcp-server/tests/tools-contract.test.ts`

- [x] **Step 1: Write the failing test for new language values**

Add to `packages/contracts/tests/schemas.test.ts` inside the existing `describe("AgentInput")` block:

```ts
it("accepts full language names", () => {
  expect(AgentInputSchema.parse({ ...valid, language: "typescript" }).language).toBe("typescript");
  expect(AgentInputSchema.parse({ ...valid, language: "python" }).language).toBe("python");
  expect(AgentInputSchema.parse({ ...valid, language: "rust" }).language).toBe("rust");
});

it("rejects old short language codes", () => {
  expect(() => AgentInputSchema.parse({ ...valid, language: "ts" })).toThrow();
  expect(() => AgentInputSchema.parse({ ...valid, language: "py" })).toThrow();
});
```

- [x] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @amase/contracts test
```

Expected: FAIL — `"typescript"` not in enum, `"ts"` still accepted.

- [x] **Step 3: Update LanguageSchema in kinds.ts**

Replace the existing `LanguageSchema` and `Language` export in `packages/contracts/src/kinds.ts`:

```ts
import { z } from "zod";

export const AgentKindSchema = z.enum([
  "architect",
  "backend",
  "frontend",
  "refactor",
  "test-gen",
  "qa",
  "ui-test",
  "security",
  "deployment",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const LanguageSchema = z.enum([
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "csharp",
  "cpp",
  "c",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dart",
  "scala",
  "shell",
  "sql",
  "html-css",
  "r",
  "lua",
  "other",
]);
export type Language = z.infer<typeof LanguageSchema>;
```

- [x] **Step 4: Update skills registry to use full language names**

In `packages/skills/src/registry.ts`, make these exact replacements:

```ts
// Before:
{ languages: ["ts", "js"] },
// After:
{ languages: ["typescript", "javascript"] },
```

```ts
// Before:
skill("lang/python", "Python idioms and pitfalls", { languages: ["py"] }, langPythonCheck),
// After:
skill("lang/python", "Python idioms and pitfalls", { languages: ["python"] }, langPythonCheck),
```

```ts
// Before:
skill("lang/go", "Go idioms and pitfalls", { languages: ["go"] }, langGoCheck),
// After:
skill("lang/go", "Go idioms and pitfalls", { languages: ["go"] }, langGoCheck),
```

```ts
// Before:
skill("lang/sql", "Safe SQL authoring and migrations", { languages: ["sql"] }, sqlCheck),
// After:
skill("lang/sql", "Safe SQL authoring and migrations", { languages: ["sql"] }, sqlCheck),
```

```ts
// Before:
{ languages: ["ts", "js", "py", "go"] },
// After:
{ languages: ["typescript", "javascript", "python", "go"] },
```

Run `pnpm --filter @amase/skills typecheck` after each change to catch any missed references.

- [x] **Step 5: Update skills resolver test**

In `packages/skills/tests/resolver.test.ts`, replace:
- `language: "go"` → `language: "go"` (unchanged)
- `language: "ts"` → `language: "typescript"`

- [x] **Step 6: Update MCP server test**

In `packages/mcp-server/tests/tools-contract.test.ts`, replace:
- `language: "ts"` → `language: "typescript"`

- [x] **Step 7: Run all tests to confirm passing**

```bash
pnpm test
```

Expected: all tests pass. Fix any remaining old short-code references reported by TypeScript errors.

- [x] **Step 8: Commit**

```bash
git add packages/contracts/src/kinds.ts packages/skills/src/registry.ts packages/skills/tests/resolver.test.ts packages/mcp-server/tests/tools-contract.test.ts packages/contracts/tests/schemas.test.ts
git commit -m "feat(contracts): expand LanguageSchema to full names for top-20 language support"
```

---

## Task 2: Extract shared spawnCommand utility

**Files:**
- Create: `packages/validators/src/spawn-command.ts`
- Modify: `packages/validators/src/lint.ts`
- Modify: `packages/validators/src/typecheck.ts`
- Modify: `packages/validators/src/unit-tests.ts`
- Create: `packages/validators/tests/spawn-command.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/validators/tests/spawn-command.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spawnCommand } from "../src/spawn-command.js";

describe("spawnCommand", () => {
  it("captures stdout from a successful command", async () => {
    const result = await spawnCommand("node", ["-e", "process.stdout.write('hello')"], process.cwd());
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("hello");
  });

  it("captures stderr from a failing command", async () => {
    const result = await spawnCommand("node", ["-e", "process.stderr.write('err'); process.exit(1)"], process.cwd());
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("err");
  });

  it("returns code 1 when process exits with non-zero", async () => {
    const result = await spawnCommand("node", ["-e", "process.exit(2)"], process.cwd());
    expect(result.code).toBe(2);
  });
});
```

- [x] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `spawn-command.js` not found.

- [x] **Step 3: Create spawnCommand**

Create `packages/validators/src/spawn-command.ts`:

```ts
import { spawn } from "node:child_process";

export function spawnCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
```

- [x] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter @amase/validators test
```

Expected: PASS for spawn-command tests.

- [x] **Step 5: Refactor lint.ts to use spawnCommand**

Replace the contents of `packages/validators/src/lint.ts`:

```ts
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const lintValidator: Validator = {
  name: "lint",
  async run(output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const paths = output.patches.filter((p) => p.op !== "delete").map((p) => p.path);
    if (paths.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["biome", "check", ...paths],
      ctx.workspacePath,
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
};
```

- [x] **Step 6: Refactor typecheck.ts to use spawnCommand**

Replace the contents of `packages/validators/src/typecheck.ts`:

```ts
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const typecheckValidator: Validator = {
  name: "typecheck",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["tsc", "--noEmit"],
      ctx.workspacePath,
    );
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseTscOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },
};

function parseTscOutput(text: string) {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),\d+\):\s+error\s+(.+)$/);
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

- [x] **Step 7: Refactor unit-tests.ts to use spawnCommand**

Replace the contents of `packages/validators/src/unit-tests.ts`:

```ts
import type { AgentOutput } from "@amase/contracts";
import type { Validator, ValidatorContext } from "./chain.js";
import { spawnCommand } from "./spawn-command.js";

export const unitTestsValidator: Validator = {
  name: "unit-tests",
  async run(_output: AgentOutput, ctx: ValidatorContext) {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["vitest", "run", "--reporter=basic"],
      ctx.workspacePath,
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
```

- [x] **Step 8: Run all validator tests to confirm no regressions**

```bash
pnpm --filter @amase/validators test
```

Expected: all tests pass.

- [x] **Step 9: Commit**

```bash
git add packages/validators/src/spawn-command.ts packages/validators/src/lint.ts packages/validators/src/typecheck.ts packages/validators/src/unit-tests.ts packages/validators/tests/spawn-command.test.ts
git commit -m "refactor(validators): extract shared spawnCommand utility"
```

---

## Task 3: Create LangAdapter interface

**Files:**
- Create: `packages/validators/src/lang-adapter.ts`

- [x] **Step 1: Create the interface file**

Create `packages/validators/src/lang-adapter.ts`:

```ts
import type { ValidationResult } from "@amase/contracts";

export interface LangAdapter {
  readonly language: string;
  readonly extensions: string[];
  lint(files: string[], workspace: string): Promise<ValidationResult>;
  typecheck(files: string[], workspace: string): Promise<ValidationResult>;
  format(files: string[], workspace: string): Promise<ValidationResult>;
  test(files: string[], workspace: string): Promise<ValidationResult>;
}
```

- [x] **Step 2: Typecheck to confirm the interface compiles**

```bash
pnpm --filter @amase/validators typecheck
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add packages/validators/src/lang-adapter.ts
git commit -m "feat(validators): add LangAdapter interface"
```

---

## Task 4: Create LanguageDetector

**Files:**
- Create: `packages/validators/src/language-detector.ts`
- Create: `packages/validators/tests/language-detector.test.ts`

- [x] **Step 1: Write the failing tests**

Create `packages/validators/tests/language-detector.test.ts`:

```ts
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
```

- [x] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `language-detector.js` not found.

- [x] **Step 3: Create the LanguageDetector**

Create `packages/validators/src/language-detector.ts`:

```ts
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const EXT_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".php": "php",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".dart": "dart",
  ".scala": "scala",
  ".sc": "scala",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".sql": "sql",
  ".html": "html-css",
  ".htm": "html-css",
  ".css": "html-css",
  ".scss": "html-css",
  ".sass": "html-css",
  ".less": "html-css",
  ".r": "r",
  ".R": "r",
  ".lua": "lua",
};

const SHEBANG_MAP: Array<[RegExp, string]> = [
  [/python/, "python"],
  [/node/, "javascript"],
  [/ruby|rbenv/, "ruby"],
  [/php/, "php"],
  [/bash|sh|zsh|fish/, "shell"],
  [/lua/, "lua"],
  [/Rscript/, "r"],
];

export async function detectLanguages(files: string[]): Promise<string[]> {
  const detected = new Set<string>();
  for (const file of files) {
    const ext = extname(file);
    const mapped = EXT_MAP[ext] ?? EXT_MAP[ext.toLowerCase()];
    if (mapped) {
      detected.add(mapped);
      continue;
    }
    try {
      const content = await readFile(file, "utf8");
      const firstLine = content.split("\n")[0] ?? "";
      if (firstLine.startsWith("#!")) {
        for (const [re, lang] of SHEBANG_MAP) {
          if (re.test(firstLine)) {
            detected.add(lang);
            break;
          }
        }
      }
    } catch {
      // unreadable or missing file — skip
    }
  }
  return [...detected];
}
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all language-detector tests PASS.

- [x] **Step 5: Commit**

```bash
git add packages/validators/src/language-detector.ts packages/validators/tests/language-detector.test.ts
git commit -m "feat(validators): add LanguageDetector — extension + shebang detection"
```

---

## Task 5: Create LangAdapterRegistry

**Files:**
- Create: `packages/validators/src/lang-adapter-registry.ts`
- Create: `packages/validators/tests/lang-adapter-registry.test.ts`

- [x] **Step 1: Write the failing tests**

Create `packages/validators/tests/lang-adapter-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LangAdapter } from "../src/lang-adapter.js";
import { LangAdapterRegistry } from "../src/lang-adapter-registry.js";
import type { ValidationResult } from "@amase/contracts";

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
```

- [x] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `lang-adapter-registry.js` not found.

- [x] **Step 3: Create the registry**

Create `packages/validators/src/lang-adapter-registry.ts`:

```ts
import type { LangAdapter } from "./lang-adapter.js";

export class LangAdapterRegistry {
  private readonly byLanguage = new Map<string, LangAdapter>();
  private readonly byExtension = new Map<string, LangAdapter>();

  register(adapter: LangAdapter): void {
    this.byLanguage.set(adapter.language, adapter);
    for (const ext of adapter.extensions) {
      this.byExtension.set(ext.toLowerCase(), adapter);
    }
  }

  getByLanguage(language: string): LangAdapter | undefined {
    return this.byLanguage.get(language);
  }

  getByExtension(ext: string): LangAdapter | undefined {
    return this.byExtension.get(ext.toLowerCase());
  }

  getForLanguages(languages: string[]): LangAdapter[] {
    const result: LangAdapter[] = [];
    const seen = new Set<string>();
    for (const lang of languages) {
      const adapter = this.byLanguage.get(lang);
      if (adapter && !seen.has(adapter.language)) {
        result.push(adapter);
        seen.add(adapter.language);
      }
    }
    return result;
  }
}

export const adapterRegistry = new LangAdapterRegistry();
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all registry tests PASS.

- [x] **Step 5: Commit**

```bash
git add packages/validators/src/lang-adapter-registry.ts packages/validators/tests/lang-adapter-registry.test.ts
git commit -m "feat(validators): add LangAdapterRegistry"
```

---

## Task 6: Create TypeScript LangAdapter

**Files:**
- Create: `packages/validators/src/adapters/typescript.ts`
- Create: `packages/validators/tests/adapters/typescript.test.ts`

- [x] **Step 1: Write the failing tests**

Create `packages/validators/tests/adapters/typescript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { typescriptAdapter } from "../../src/adapters/typescript.js";

describe("typescriptAdapter", () => {
  it("has correct language and extensions", () => {
    expect(typescriptAdapter.language).toBe("typescript");
    expect(typescriptAdapter.extensions).toContain(".ts");
    expect(typescriptAdapter.extensions).toContain(".tsx");
  });

  it("lint returns ok:true for empty file list", async () => {
    const result = await typescriptAdapter.lint([], process.cwd());
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("format returns ok:true for empty file list", async () => {
    const result = await typescriptAdapter.format([], process.cwd());
    expect(result.ok).toBe(true);
  });

  it("lint result has a durationMs", async () => {
    const result = await typescriptAdapter.lint([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("typecheck result has a durationMs", async () => {
    const result = await typescriptAdapter.typecheck([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("test result has a durationMs", async () => {
    const result = await typescriptAdapter.test([], process.cwd());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [x] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @amase/validators test
```

Expected: FAIL — `adapters/typescript.js` not found.

- [x] **Step 3: Create the TypeScript adapter**

Create `packages/validators/src/adapters/typescript.ts`:

```ts
import type { ValidationResult } from "@amase/contracts";
import type { LangAdapter } from "../lang-adapter.js";
import { spawnCommand } from "../spawn-command.js";

export const typescriptAdapter: LangAdapter = {
  language: "typescript",
  extensions: [".ts", ".tsx", ".mts", ".cts"],

  async lint(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    const targets = files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mts") || f.endsWith(".cts"),
    );
    if (targets.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["biome", "check", ...targets],
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

  async typecheck(_files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["tsc", "--noEmit"],
      workspace,
    );
    if (code === 0) {
      return { validator: "typecheck", ok: true, issues: [], durationMs: Date.now() - start };
    }
    return {
      validator: "typecheck",
      ok: false,
      issues: parseTscOutput(stdout + stderr),
      durationMs: Date.now() - start,
    };
  },

  async format(files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    const targets = files.filter(
      (f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mts") || f.endsWith(".cts"),
    );
    if (targets.length === 0) {
      return { validator: "lint", ok: true, issues: [], durationMs: Date.now() - start };
    }
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["biome", "format", "--write", ...targets],
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

  async test(_files: string[], workspace: string): Promise<ValidationResult> {
    const start = Date.now();
    const { code, stdout, stderr } = await spawnCommand(
      "npx",
      ["vitest", "run", "--reporter=basic"],
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

function parseTscOutput(
  text: string,
): Array<{ file?: string; line?: number; message: string; severity: "error" }> {
  const issues: Array<{ file?: string; line?: number; message: string; severity: "error" }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),\d+\):\s+error\s+(.+)$/);
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

- [x] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @amase/validators test
```

Expected: all TypeScript adapter tests PASS.

- [x] **Step 5: Commit**

```bash
git add packages/validators/src/adapters/typescript.ts packages/validators/tests/adapters/typescript.test.ts
git commit -m "feat(validators): add TypeScript LangAdapter — reference implementation"
```

---

## Task 7: Register TypeScript adapter and update exports

**Files:**
- Modify: `packages/validators/src/index.ts`

- [x] **Step 1: Update the validators index to export new types and register the TS adapter**

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
export * from "./spawn-command.js";

import { typescriptAdapter } from "./adapters/typescript.js";
import { adapterRegistry } from "./lang-adapter-registry.js";

adapterRegistry.register(typescriptAdapter);

export { typescriptAdapter } from "./adapters/typescript.js";
```

- [x] **Step 2: Run full test suite to confirm no regressions**

```bash
pnpm test
```

Expected: all tests across all packages pass.

- [x] **Step 3: Build all packages**

```bash
pnpm build
```

Expected: all 8 packages compile without errors.

- [x] **Step 4: Commit**

```bash
git add packages/validators/src/index.ts
git commit -m "feat(validators): export LangAdapter types, register TypeScript adapter at startup"
```

---

## Task 8: Final smoke test

- [x] **Step 1: Run the MCP smoke script to confirm end-to-end still works**

```bash
node scripts/mcp-smoke.mjs
```

Expected: `plan → execute → status → artifacts` completes in <5s without errors.

- [x] **Step 2: Run full test suite one final time**

```bash
pnpm test
```

Expected: all tests pass.

- [x] **Step 3: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix(validators): plan-a fixups from smoke test"
```

Only commit if there are actual changes. Skip if nothing changed.
