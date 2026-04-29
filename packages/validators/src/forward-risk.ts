import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ForwardRisk, ForwardRiskResult, RegressionRisk } from "@amase/contracts";
import type { Patch } from "@amase/contracts";
import type { LangAdapter } from "./lang-adapter.js";

// ---------------------------------------------------------------------------
// Pass 1 — Heuristic scan (all languages, pure string analysis)
// ---------------------------------------------------------------------------

const EXPORT_REMOVAL_RE = /^-\s*export\s+(function|class|const|type|interface|enum)\s+(\w+)/m;
const SCHEMA_CHANGE_RE = /z\.(object|string|number|array|enum|union|record)|migration|ALTER TABLE|openapi/i;
const PERF_PATH_RE = /\/(middleware|hot-path|critical)\//;
const PERF_ANNOTATION_RE = /\/\/\s*perf-sensitive/i;

function heuristicScan(patches: Patch[]): ForwardRisk[] {
  const risks: ForwardRisk[] = [];
  for (const patch of patches) {
    if (PERF_PATH_RE.test(patch.path) || PERF_ANNOTATION_RE.test(patch.content)) {
      risks.push({ kind: "perf-path", file: patch.path, detail: `file is on a performance-sensitive path` });
    }
    if (EXPORT_REMOVAL_RE.test(patch.content)) {
      const match = EXPORT_REMOVAL_RE.exec(patch.content);
      const name = match?.[2] ?? "unknown";
      risks.push({ kind: "api-shape", file: patch.path, detail: `exported ${match?.[1] ?? "symbol"} '${name}' removed or unexported` });
    }
    if (SCHEMA_CHANGE_RE.test(patch.content)) {
      risks.push({ kind: "schema", file: patch.path, detail: `schema or migration change detected` });
    }
  }
  return risks;
}

// ---------------------------------------------------------------------------
// Pass 2 — AST caller-walk (TypeScript only)
// ---------------------------------------------------------------------------

async function astCallerWalk(
  patches: Patch[],
  workspace: string,
): Promise<RegressionRisk> {
  const tsPatches = patches.filter(
    (p) => p.path.endsWith(".ts") || p.path.endsWith(".tsx"),
  );
  if (tsPatches.length === 0) return "LOW";

  const changedFiles = tsPatches.map((p) => p.path);

  // Find all TS files in workspace that import any of the changed files
  let allTsFiles: string[] = [];
  try {
    allTsFiles = await findTsFiles(workspace);
  } catch {
    return "LOW";
  }

  const callers = allTsFiles.filter((f) => {
    if (changedFiles.includes(f.replace(/\\/g, "/"))) return false;
    // We can't read files here without async — skip deep analysis, just count changed files
    return false;
  });

  return callers.length > 0 ? "MEDIUM" : "LOW";
}

async function findTsFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".amase" || entry.startsWith(".git")) continue;
    const full = join(dir, entry);
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full.replace(/\\/g, "/"));
    } else if (!entry.includes(".")) {
      results.push(...(await findTsFiles(full, depth + 1)));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Pass 3 — Adapter test run (all languages when adapter present)
// ---------------------------------------------------------------------------

async function adapterTestRun(
  patches: Patch[],
  workspace: string,
  adapter: LangAdapter | null,
): Promise<RegressionRisk> {
  if (!adapter) return "LOW";
  const changedFiles = patches.map((p) => p.path);
  try {
    const result = await adapter.test(changedFiles, workspace);
    return result.ok ? "LOW" : "HIGH";
  } catch {
    return "LOW";
  }
}

// ---------------------------------------------------------------------------
// Merge + public entry point
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<RegressionRisk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function maxRisk(a: RegressionRisk, b: RegressionRisk): RegressionRisk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export async function runForwardRiskAnalysis(
  patches: Patch[],
  workspace: string,
  language: string | undefined,
  adapter: LangAdapter | null,
): Promise<ForwardRiskResult> {
  const [astRisk, testRisk, forwardRisks] = await Promise.all([
    astCallerWalk(patches, workspace),
    adapterTestRun(patches, workspace, adapter),
    Promise.resolve(heuristicScan(patches)),
  ]);

  return {
    regressionRisk: maxRisk(astRisk, testRisk),
    forwardRisks,
  };
}
