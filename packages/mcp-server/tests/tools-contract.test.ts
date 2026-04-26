import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type McpClient, callTool, spawnMcp } from "./contract-helpers.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDone(
  client: McpClient,
  runId: string,
  timeoutMs = 6_000,
): Promise<{
  state: string;
  nodes: Array<{
    id: string;
    status: string;
    retries: number;
    tokensIn: number;
    tokensOut: number;
  }>;
}> {
  const deadline = Date.now() + timeoutMs;
  let last: { state: string; nodes: Array<{ id: string; status: string }> } | undefined;
  while (Date.now() < deadline) {
    last = await callTool<{ state: string; nodes: Array<{ id: string; status: string }> }>(
      client,
      "amase_status",
      { runId },
    );
    if (last.state === "done" || last.state === "failed") {
      return last as {
        state: string;
        nodes: Array<{
          id: string;
          status: string;
          retries: number;
          tokensIn: number;
          tokensOut: number;
        }>;
      };
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for run ${runId}; last state=${last?.state ?? "unknown"}`);
}

describe("MCP contract: tool-by-tool", () => {
  let client: McpClient;
  let workspace: string;
  let planDagId: string;
  let execRunId: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "amase-contract-"));
    client = await spawnMcp();
  });

  afterAll(() => {
    client?.close();
  });

  describe("tools/list", () => {
    it("advertises every expected tool", async () => {
      const start = Date.now();
      const res = await client.request<{ tools: Array<{ name: string; inputSchema: unknown }> }>(
        "tools/list",
      );
      expect(Date.now() - start).toBeLessThan(2000);
      const names = new Set(res.tools.map((t) => t.name));
      for (const name of [
        "amase_plan",
        "amase_execute",
        "amase_status",
        "amase_artifacts",
        "amase_skills",
        "amase_clarify",
        "amase_answer",
      ]) {
        expect(names.has(name)).toBe(true);
      }
      for (const t of res.tools) expect(t.inputSchema).toBeTypeOf("object");
    });
  });

  describe("amase_plan", () => {
    it("happy path returns dagId + nodes under 2s", async () => {
      const start = Date.now();
      const plan = await callTool<{ dagId: string; nodes: Array<{ id: string; kind: string }> }>(
        client,
        "amase_plan",
        { request: "add /health", workspacePath: workspace },
      );
      expect(Date.now() - start).toBeLessThan(2000);
      expect(plan.dagId).toBeTypeOf("string");
      expect(Array.isArray(plan.nodes)).toBe(true);
      expect(plan.nodes.length).toBeGreaterThan(0);
      for (const n of plan.nodes) {
        expect(n.id).toBeTypeOf("string");
        expect(n.kind).toBeTypeOf("string");
      }
      planDagId = plan.dagId;
    });

    it("rejects missing required field, server survives", async () => {
      const res = (await client.request("tools/call", {
        name: "amase_plan",
        arguments: { request: "x" },
      })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/workspacePath/);
      expect(client.isAlive()).toBe(true);
    });
  });

  describe("amase_execute + amase_status + amase_artifacts", () => {
    it("execute returns runId", async () => {
      const start = Date.now();
      const exec = await callTool<{ runId: string }>(client, "amase_execute", {
        dagId: planDagId,
      });
      expect(Date.now() - start).toBeLessThan(1000);
      expect(exec.runId).toBeTypeOf("string");
      execRunId = exec.runId;
    });

    it("status eventually reports done", async () => {
      const status = await waitForDone(client, execRunId);
      expect(status.state).toBe("done");
      expect(Array.isArray(status.nodes)).toBe(true);
      for (const n of status.nodes) {
        expect(n.retries).toBeTypeOf("number");
        expect(n.tokensIn).toBeTypeOf("number");
        expect(n.tokensOut).toBeTypeOf("number");
      }
    });

    it("artifacts include workspace path + decision log with validator events", async () => {
      await waitForDone(client, execRunId);
      const art = await callTool<{
        workspace: string;
        patches: Array<{ nodeId: string; path: string; op: string; bytes: number }>;
        log: Array<{ event: string; data: Record<string, unknown> }>;
      }>(client, "amase_artifacts", { runId: execRunId });
      expect(art.workspace).toMatch(/runs[\\/].+[\\/]workspace$/);
      expect(Array.isArray(art.patches)).toBe(true);
      expect(Array.isArray(art.log)).toBe(true);
      const events = art.log.map((e) => e.event);
      expect(events).toContain("node.started");
      expect(events).toContain("validator.passed");
    });

    it("status on unknown runId returns error payload, not JSON-RPC error", async () => {
      const res = await callTool<{ error?: string }>(client, "amase_status", {
        runId: "nonexistent",
      });
      expect(res.error).toBeTypeOf("string");
      expect(client.isAlive()).toBe(true);
    });
  });

  describe("amase_skills", () => {
    it("lists without filter", async () => {
      const res = await callTool<{ skills: Array<{ id: string; summary: string }> }>(
        client,
        "amase_skills",
        {},
      );
      expect(Array.isArray(res.skills)).toBe(true);
      expect(res.skills.length).toBeGreaterThan(0);
      for (const s of res.skills) {
        expect(s.id).toBeTypeOf("string");
        expect(s.summary).toBeTypeOf("string");
      }
    });

    it("filters by kind", async () => {
      const res = await callTool<{ skills: Array<{ id: string }> }>(client, "amase_skills", {
        kind: "backend",
        language: "typescript",
      });
      expect(Array.isArray(res.skills)).toBe(true);
    });
  });

  describe("amase_clarify + amase_answer", () => {
    it("clarify with no pending question returns null", async () => {
      const res = (await client.request("tools/call", {
        name: "amase_clarify",
        arguments: { runId: execRunId },
      })) as { content: Array<{ text: string }> };
      expect(res.content[0].text).toBe("null");
    });

    it("answer rejects invalid schema with isError content, server survives", async () => {
      const res = (await client.request("tools/call", {
        name: "amase_answer",
        arguments: { runId: execRunId, questionId: "nope", choice: "zero" },
      })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(res.isError).toBe(true);
      expect(client.isAlive()).toBe(true);
    });
  });

  describe("lifecycle", () => {
    it("server is still alive after all previous contract calls", () => {
      expect(client.isAlive()).toBe(true);
    });
  });
});
