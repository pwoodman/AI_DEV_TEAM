import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "dist", "index.js");

class McpClient {
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  constructor(private child: ChildProcess) {
    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id === undefined) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    });
  }
  request(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: Record<string, unknown> = { jsonrpc: "2.0", id, method };
      if (params !== undefined) msg.params = params;
      this.child.stdin!.write(`${JSON.stringify(msg)}\n`);
    });
  }
  notify(method: string, params?: unknown) {
    const msg: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) msg.params = params;
    this.child.stdin!.write(`${JSON.stringify(msg)}\n`);
  }
  close() {
    this.child.stdin!.end();
    this.child.kill();
  }
}

describe("MCP stdio roundtrip", () => {
  let child: ChildProcess;
  let client: McpClient;
  let workspace: string;

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "amase-mcp-test-"));
    child = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        AMASE_LLM_STUB: "1",
        AMASE_MINIMAL_VALIDATORS: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    client = new McpClient(child);
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.1.0" },
    });
    client.notify("notifications/initialized");
  });

  afterAll(() => {
    client?.close();
  });

  it("lists all lifecycle tools", async () => {
    const res = await client.request("tools/list");
    const names = res.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      "amase_answer",
      "amase_artifacts",
      "amase_clarify",
      "amase_execute",
      "amase_plan",
      "amase_skills",
      "amase_status",
    ]);
  });

  it("runs plan → execute → status → artifacts end-to-end", async () => {
    const planRes = await client.request("tools/call", {
      name: "amase_plan",
      arguments: { request: "add /health", workspacePath: workspace },
    });
    const plan = JSON.parse(planRes.content[0].text);
    expect(plan.dagId).toBeTypeOf("string");
    expect(plan.nodes.length).toBeGreaterThan(0);

    const execRes = await client.request("tools/call", {
      name: "amase_execute",
      arguments: { dagId: plan.dagId },
    });
    const exec = JSON.parse(execRes.content[0].text);
    expect(exec.runId).toBeTypeOf("string");

    const statusRes = await client.request("tools/call", {
      name: "amase_status",
      arguments: { runId: exec.runId },
    });
    const status = JSON.parse(statusRes.content[0].text);
    expect(status.state).toBe("done");
    expect(status.nodes.every((n: { status: string }) => n.status === "completed")).toBe(true);

    const artRes = await client.request("tools/call", {
      name: "amase_artifacts",
      arguments: { runId: exec.runId },
    });
    const artifacts = JSON.parse(artRes.content[0].text);
    expect(artifacts.workspace).toMatch(/runs[\\/].+[\\/]workspace$/);
    const events = artifacts.log.map((e: { event: string }) => e.event);
    expect(events).toContain("node.started");
    expect(events).toContain("node.completed");
    expect(events).toContain("validator.passed");
  });
});
