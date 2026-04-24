import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDone(client, runId, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const statusRes = await client.request("tools/call", {
      name: "amase_status",
      arguments: { runId },
    });
    const status = JSON.parse(statusRes.content[0].text);
    last = status;
    if (status.state === "done" || status.state === "failed") return status;
    await sleep(100);
  }
  throw new Error(`status timeout waiting for ${runId}; last=${last?.state ?? "unknown"}`);
}

// Minimal MCP client over stdio: JSON-RPC 2.0, newline-delimited.
class McpStdioClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
    child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
      this.child.stdin.write(`${JSON.stringify(msg)}\n`);
    });
  }

  notify(method, params) {
    const msg = { jsonrpc: "2.0", method, ...(params ? { params } : {}) };
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

const workspace = await mkdtemp(join(tmpdir(), "amase-mcp-smoke-"));
console.log("workspace:", workspace);

const serverPath = join(process.cwd(), "packages/mcp-server/dist/index.js");
const child = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    AMASE_LLM_STUB: "1",
    AMASE_MINIMAL_VALIDATORS: "1",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

const client = new McpStdioClient(child);

try {
  const initRes = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "amase-smoke", version: "0.1.0" },
  });
  console.log("initialize:", initRes.serverInfo);
  client.notify("notifications/initialized");

  const tools = await client.request("tools/list");
  console.log("tools:", tools.tools.map((t) => t.name).join(", "));

  const planRes = await client.request("tools/call", {
    name: "amase_plan",
    arguments: { request: "add /health endpoint", workspacePath: workspace },
  });
  const plan = JSON.parse(planRes.content[0].text);
  console.log("plan:", { dagId: plan.dagId, nodes: plan.nodes.map((n) => `${n.id}[${n.kind}]`) });

  const execRes = await client.request("tools/call", {
    name: "amase_execute",
    arguments: { dagId: plan.dagId },
  });
  const exec = JSON.parse(execRes.content[0].text);
  console.log("execute:", exec);

  const status = await waitForDone(client, exec.runId);
  console.log("status:", {
    state: status.state,
    nodes: status.nodes.map((n) => `${n.id}:${n.status} in=${n.tokensIn} out=${n.tokensOut}`),
  });

  const artifactsRes = await client.request("tools/call", {
    name: "amase_artifacts",
    arguments: { runId: exec.runId },
  });
  const artifacts = JSON.parse(artifactsRes.content[0].text);
  console.log(`artifacts: workspace=${artifacts.workspace}`);
  console.log(`artifacts: patches=${artifacts.patches.length}`);
  console.log(`artifacts: events=${artifacts.log.map((e) => e.event).join(" -> ")}`);

  const expected = ["amase_plan", "amase_execute", "amase_status", "amase_artifacts"];
  const got = tools.tools.map((t) => t.name).sort();
  for (const name of expected) {
    if (!got.includes(name)) throw new Error(`missing tool: ${name}`);
  }
  if (status.state !== "done") throw new Error(`unexpected state: ${status.state}`);
  console.log("\nMCP smoke PASSED.");
} finally {
  client.close();
}
