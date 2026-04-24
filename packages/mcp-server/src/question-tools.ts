import type { Orchestrator } from "@amase/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerQuestionTools(
  server: McpServer,
  orchestrator: Orchestrator,
  resolveDagId?: (runId: string) => string | undefined,
): void {
  server.tool(
    "amase_clarify",
    "Fetch the next pending user-input question for a run, or null if none.",
    { runId: z.string().min(1) },
    async ({ runId }) => {
      const dagId = resolveDagId?.(runId);
      const q =
        orchestrator.pendingQuestion(runId) ?? (dagId ? orchestrator.pendingQuestion(dagId) : null);
      return { content: [{ type: "text", text: JSON.stringify(q) }] };
    },
  );

  server.tool(
    "amase_answer",
    "Submit the user's answer to a pending question; unblocks the run.",
    {
      runId: z.string().min(1),
      questionId: z.string().min(1),
      choice: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    },
    async ({ runId, questionId, choice }) => {
      const dagId = resolveDagId?.(runId);
      await orchestrator.answerQuestion({ runId: dagId ?? runId, questionId, choice });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );
}
