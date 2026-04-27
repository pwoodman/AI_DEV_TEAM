#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildAgentRegistry } from "@amase/agents";
import type { AgentKind, DecisionLogEntry, Language } from "@amase/contracts";
import { Orchestrator } from "@amase/core";
import { AnthropicClient, type LlmClient, StubLlmClient } from "@amase/llm";
import { DAGStore, DecisionLog, runPaths } from "@amase/memory";
import { ALL_SKILLS, resolveSkills } from "@amase/skills";
import {
  type Validator,
  buildSecurityValidator,
  langAdapterValidator,
  patchSafetyValidator,
  schemaValidator,
  uiTestsValidator,
} from "@amase/validators";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerQuestionTools } from "./question-tools.js";

function buildLlm(): LlmClient {
  if (process.env.AMASE_LLM_STUB === "1") {
    return buildStubLlm();
  }
  return new AnthropicClient();
}

function buildStubLlm(): LlmClient {
  return new StubLlmClient(async (req) => {
    if (process.env.AMASE_STUB_FIXTURE) {
      return await readFile(process.env.AMASE_STUB_FIXTURE, "utf8");
    }
    const systemText =
      typeof req.system === "string" ? req.system : req.system.map((b) => b.text).join("\n");
    const isArchitect = systemText.includes("Architect Agent");
    if (isArchitect) {
      const workspacePath = req.user.match(/"workspacePath":\s*"([^"]*)"/)?.[1] ?? ".";
      return JSON.stringify({
        taskId: "bootstrap",
        patches: [
          {
            path: ".amase/task-graph.json",
            op: "create",
            content: JSON.stringify({
              dagId: "stub",
              request: "stub",
              workspacePath,
              createdAt: new Date().toISOString(),
              nodes: [
                {
                  id: "n1",
                  kind: "backend",
                  goal: "stub backend",
                  dependsOn: [],
                  allowedPaths: ["src/"],
                },
              ],
            }),
          },
        ],
        notes: "stub plan",
      });
    }
    return JSON.stringify({
      taskId: "t",
      patches: [{ path: "src/stub.ts", op: "create", content: "export const x = 1;\n" }],
      notes: "stub exec",
    });
  });
}

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

interface ActiveRun {
  dagId: string;
  state: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

interface NodeRuntimeMetrics {
  retries: number;
  tokensIn: number;
  tokensOut: number;
}

interface ArtifactPatchSummary {
  nodeId: string;
  path: string;
  op: "create" | "modify" | "delete";
  bytes: number;
}

function aggregateNodeMetrics(entries: DecisionLogEntry[]): Map<string, NodeRuntimeMetrics> {
  const byNode = new Map<string, NodeRuntimeMetrics>();
  const ensure = (nodeId: string): NodeRuntimeMetrics => {
    const existing = byNode.get(nodeId);
    if (existing) return existing;
    const created: NodeRuntimeMetrics = { retries: 0, tokensIn: 0, tokensOut: 0 };
    byNode.set(nodeId, created);
    return created;
  };

  for (const entry of entries) {
    if (entry.nodeId.startsWith("<")) continue;
    if (entry.event === "node.retried") {
      ensure(entry.nodeId).retries += 1;
      continue;
    }
    if (entry.event === "llm.call") {
      const m = ensure(entry.nodeId);
      const tokensIn = typeof entry.data.tokensIn === "number" ? entry.data.tokensIn : 0;
      const tokensOut = typeof entry.data.tokensOut === "number" ? entry.data.tokensOut : 0;
      m.tokensIn += tokensIn;
      m.tokensOut += tokensOut;
    }
  }

  return byNode;
}

function collectPatchSummaries(entries: DecisionLogEntry[]): ArtifactPatchSummary[] {
  const out: ArtifactPatchSummary[] = [];
  for (const entry of entries) {
    if (entry.event !== "node.completed") continue;
    const patches = entry.data.patches;
    if (!Array.isArray(patches)) continue;
    for (const raw of patches) {
      if (!raw || typeof raw !== "object") continue;
      const patch = raw as { path?: unknown; op?: unknown; bytes?: unknown };
      if (typeof patch.path !== "string") continue;
      if (patch.op !== "create" && patch.op !== "modify" && patch.op !== "delete") continue;
      out.push({
        nodeId: entry.nodeId,
        path: patch.path,
        op: patch.op,
        bytes: typeof patch.bytes === "number" ? patch.bytes : 0,
      });
    }
  }
  return out;
}

const llm = buildLlm();
const agents = buildAgentRegistry(llm);
const store = new DAGStore();
const activeRuns = new Map<string, ActiveRun>();

const orchestrator = new Orchestrator({
  agents,
  validators: buildValidators(),
  store,
  makeDecisionLog: (p) => new DecisionLog(p),
  deploymentReadiness: process.env.AMASE_DEPLOYMENT_READINESS !== "0",
});

const server = new McpServer({ name: "amase", version: "0.1.0" });

server.tool(
  "amase_plan",
  "Decompose a feature request into a DAG of tasks. Returns dagId + nodes.",
  {
    request: z.string().min(1),
    workspacePath: z.string().min(1),
  },
  async ({ request, workspacePath }) => {
    const { dagId, graph } = await orchestrator.plan({ request, workspacePath });
    return {
      content: [{ type: "text", text: JSON.stringify({ dagId, nodes: graph.nodes }, null, 2) }],
    };
  },
);

server.tool(
  "amase_execute",
  "Execute a planned DAG. Returns runId immediately; poll amase_status.",
  {
    dagId: z.string().min(1),
    approveAll: z.boolean().optional(),
  },
  async ({ dagId, approveAll }) => {
    if (!store.get(dagId)) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "unknown dagId" }) }] };
    }

    const runId = randomUUID();
    activeRuns.set(runId, {
      dagId,
      state: "running",
      startedAt: new Date().toISOString(),
    });

    if (approveAll) {
      // Questions are currently keyed by dagId during planning; auto-answer
      // against that run key before execution starts.
      while (true) {
        const q = orchestrator.pendingQuestion(dagId);
        if (!q) break;
        await orchestrator.answerQuestion({
          runId: dagId,
          questionId: q.questionId,
          choice: q.recommended,
        });
      }
    }

    void orchestrator.execute(dagId, {}, runId).then(
      () => {
        const current = activeRuns.get(runId);
        if (!current) return;
        current.state = "done";
        current.finishedAt = new Date().toISOString();
      },
      (err) => {
        const current = activeRuns.get(runId);
        if (!current) return;
        current.state = "failed";
        current.finishedAt = new Date().toISOString();
        current.error = err instanceof Error ? err.message : String(err);
      },
    );

    return { content: [{ type: "text", text: JSON.stringify({ runId }) }] };
  },
);

server.tool(
  "amase_status",
  "Get current state, per-node metrics, and a tail of the decision log.",
  { runId: z.string().min(1) },
  async ({ runId }) => {
    const entry = activeRuns.get(runId);
    if (!entry) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "unknown runId" }) }] };
    }
    const graph = store.get(entry.dagId);
    if (!graph) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "dag missing" }) }] };
    }
    const paths = runPaths(graph.workspacePath, entry.dagId);
    const log = new DecisionLog(paths.decisions);
    const allLog = await log.readAll();
    const logTail = await log.tail(20);
    const metricsByNode = aggregateNodeMetrics(allLog);
    const allTerminal = graph.nodes.every(
      (n) => n.status === "completed" || n.status === "failed" || n.status === "skipped",
    );
    const state =
      entry.state === "failed"
        ? "failed"
        : entry.state === "running" && !allTerminal
          ? "running"
          : "done";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              state,
              error: entry.error,
              nodes: graph.nodes.map((n) => ({
                id: n.id,
                status: n.status ?? "pending",
                retries: metricsByNode.get(n.id)?.retries ?? n.retries ?? 0,
                tokensIn: metricsByNode.get(n.id)?.tokensIn ?? 0,
                tokensOut: metricsByNode.get(n.id)?.tokensOut ?? 0,
              })),
              logTail,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "amase_artifacts",
  "Fetch the patch bundle and decision log entries for a run.",
  { runId: z.string().min(1) },
  async ({ runId }) => {
    const entry = activeRuns.get(runId);
    if (!entry) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "unknown runId" }) }] };
    }
    const graph = store.get(entry.dagId);
    if (!graph) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "dag missing" }) }] };
    }
    const paths = runPaths(graph.workspacePath, entry.dagId);
    const log = new DecisionLog(paths.decisions);
    const all = await log.readAll();
    const patches = collectPatchSummaries(all);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              workspace: paths.workspace,
              state: entry.state,
              error: entry.error,
              patches,
              log: all,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "amase_skills",
  "List available skills. Filter by agent kind, language, or resolve for a given context.",
  {
    kind: z.string().optional(),
    language: z.string().optional(),
    paths: z.array(z.string()).optional(),
  },
  async ({ kind, language, paths }) => {
    let skills = ALL_SKILLS.map((s) => ({
      id: s.id,
      summary: s.summary,
      appliesTo: {
        kinds: s.appliesTo.kinds,
        languages: s.appliesTo.languages,
        hasPathPatterns: !!s.appliesTo.pathPatterns,
      },
      hasCheck: typeof s.check === "function",
    }));
    if (kind) {
      const resolved = resolveSkills({
        kind: kind as AgentKind,
        language: language as Language | undefined,
        touchedPaths: paths,
      });
      const ids = new Set(resolved.map((s) => s.id));
      skills = skills.filter((s) => ids.has(s.id));
    }
    return { content: [{ type: "text", text: JSON.stringify({ skills }, null, 2) }] };
  },
);

registerQuestionTools(server, orchestrator, (runId) => activeRuns.get(runId)?.dagId);

const transport = new StdioServerTransport();
await server.connect(transport);
