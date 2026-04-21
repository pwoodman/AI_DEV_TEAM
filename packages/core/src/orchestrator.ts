import { randomUUID } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  type AgentInput,
  type FeatureRequest,
  type Patch,
  type TaskGraph,
  type TaskNode,
} from "@amase/contracts";
import type { BaseAgent } from "@amase/agents";
import type { AgentKind } from "@amase/contracts";
import { DAGStore, DecisionLog, runPaths } from "@amase/memory";
import { resolveSkills } from "@amase/skills";
import {
  buildDeploymentReadinessGate,
  buildSkillChecksValidator,
  type Validator,
  type ValidatorContext,
  runValidatorChain,
} from "@amase/validators";
import { routeNode, type RouterOptions } from "./router.js";
import { applyPatches, ensureSandbox, seedSandbox } from "./sandbox.js";
import { runScheduler } from "./scheduler.js";

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
    let s;
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
}

export interface PlanResult {
  dagId: string;
  graph: TaskGraph;
}

export class Orchestrator {
  constructor(private deps: OrchestratorDeps) {}

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
      const resolvedSkills = (node.skills && node.skills.length > 0)
        ? node.skills
        : resolveSkills({ kind: route, language: node.language, touchedPaths: node.allowedPaths }).map((s) => s.id);
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

        const files = await buildContextFiles(paths.workspace, ["."]);
        const input: AgentInput = {
          taskId: `${dagId}:${node.id}:${retries}`,
          kind: route,
          goal: node.goal,
          context: { files, diff: lastFailureMessage },
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
          ({ output, metrics } = await agent.run(input));
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
            data: { retries, patches: output.patches.map((p) => ({ path: p.path, op: p.op, bytes: p.content.length })) },
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

    await runScheduler(dagId, this.deps.store, execute);

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
