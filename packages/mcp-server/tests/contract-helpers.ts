import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "dist", "index.js");

export interface JsonRpcError {
  code: number;
  message: string;
}

export class McpClient {
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: JsonRpcError) => void }
  >();
  private nextId = 1;
  public lastStderr = "";

  constructor(public child: ChildProcess) {
    if (!child.stdout) throw new Error("child stdout unavailable");
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: { id?: number; result?: unknown; error?: JsonRpcError };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id === undefined) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(msg.error);
      else entry.resolve(msg.result);
    });
    child.stderr?.on("data", (c) => {
      this.lastStderr += c.toString();
    });
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const msg: Record<string, unknown> = { jsonrpc: "2.0", id, method };
      if (params !== undefined) msg.params = params;
      this.child.stdin?.write(`${JSON.stringify(msg)}\n`);
    });
  }

  notify(method: string, params?: unknown) {
    const msg: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) msg.params = params;
    this.child.stdin?.write(`${JSON.stringify(msg)}\n`);
  }

  close() {
    this.child.stdin?.end();
    this.child.kill();
  }

  isAlive(): boolean {
    return this.child.exitCode === null && !this.child.killed;
  }
}

export async function spawnMcp(opts: { env?: Record<string, string> } = {}): Promise<McpClient> {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      AMASE_LLM_STUB: "1",
      AMASE_MINIMAL_VALIDATORS: "1",
      ...opts.env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new McpClient(child);
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "contract-tests", version: "0.1.0" },
  });
  client.notify("notifications/initialized");
  return client;
}

export async function callTool<T = unknown>(
  client: McpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = (await client.request("tools/call", { name, arguments: args })) as {
    content: Array<{ text: string }>;
  };
  return JSON.parse(res.content[0].text) as T;
}
