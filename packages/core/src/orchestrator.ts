import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Stats } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ArchitectAgent, BaseAgent } from "@amase/agents";
import type {
  AgentInput,
  FeatureRequest,
  Patch,
  TaskGraph,
  TaskNode,
  UserAnswer,
  UserQuestion,
} from "@amase/contracts";
import type { AgentKind } from "@amase/contracts";
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
  runValidatorChain,
} from "@amase/validators";
import { type RouterOptions, routeNode } from "./router.js";
import { applyPatches, ensureSandbox, seedSandbox } from "./sandbox.js";
import { runScheduler } from "./scheduler.js";
import { isBlockedByQuestion } from "./speculative.js";

const MAX_FILE_BYTES = 8_000;
const MAX_TOTAL_BYTES = 24_000;

async function buildContextFiles(
  workspace: string,
  allowedPaths: string[],
): Promise<Array<{ path: string; slice: string }>> {
  const out: Array<{ path: string; slice: string }> = [];
  let total = 0;
  const visit = async (rel: string): Promise<void> => {
    const abs = join(workspace, rel);
    let s: Stats;
    try {
      s = await stat(abs);
    } catch {
      return;
    }
    if (s.isDirectory()) {
      const names = await readdir(abs);
      for (const name of names) {
        if (name === "node_modules" || name === ".amase" || name.startsWith(".git")) continue;
        await visit(relative(workspace, join(abs, name)).replace(/\\/g, "/"));
        if (total >= MAX_TOTAL_BYTES) return;
      }
      return;
    }
    if (!s.isFile()) return;
    const content = await readFile(abs, "utf8").catch(() => "");
    if (!content) return;
    const slice = content.length > MAX_FILE_BYTES ? content.slice(0, MAX_FILE_BYTES) : content;
    if (total + slice.length > MAX_TOTAL_BYTES) return;
    total += slice.length;
    out.push({ path: rel, slice });
  };
  for (const p of allowedPaths) {
    if (total >= MAX_TOTAL_BYTES) break;
    await visit(p);
  }
  return out;
}

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

  /** Current set of questionIds that are still unanswered for the given run. */
  blockedDecisions(runId: string): Set<string> {
    return this.blockedDecisionsByRun.get(runId) ?? new Set<string>();
  }

  pendingQuestion(runId: string): UserQuestion | null {
    const list = this.pendingQuestions.get(runId);
    if (!list || list.length === 0) return null;
    const runAnswers = this.answers.get(runId);
    for (const q of list) {
      if (!runAnswers || !runAnswers.has(q.questionId)) {
        return q;
      }
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
              if (qid && kind && Array.isArray(signature)) {
                questionsById.set(qid, { kind, signature });
              }
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

  async plan(req: FeatureRequest): Promise<PlanResult> {
    const dagId = randomUUID();
    const paths = runPaths(req.workspacePath, dagId);
    await ensureSandbox(paths.workspace);
    await seedSandbox(req.workspacePath, paths.workspace);

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
    const { output } = await architect.run(input);
    const graphPatch = output.patches.find((p) => p.path.endsWith("task-graph.json"));
    if (!graphPatch) throw new Error("architect did not emit task-graph.json");
    const graph = JSON.parse(graphPatch.content) as TaskGraph;
    graph.dagId = dagId;
    graph.workspacePath = req.workspacePath;
    graph.createdAt = new Date().toISOString();

    if (output.decisions && output.decisions.length > 0) {
      const architectAgent = this.deps.agents.architect as ArchitectAgent;
      const reuseLog = await this.loadDecisionCache(req.workspacePath);
      const { questions } = await architectAgent.resolve(output.decisions, dagId, reuseLog);
      const log = this.deps.makeDecisionLog(paths.decisions);
      const draftsByIndex = output.decisions;
      let draftCursor = 0;
      for (const q of questions) {
        // find the first remaining draft whose reuse lookup would miss; that's this question's draft.
        // simple heuristic: advance cursor and pick the next unmatched draft.
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

    await this.deps.store.put(graph, paths.dagSnapshot);
    return { dagId, graph };
  }

  async execute(dagId: string, opts: RouterOptions = {}): Promise<{ runId: string }> {
    const runId = randomUUID();
    const graph = this.deps.store.get(dagId);
    if (!graph) throw new Error(`unknown dagId: ${dagId}`);
    const paths = runPaths(graph.workspacePath, dagId);
    const log = this.deps.makeDecisionLog(paths.decisions);
    const maxRetries = this.deps.maxRetriesPerNode ?? 2;
    const appliedPatches: Patch[] = [];

    const execute = async (node: TaskNode): Promise<"completed" | "failed" | "skipped"> => {
      const route = routeNode(node, opts);
      if (route === "skip") {
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
      const resolvedSkills =
        node.skills && node.skills.length > 0
          ? node.skills
          : resolveSkills({
              kind: route,
              language: node.language,
              touchedPaths: node.allowedPaths,
            }).map((s) => s.id);
      let retries = 0;
      let lastFailureMessage: string | undefined;

      if (resolvedSkills.length > 0) {
        await log.append({
          ts: new Date().toISOString(),
          dagId,
          runId,
          nodeId: node.id,
          event: "skill.applied",
          data: { skills: resolvedSkills, language: node.language },
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
        const files = hasSlice ? [] : await buildContextFiles(paths.workspace, ["."]);
        const input: AgentInput = {
          taskId: `${dagId}:${node.id}:${retries}`,
          kind: route,
          goal: node.goal,
          context: { files, diff: lastFailureMessage },
          ...(hasSlice ? { contextSlice: node.contextSlice } : {}),
          constraints: {
            maxTokens: 4096,
            timeoutMs: 60_000,
            allowedPaths: node.allowedPaths,
          },
          skills: resolvedSkills,
          language: node.language,
        };

        let output: Awaited<ReturnType<typeof agent.run>>["output"];
        let metrics: Awaited<ReturnType<typeof agent.run>>["metrics"];
        try {
          ({ output, metrics } = await agent.run(input, paths.workspace));
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
            durationMs: metrics.durationMs,
          },
        });

        const ctx: ValidatorContext = {
          workspacePath: paths.workspace,
          allowedPaths: node.allowedPaths,
          touchesFrontend: route === "frontend" || route === "ui-test",
        };
        const perNodeValidators: Validator[] = [...this.deps.validators];
        if (resolvedSkills.length > 0) {
          perNodeValidators.push(
            buildSkillChecksValidator({ skillIds: resolvedSkills, language: node.language }),
          );
        }
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
          await applyPatches(paths.workspace, output.patches);
          appliedPatches.push(...output.patches);
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

        lastFailureMessage = `validator ${outcome.firstFailure?.validator} failed: ${outcome.firstFailure?.issues
          .map((i) => i.message)
          .join("; ")}`;
        retries += 1;
      }

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

    // Speculative execution: skip nodes whose transitive deps include an
    // unanswered decision, while letting unblocked siblings run. Questions
    // enqueued during plan() use dagId as their runId, so we union both
    // dagId- and runId-keyed blocked sets.
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
      await runScheduler(dagId, this.deps.store, execute, {
        isBlocked,
        blockedChanged,
      });
    } finally {
      this.blockedChangedByRun.delete(dagId);
      this.blockedChangedByRun.delete(runId);
    }

    if (this.deps.deploymentReadiness) {
      const gate = buildDeploymentReadinessGate();
      const result = await gate.run(
        { taskId: `${dagId}:readiness`, patches: appliedPatches, notes: "" },
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

    return { runId };
  }
}
