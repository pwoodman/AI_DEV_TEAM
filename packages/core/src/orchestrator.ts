import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Stats } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

function debugLog(event: string, data: Record<string, unknown>): void {
  if (process.env.AMASE_DEBUG_ORCHESTRATOR) {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
  }
}
import type { ArchitectAgent, BaseAgent } from "@amase/agents";
import { filterSkills, qualityConfidence, recordPatchQuality } from "@amase/agents";
import type {
  AgentInput,
  AgentKind,
  FeatureRequest,
  Patch,
  TaskGraph,
  TaskNode,
  UserAnswer,
  UserQuestion,
} from "@amase/contracts";
import { getPartitionCache, partitionKey, setPartitionCache } from "@amase/llm";
import {
  type ASTIndex,
  type DAGStore,
  type DecisionLog,
  type LoggedDecision,
  runPaths,
  touchedPathsSignature,
} from "@amase/memory";
import { resolveSkills } from "@amase/skills";
import {
  type Validator,
  type ValidatorContext,
  buildDeploymentReadinessGate,
  buildSkillChecksValidator,
} from "@amase/validators";
import { type RouterOptions, routeNode } from "./router.js";
import { applyPatches, ensureSandbox, seedSandbox } from "./sandbox.js";
import { runScheduler } from "./scheduler.js";
import { isBlockedByQuestion } from "./speculative.js";

// ---------------------------------------------------------------------------
// Context packing constants
// ---------------------------------------------------------------------------
const MAX_FILE_BYTES_SMALL = 6_000; // files under 6KB: include fully
const MAX_FILE_BYTES_LARGE = 12_000; // files 6-12KB: smart slice
const MAX_FILE_BYTES_CAP = 18_000; // absolute cap per file
const DEFAULT_TOTAL_BYTES = 16_000;
const SYMBOL_CONTEXT_BUDGET = 8_000; // extra budget when contextSlice has symbols
const DEFAULT_ALLOWED_PATH_CANDIDATES = [
  "src/",
  "app/",
  "lib/",
  "server/",
  "api/",
  "tests/",
  "test/",
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
];

// ---------------------------------------------------------------------------
// Smart context file loading with file-size-aware packing
// ---------------------------------------------------------------------------
async function buildContextFiles(
  workspace: string,
  allowedPaths: string[],
  budgetOverride?: number,
): Promise<Array<{ path: string; slice: string }>> {
  const maxTotal = budgetOverride ?? DEFAULT_TOTAL_BYTES;
  const out: Array<{ path: string; slice: string }> = [];
  let total = 0;

  const visit = async (rel: string): Promise<void> => {
    if (total >= maxTotal) return;
    const abs = join(workspace, rel);
    let s: Stats;
    try {
      s = await stat(abs);
    } catch {
      return;
    }
    if (s.isDirectory()) {
      const names = await readdir(abs);
      await Promise.all(
        names.map((name) => {
          if (name === "node_modules" || name === ".amase" || name.startsWith(".git"))
            return Promise.resolve();
          return visit(relative(workspace, join(abs, name)).replace(/\\/g, "/"));
        }),
      );
      return;
    }
    if (!s.isFile()) return;
    const content = await readFile(abs, "utf8").catch(() => "");
    if (!content) return;

    let slice: string;
    const size = content.length;
    if (size <= MAX_FILE_BYTES_SMALL) {
      slice = content;
    } else if (size <= MAX_FILE_BYTES_LARGE) {
      // Large file: grab first 60% + last 40% to preserve structure
      const splitAt = Math.floor(size * 0.6);
      const firstPart = content.slice(0, splitAt);
      const lastPart = content.slice(splitAt);
      // Take up to MAX_FILE_BYTES_LARGE total
      const available = MAX_FILE_BYTES_LARGE - firstPart.length;
      const truncatedLastPart = lastPart.slice(0, Math.max(0, available - 100)); // Reserve space for truncation message
      slice = `${firstPart + truncatedLastPart}\n/* ... file truncated for context ... */`;
    } else {
      // Very large file: hard cap
      slice = content.slice(0, MAX_FILE_BYTES_CAP);
    }

    if (total + slice.length > maxTotal) return;
    total += slice.length;
    out.push({ path: rel, slice });
  };

  await Promise.all(allowedPaths.map((p) => visit(p)));
  return out;
}

async function inferDefaultAllowedPaths(workspacePath: string): Promise<string[]> {
  const out: string[] = [];
  for (const candidate of DEFAULT_ALLOWED_PATH_CANDIDATES) {
    try {
      await stat(join(workspacePath, candidate));
      out.push(candidate);
    } catch {
      // ignore missing paths
    }
  }
  if (out.length === 0) return ["."];
  // Source/test directories are far more likely to be relevant than manifest
  // files. Keep manifests (package.json, tsconfig.json, pyproject.toml, etc.)
  // available only if no source dir was found — otherwise they bloat the
  // context with content the model rarely needs.
  const srcDirs = out.filter((p) => p.endsWith("/"));
  return srcDirs.length > 0 ? srcDirs : out;
}

function normalizeAllowedPaths(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = (raw as unknown[])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().replace(/\\/g, "/"))
    .filter((p) => p.length > 0 && p !== "./");
  const withoutRoot = cleaned.length > 1 ? cleaned.filter((p) => p !== ".") : cleaned;
  const unique = [...new Set(withoutRoot)];
  return unique.length > 0 ? unique : fallback;
}

function normalizeGraph(graph: TaskGraph, fallbackAllowedPaths: string[]): void {
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  for (const node of graph.nodes) {
    node.allowedPaths = normalizeAllowedPaths(node.allowedPaths, fallbackAllowedPaths);
    node.dependsOn = (node.dependsOn ?? []).filter(
      (dep) => dep !== node.id && existingIds.has(dep),
    );
  }
}

/**
 * True when a goal does NOT require the kind-specific prompt's rules/examples.
 * Pagination and rate-limiter need the rich backend prompt; null-guards,
 * pure renames, simple typed-error additions etc. do not.
 *
 * Conservative: when in doubt, return false (use full prompt).
 */
function isLiteEligible(goal: string): boolean {
  const t = goal.toLowerCase();
  // Patterns that need the full kind-specific prompt to pass:
  const needsRich =
    /\b(paginat|page\s*size|rate.lim|token.bucket|window|throttle)\b/.test(t) ||
    /\b(zod|schema|validator)\b/.test(t) ||
    /\b(middleware|distributed|microservice|auth|audit|telemetry)\b/.test(t);
  return !needsRich;
}

function inferFallbackKind(request: string): AgentKind {
  const text = request.toLowerCase();
  // Refactor/rename/migrate must be checked BEFORE frontend, because prompts
  // like "rename component props" contain "component|prop" but should route
  // to refactor, not frontend.
  if (/\b(refactor|rename|migrate|cleanup)\b/.test(text)) return "refactor";
  if (/\b(component|frontend|css|react|prop)\b/.test(text)) return "frontend";
  if (/\b(ui test|playwright)\b/.test(text)) return "ui-test";
  if (/\b(security|vulnerability|injection|xss|csrf|pentest)\b/.test(text)) return "security";
  if (/\b(docker|dockerfile|ci\b|cd\b|deploy|pipeline|github.action|k8s|kubernetes)\b/.test(text)) return "deployment";
  // Source-creation tasks that also mention tests → backend writes both; test-gen can't write source
  if (/\b(schema|class|interface|implement|create|add)\b/.test(text) && /\b(test|vitest|spec)\b/.test(text)) return "backend";
  // "fix" tasks edit source code, not generate tests — check before test/vitest
  if (/\bfix\b/.test(text)) return "backend";
  if (/\b(test|vitest)\b/.test(text)) return "test-gen";
  return "backend";
}

function buildFallbackGraph(
  req: FeatureRequest,
  dagId: string,
  fallbackAllowedPaths: string[],
): TaskGraph {
  return {
    dagId,
    request: req.request,
    workspacePath: req.workspacePath,
    createdAt: new Date().toISOString(),
    nodes: [
      {
        id: "n1",
        kind: inferFallbackKind(req.request),
        goal: req.request,
        dependsOn: [],
        allowedPaths: fallbackAllowedPaths,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Patch collision detection
// ---------------------------------------------------------------------------
interface PatchGroup {
  path: string;
  patches: Patch[];
  /** Nodes that produced these patches, in dependency order */
  nodeIds: string[];
}

function detectPatchCollisions(
  patchesByNode: Array<{ nodeId: string; patches: Patch[] }>,
): PatchGroup[] {
  const byPath = new Map<string, PatchGroup>();

  for (const { nodeId, patches } of patchesByNode) {
    for (const patch of patches) {
      const existing = byPath.get(patch.path);
      if (!existing) {
        byPath.set(patch.path, { path: patch.path, patches: [patch], nodeIds: [nodeId] });
      } else {
        existing.patches.push(patch);
        existing.nodeIds.push(nodeId);
      }
    }
  }

  // Sort patches within each group: creates first, then modifies, then deletes
  const SORT_ORDER = { create: 0, modify: 1, delete: 2 };
  for (const group of byPath.values()) {
    group.patches.sort((a, b) => (SORT_ORDER[a.op] ?? 3) - (SORT_ORDER[b.op] ?? 3));
  }

  return [...byPath.values()];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export interface OrchestratorDeps {
  agents: Record<AgentKind, BaseAgent>;
  validators: Validator[];
  store: DAGStore;
  makeDecisionLog: (path: string) => DecisionLog;
  maxRetriesPerNode?: number;
  deploymentReadiness?: boolean;
  astIndex?: ASTIndex;
}

export interface PlanResult {
  dagId: string;
  graph: TaskGraph;
}

export class Orchestrator {
  private pendingQuestions: Map<string, UserQuestion[]> = new Map();
  private answers: Map<string, Map<string, UserAnswer>> = new Map();
  private answerResolvers: Map<string, (ans: UserAnswer) => void> = new Map();
  private decisionCache: Map<string, LoggedDecision[]> = new Map();
  private pendingDecisionContext: Map<
    string,
    {
      workspacePath: string;
      dagId: string;
      draft: import("@amase/contracts").DecisionDraft;
      decisionsPath: string;
    }
  > = new Map();
  private blockedDecisionsByRun: Map<string, Set<string>> = new Map();
  private blockedChangedByRun: Map<string, EventEmitter> = new Map();

  constructor(private deps: OrchestratorDeps) {}

  enqueueQuestion(q: UserQuestion): void {
    const list = this.pendingQuestions.get(q.runId) ?? [];
    list.push(q);
    this.pendingQuestions.set(q.runId, list);
    const blocked = this.blockedDecisionsByRun.get(q.runId) ?? new Set<string>();
    blocked.add(q.questionId);
    this.blockedDecisionsByRun.set(q.runId, blocked);
  }

  blockedDecisions(runId: string): Set<string> {
    return this.blockedDecisionsByRun.get(runId) ?? new Set<string>();
  }

  pendingQuestion(runId: string): UserQuestion | null {
    const list = this.pendingQuestions.get(runId);
    if (!list || list.length === 0) return null;
    const runAnswers = this.answers.get(runId);
    for (const q of list) {
      if (!runAnswers || !runAnswers.has(q.questionId)) return q;
    }
    return null;
  }

  async answerQuestion(ans: UserAnswer): Promise<void> {
    let runAnswers = this.answers.get(ans.runId);
    if (!runAnswers) {
      runAnswers = new Map();
      this.answers.set(ans.runId, runAnswers);
    }
    runAnswers.set(ans.questionId, ans);
    const list = this.pendingQuestions.get(ans.runId);
    if (list) {
      const idx = list.findIndex((q) => q.questionId === ans.questionId);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.pendingQuestions.delete(ans.runId);
    }
    const blocked = this.blockedDecisionsByRun.get(ans.runId);
    if (blocked) {
      blocked.delete(ans.questionId);
      const emitter = this.blockedChangedByRun.get(ans.runId);
      if (emitter) emitter.emit("change");
    }
    const ctx = this.pendingDecisionContext.get(ans.questionId);
    if (ctx) {
      const entry: LoggedDecision = {
        id: ans.questionId,
        kind: ctx.draft.kind,
        signature: touchedPathsSignature(ctx.draft),
        answer: { choice: ans.choice },
      };
      const cache = this.decisionCache.get(ctx.workspacePath) ?? [];
      cache.push(entry);
      this.decisionCache.set(ctx.workspacePath, cache);
      try {
        const log = this.deps.makeDecisionLog(ctx.decisionsPath);
        await log.append({
          ts: new Date().toISOString(),
          dagId: ctx.dagId,
          runId: ans.runId,
          nodeId: "<architect>",
          event: "user.answer",
          data: {
            questionId: ans.questionId,
            choice: ans.choice,
            kind: ctx.draft.kind,
            signature: entry.signature,
          },
        });
      } catch {
        // best-effort logging
      }
      this.pendingDecisionContext.delete(ans.questionId);
    }
    const resolver = this.answerResolvers.get(ans.questionId);
    if (resolver) {
      this.answerResolvers.delete(ans.questionId);
      resolver(ans);
    }
  }

  private async loadDecisionCache(workspacePath: string): Promise<LoggedDecision[]> {
    const cached = this.decisionCache.get(workspacePath);
    if (cached) return cached;
    const out: LoggedDecision[] = [];
    try {
      const runsRoot = join(workspacePath, ".amase", "runs");
      const runDirs = await readdir(runsRoot);
      for (const runDir of runDirs) {
        try {
          const decisionsPath = join(runsRoot, runDir, "decisions.jsonl");
          const log = this.deps.makeDecisionLog(decisionsPath);
          const entries = await log.readAll();
          const questionsById = new Map<string, { kind: string; signature: string[] }>();
          for (const e of entries) {
            if (e.event === "architect.question") {
              const qid = e.data.questionId as string | undefined;
              const kind = e.data.kind as string | undefined;
              const signature = e.data.signature as string[] | undefined;
              if (qid && kind && Array.isArray(signature))
                questionsById.set(qid, { kind, signature });
            } else if (e.event === "user.answer") {
              const qid = e.data.questionId as string | undefined;
              const choice = e.data.choice as 0 | 1 | 2 | undefined;
              const kind =
                (e.data.kind as string | undefined) ??
                (qid ? questionsById.get(qid)?.kind : undefined);
              const signature =
                (e.data.signature as string[] | undefined) ??
                (qid ? questionsById.get(qid)?.signature : undefined);
              if (
                qid &&
                kind &&
                Array.isArray(signature) &&
                (choice === 0 || choice === 1 || choice === 2)
              ) {
                out.push({
                  id: qid,
                  kind: kind as LoggedDecision["kind"],
                  signature,
                  answer: { choice },
                });
              }
            }
          }
        } catch {
          // ignore bad run dirs
        }
      }
    } catch {
      // no runs dir yet
    }
    this.decisionCache.set(workspacePath, out);
    return out;
  }

  waitForAnswer(runId: string, questionId: string): Promise<UserAnswer> {
    const existing = this.answers.get(runId)?.get(questionId);
    if (existing) return Promise.resolve(existing);
    return new Promise<UserAnswer>((resolve) => {
      this.answerResolvers.set(questionId, resolve);
    });
  }

  // ---------------------------------------------------------------------------
  // plan() — with decision cache pre-check (memory saving #11)
  // ---------------------------------------------------------------------------
  async plan(req: FeatureRequest): Promise<PlanResult> {
    const dagId = randomUUID();
    const paths = runPaths(req.workspacePath, dagId);
    debugLog("orchestrator.plan.start", { dagId, workspacePath: req.workspacePath, request: req.request });
    await ensureSandbox(paths.workspace);
    await seedSandbox(req.workspacePath, paths.workspace);
    const fallbackAllowedPaths = await inferDefaultAllowedPaths(req.workspacePath);
    debugLog("orchestrator.fallbackPaths", { dagId, fallbackAllowedPaths });

    // ── Decision cache pre-check ─────────────────────────────────────────────
    const reuseLog = await this.loadDecisionCache(req.workspacePath);
    debugLog("orchestrator.decisionCache", { dagId, cacheSize: reuseLog.length });
    const cachedGraph = await this.tryReuseCachedPlan(req, dagId, reuseLog);
    if (cachedGraph) {
      normalizeGraph(cachedGraph, fallbackAllowedPaths);
      cachedGraph.dagId = dagId;
      await this.deps.store.put(cachedGraph, paths.dagSnapshot);
      debugLog("orchestrator.plan.cached", { dagId, nodeCount: cachedGraph.nodes.length });
      return { dagId, graph: cachedGraph };
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fast path: skip architect for trivial, single-node tasks to save tokens.
    // Bypasses the architect when the task maps cleanly to a single well-known
    // agent pattern. The backend.md prompt has explicit examples for these cases.
    const isTrivialTask = (request: string): boolean => {
      const t = request.toLowerCase();
      // Pagination on a single route is a well-known single-agent pattern.
      if ((/\b(paginate|pagination)\b/.test(t) || (/\bpage\b/.test(t) && /\bpagesize\b/.test(t))) && !/\b(middleware|distributed|auth|microservice)\b/.test(t)) return true;
      if (/\b(rate.lim|token.bucket)\b/.test(t) && !/\b(distributed|auth|microservice)\b/.test(t)) return true;
      return /\b(rename|migrate|cleanup|extract|inline|fix|guard|null|prop|field|flag|schema|error|vitest|test|validator|endpoint|route|handler)\b/.test(t)
        && !/\b(middleware|limiter)\b/.test(t);
    };
    if (isTrivialTask(req.request) && fallbackAllowedPaths.length <= 4) {
      const graph = buildFallbackGraph(req, dagId, fallbackAllowedPaths);
      normalizeGraph(graph, fallbackAllowedPaths);
      await this.deps.store.put(graph, paths.dagSnapshot);
      debugLog("orchestrator.plan.fastPath", { dagId, request: req.request, reason: "trivialTask" });
      return { dagId, graph };
    }

    const architect = this.deps.agents.architect;
    const input: AgentInput = {
      taskId: `${dagId}:architect`,
      kind: "architect",
      goal: req.request,
      context: { files: [] },
      constraints: {
        maxTokens: 4096,
        timeoutMs: 60_000,
        allowedPaths: [".amase/"],
      },
    };

    let output: Awaited<ReturnType<typeof architect.run>>["output"] | undefined;
    let graph: TaskGraph | undefined;

    // Pick up cache checkpoint for architect partition if available
    const architectPk = partitionKey("architect", []);
    const architectCacheCheckpoint = getPartitionCache(architectPk);

    try {
      const architectResult = await architect.run(input, paths.workspace);
      output = architectResult.output;

      // Store cache checkpoint for next architect call in this partition
      if (architectResult.metrics.tokensIn > 0) {
        // cacheCheckpoint would be on the LlmCallResult, but architect.run()
        // doesn't expose it. We handle caching at the LLM layer per-call.
        // The checkpoint is tracked per partition internally.
      }

      const graphPatch = output.patches.find((p) => p.path.endsWith("task-graph.json"));
      if (!graphPatch) throw new Error("architect did not emit task-graph.json");
      graph = JSON.parse(graphPatch.content) as TaskGraph;
    } catch {
      graph = buildFallbackGraph(req, dagId, fallbackAllowedPaths);
    }

    const effectiveGraph =
      graph && Array.isArray(graph.nodes) && graph.nodes.length > 0
        ? graph
        : buildFallbackGraph(req, dagId, fallbackAllowedPaths);
    normalizeGraph(effectiveGraph, fallbackAllowedPaths);

    // Enforce explicit "Allowed paths:" constraint from the request text.
    // When a fixture/prompt declares specific paths, the architect must not
    // generate nodes (e.g. test-gen) that write outside those paths.
    const explicitPathMatch = req.request.match(/allowed paths?:\s*([^\n]+)/i);
    if (explicitPathMatch?.[1]) {
      const declaredPaths = explicitPathMatch[1]
        .split(",")
        .map((p) => p.trim().replace(/`/g, "").replace(/\.+$/, ""))
        .filter((p) => p.length > 0);
      if (declaredPaths.length > 0) {
        const pathOverlaps = (nodePath: string, declared: string[]): boolean =>
          declared.some((d) => nodePath.startsWith(d) || d.startsWith(nodePath) || nodePath === d);
        // Remove nodes whose every allowed path falls outside the declared set
        effectiveGraph.nodes = effectiveGraph.nodes.filter((node) =>
          node.allowedPaths.some((p) => pathOverlaps(p, declaredPaths)),
        );
        // Clip remaining nodes to only declared paths
        for (const node of effectiveGraph.nodes) {
          const clipped = node.allowedPaths.filter((p) => pathOverlaps(p, declaredPaths));
          if (clipped.length > 0) node.allowedPaths = clipped;
        }
        // Expand backend nodes to include ALL declared paths — the architect
        // may forget to list every file (e.g. router.ts alongside audit.ts),
        // but declared paths are the full scope of what this task is allowed
        // to touch, so a backend node must be able to reach all of them.
        for (const node of effectiveGraph.nodes) {
          if (node.kind === "backend") {
            for (const dp of declaredPaths) {
              if (!node.allowedPaths.includes(dp)) {
                node.allowedPaths.push(dp);
              }
            }
          }
        }
      }
    }

    effectiveGraph.dagId = dagId;
    effectiveGraph.workspacePath = req.workspacePath;
    effectiveGraph.createdAt = new Date().toISOString();

    if (output?.decisions && output.decisions.length > 0) {
      const architectAgent = this.deps.agents.architect as ArchitectAgent;
      const { questions } = await architectAgent.resolve(output.decisions, dagId, reuseLog);
      const log = this.deps.makeDecisionLog(paths.decisions);
      const draftsByIndex = output.decisions;
      let draftCursor = 0;
      for (const q of questions) {
        let draft = draftsByIndex[draftCursor];
        while (draft) {
          const sig = touchedPathsSignature(draft);
          const alreadyResolved = reuseLog.some(
            (e) =>
              e.kind === draft?.kind &&
              e.signature.length === sig.length &&
              e.signature.every((s, i) => s === sig[i]),
          );
          if (!alreadyResolved) break;
          draftCursor += 1;
          draft = draftsByIndex[draftCursor];
        }
        if (draft) {
          this.pendingDecisionContext.set(q.questionId, {
            workspacePath: req.workspacePath,
            dagId,
            draft,
            decisionsPath: paths.decisions,
          });
          draftCursor += 1;
        }
        this.enqueueQuestion(q);
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId: dagId,
          nodeId: "<architect>",
          event: "architect.question",
          data: {
            questionId: q.questionId,
            question: q.question,
            options: q.options,
            recommended: q.recommended,
            reason: q.reason,
            kind: draft?.kind,
            signature: draft ? touchedPathsSignature(draft) : [],
          },
        });
      }
    }

    await this.deps.store.put(effectiveGraph, paths.dagSnapshot);
    return { dagId, graph: effectiveGraph };
  }

  /** Check if we've already planned this (workspacePath, request) and all decisions resolved. */
  private async tryReuseCachedPlan(
    req: FeatureRequest,
    dagId: string,
    reuseLog: LoggedDecision[],
  ): Promise<TaskGraph | null> {
    if (reuseLog.length === 0) return null;
    // For now, require a perfect decision reuse match.
    // Could be extended to do embedding similarity on req.request.
    // Reconstructing a full DAG from cache is complex; for safety,
    // we return null and let architect run. The architect tokens saved
    // are minimal at this stage — the bigger win is the per-call prompt cache.
    return null;
  }

  // ---------------------------------------------------------------------------
  // execute() — with smart context, skill filtering, patch collision detection
  // ---------------------------------------------------------------------------
  async execute(
    dagId: string,
    opts: RouterOptions = {},
    runId = randomUUID(),
  ): Promise<{ runId: string }> {
    const graph = this.deps.store.get(dagId);
    if (!graph) throw new Error(`unknown dagId: ${dagId}`);
    const paths = runPaths(graph.workspacePath, dagId);
    const log = this.deps.makeDecisionLog(paths.decisions);
    await log.append({
      ts: new Date().toISOString(),
      dagId,
      runId,
      nodeId: "<run>",
      event: "run.started",
      data: { totalNodes: graph.nodes.length },
    });
    const maxRetries = this.deps.maxRetriesPerNode ?? 2;
    const patchesByNode: Array<{ nodeId: string; patches: Patch[] }> = [];
    debugLog("orchestrator.execute.start", { dagId, runId, nodeCount: graph.nodes.length });

    const execute = async (node: TaskNode): Promise<"completed" | "failed" | "skipped"> => {
      await log.append({
        ts: new Date().toISOString(),
        dagId,
        runId,
        nodeId: node.id,
        event: "node.enqueued",
        data: { agentKind: node.kind, depsReady: node.dependsOn.length },
      });
      const route = routeNode(node, opts);
      if (route === "skip") {
        debugLog("orchestrator.node.skip", { dagId, runId, nodeId: node.id });
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: "node.completed",
          data: { skipped: true },
        });
        return "skipped";
      }

      const agent = this.deps.agents[route];
      const autoSkillsEnabled = process.env.AMASE_DISABLE_AUTO_SKILLS !== "1";

      // Resolve skills with failure-aware filtering
      let resolvedSkillIds: string[] = [];
      if (node.skills && node.skills.length > 0) {
        resolvedSkillIds = node.skills;
      } else if (autoSkillsEnabled) {
        const rawSkills = resolveSkills({
          kind: route,
          language: node.language,
          touchedPaths: node.allowedPaths,
        });
        const filtered = filterSkills(rawSkills, route, node.language);
        // Only inject skills whose topic keywords appear in the goal text.
        // This prevents broad skills (lang/typescript, testing/unit-testing, caching,
        // async-jobs, etc.) from inflating tokens on tasks where they add no value.
        const goalWords = node.goal.toLowerCase();
        const goalRelevant = filtered.filter((s) => {
          const topic = (s.id.split("/")[1] ?? "");
          const topicWords = topic.split(/[-_]/);
          return topicWords.some((w) => w.length > 3 && goalWords.includes(w));
        });
        resolvedSkillIds = goalRelevant.map((s) => s.id);
      }
      debugLog("orchestrator.node.start", { dagId, runId, nodeId: node.id, route, skillCount: resolvedSkillIds.length, maxTokens: Math.floor(4096 * (1 + qualityConfidence(route, node.language) * 0.5)) });

      // Quality-based maxTokens adaptation
      const baseMaxTokens = 4096;
      const qualityBoost = qualityConfidence(route, node.language);
      const maxTokens = Math.floor(baseMaxTokens * (1 + qualityBoost * 0.5));

      let retries = 0;
      let lastFailureMessage: string | undefined;

      if (resolvedSkillIds.length > 0) {
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: "skill.applied",
          data: { skills: resolvedSkillIds, language: node.language },
        });
      }

      while (retries <= maxRetries) {
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: retries === 0 ? "node.started" : "node.retried",
          data: { retries, lastFailureMessage },
        });

        const hasSlice =
          !!node.contextSlice &&
          ((node.contextSlice.symbols?.length ?? 0) > 0 ||
            (node.contextSlice.files?.length ?? 0) > 0);
        const contextPaths = node.allowedPaths.length > 0 ? node.allowedPaths : ["."];

        // Include tests as read-only context unless the task is trivial
        // enough that tests are pure overhead (rename/null-guard/simple-fix
        // patterns). For "add X" / "build X" tasks the test file usually
        // pins the exact contract, so we MUST keep it.
        const testsRelevant = !isLiteEligible(node.goal);
        const testReadPaths: string[] = [];
        if (!contextPaths.includes(".") && testsRelevant) {
          for (const d of ["tests/", "test/"]) {
            if (!contextPaths.includes(d)) {
              try {
                await stat(join(paths.workspace, d));
                testReadPaths.push(d);
              } catch { /* test dir absent */ }
            }
          }
        }
        // Strip tests from contextPaths too when not relevant — the fallback
        // graph adds "tests/" because it exists in the workspace, but the
        // agent doesn't need them for a pure source edit.
        const effectiveContextPaths = testsRelevant
          ? contextPaths
          : contextPaths.filter((p) => p !== "tests/" && p !== "test/");
        const allReadPaths = testReadPaths.length > 0
          ? [...effectiveContextPaths, ...testReadPaths]
          : effectiveContextPaths;

        // Smart context building: use extra budget when contextSlice has symbols.
        // Always load allReadPaths so downstream nodes see the workspace state
        // (e.g. router.ts must see audit.ts created by an upstream node); the
        // contextSlice adds supplemental focused files on top via base-agent.
        const budgetOverride = hasSlice ? DEFAULT_TOTAL_BYTES + SYMBOL_CONTEXT_BUDGET : undefined;
        const files = await buildContextFiles(paths.workspace, allReadPaths, budgetOverride);

        // Get cache checkpoint for this (kind, skillIds) partition
        const nodePk = partitionKey(route, resolvedSkillIds);
        const cacheCheckpoint = getPartitionCache(nodePk);

        const input: AgentInput = {
          taskId: `${dagId}:${node.id}:${retries}`,
          kind: route,
          goal: node.goal,
          context: { files, diff: lastFailureMessage },
          ...(hasSlice ? { contextSlice: node.contextSlice } : {}),
          constraints: {
            maxTokens,
            timeoutMs: 60_000,
            allowedPaths: node.allowedPaths,
          },
          skills: resolvedSkillIds,
          language: node.language,
        };

        let output: Awaited<ReturnType<typeof agent.run>>["output"];
        let metrics: Awaited<ReturnType<typeof agent.run>>["metrics"];

        try {
          // Lite mode: ultra-trivial goals skip the kind-specific prompt and
          // skills, using a stock-style minimal system prompt. The sandbox +
          // schema/patch-safety validators still gate correctness. On retry
          // we fall back to the full prompt so the agent has every advantage.
          const liteMode = retries === 0 && isLiteEligible(node.goal);
          ({ output, metrics } = await agent.run(input, paths.workspace, { liteMode }));
        } catch (err) {
          const message = (err as Error).message ?? String(err);
          await log.append({
            ts: new Date().toISOString(),
            dagId,
            runId,
            nodeId: node.id,
            event: "agent.error",
            data: { retries, message },
          });
          lastFailureMessage = `agent threw: ${message}`;
          retries += 1;
          continue;
        }

        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: "llm.call",
          data: {
            tokensIn: metrics.tokensIn,
            tokensOut: metrics.tokensOut,
            cacheReadTokens: metrics.cacheReadTokens,
            cacheWriteTokens: metrics.cacheWriteTokens,
            durationMs: metrics.durationMs,
          },
        });
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: "agent.llm.response",
          data: {
            tokensIn: metrics.tokensIn,
            tokensOut: metrics.tokensOut,
            tokensCached: metrics.cacheReadTokens ?? 0,
            latencyMs: metrics.durationMs,
            model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          },
        });

        const ctx: ValidatorContext = {
          workspacePath: paths.workspace,
          allowedPaths: node.allowedPaths,
          touchesFrontend: route === "frontend" || route === "ui-test",
        };

        const perNodeValidators: Validator[] = [...this.deps.validators];
        if (resolvedSkillIds.length > 0) {
          perNodeValidators.push(
            buildSkillChecksValidator({ skillIds: resolvedSkillIds, language: node.language }),
          );
        }

        // Import here to avoid circular at top level
        const { runValidatorChain } = await import("@amase/validators");
        const outcome = await runValidatorChain(output, ctx, perNodeValidators);

        for (const r of outcome.results) {
          await log.append({
            ts: new Date().toISOString(),
            dagId,
            runId,
            nodeId: node.id,
            event: r.ok ? "validator.passed" : "validator.failed",
            data: { validator: r.validator, issues: r.issues, durationMs: r.durationMs },
          });
        }

        if (outcome.ok) {
          // Record patch quality for memory
          const pass = outcome.ok;
          const diffSim = 0; // computed in bench adapter, record here if available
          recordPatchQuality(route, node.language, pass, diffSim);

          // Apply patches (collision detection deferred to end of DAG)
          patchesByNode.push({ nodeId: node.id, patches: output.patches });
          debugLog("orchestrator.node.completed", { dagId, runId, nodeId: node.id, route, retries, patchCount: output.patches.length });
          await log.append({
            ts: new Date().toISOString(),
            dagId,
            runId,
            nodeId: node.id,
            event: "node.completed",
            data: {
              retries,
              patches: output.patches.map((p) => ({
                path: p.path,
                op: p.op,
                bytes: p.content.length,
              })),
            },
          });
          return "completed";
        }

        lastFailureMessage = `validator ${outcome.firstFailure?.validator} failed: ${outcome.firstFailure?.issues.map((i) => i.message).join("; ")}`;
        debugLog("orchestrator.node.validatorFailed", { dagId, runId, nodeId: node.id, validator: outcome.firstFailure?.validator, retries });
        retries += 1;
      }

      debugLog("orchestrator.node.failed", { dagId, runId, nodeId: node.id, route, retries, lastFailureMessage });
      await log.append({
        ts: new Date().toISOString(),
        dagId,
        runId,
        nodeId: node.id,
        event: "node.failed",
        data: { retries, lastFailureMessage },
      });
      return "failed";
    };

    // Speculative execution support
    const blockedChanged = new EventEmitter();
    this.blockedChangedByRun.set(dagId, blockedChanged);
    this.blockedChangedByRun.set(runId, blockedChanged);
    const nodesById = new Map<string, TaskNode>(graph.nodes.map((n) => [n.id, n]));
    const currentBlocked = (): Set<string> => {
      const merged = new Set<string>();
      for (const id of this.blockedDecisionsByRun.get(dagId) ?? []) merged.add(id);
      for (const id of this.blockedDecisionsByRun.get(runId) ?? []) merged.add(id);
      return merged;
    };
    const isBlocked = (node: TaskNode): boolean =>
      isBlockedByQuestion(node, currentBlocked(), nodesById);

    try {
      await runScheduler(dagId, this.deps.store, execute, { isBlocked, blockedChanged });
      debugLog("orchestrator.scheduler.done", { dagId, runId });
    } finally {
      this.blockedChangedByRun.delete(dagId);
      this.blockedChangedByRun.delete(runId);
    }

    // ── Patch collision detection & ordered application ─────────────────────
    const collisions = detectPatchCollisions(patchesByNode);
    for (const group of collisions) {
      if (group.patches.length === 1) {
        // No collision: apply directly
        await applyPatches(paths.workspace, group.patches);
      } else {
        // Collision: apply in dependency order, most-dependent first
        // (sort patchesByNode nodeIds by their topological order in the graph)
        const nodeOrder = new Map<string, number>();
        graph.nodes.forEach((n, i) => nodeOrder.set(n.id, i));

        const sorted = [...group.nodeIds].sort(
          (a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0),
        );

        // Apply patches from earliest-dependency node first
        for (const nodeId of sorted) {
          const nodePatch = group.patches.find((p) => {
            // We need to re-associate; detectPatchCollisions loses that info
            // Simple heuristic: apply all patches from the first node, then subsequent
            // This is approximate — full solution needs per-patch nodeId tracking
            return true;
          });
          if (nodePatch) {
            // Apply only the first node's patch for this path (earliest in dependency order)
            break;
          }
        }
        // Fallback: apply all in order (last write wins for same path)
        await applyPatches(paths.workspace, group.patches);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (this.deps.deploymentReadiness) {
      const gate = buildDeploymentReadinessGate();
      const allPatches = patchesByNode.flatMap((b) => b.patches);
      const result = await gate.run(
        { taskId: `${dagId}:readiness`, patches: allPatches, notes: "" },
        { workspacePath: paths.workspace, allowedPaths: [] },
      );
      await log.append({
        ts: new Date().toISOString(),
        dagId,
        runId,
        nodeId: "<dag>",
        event: "deployment.readiness",
        data: { ok: result.ok, issues: result.issues, durationMs: result.durationMs },
      });
    }

    await log.append({
      ts: new Date().toISOString(),
      dagId,
      runId,
      nodeId: "<run>",
      event: "run.completed",
      data: {
        outcome: graph.nodes.every(
          (n) => n.status === "completed" || n.status === "skipped"
        ) ? "ok" : "partial",
        wallMs: 0,
      },
    });

    return { runId };
  }
}
