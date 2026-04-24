import Anthropic from "@anthropic-ai/sdk";
import type { SystemBlock } from "./cache.js";

export interface LlmCallRequest {
  system: string | SystemBlock[];
  user: string;
  maxTokens: number;
  model?: string;
  temperature?: number;
  /** Anthropic cache checkpoint from a prior call — pass to enable cache reads */
  cacheCheckpoint?: string;
}

export interface LlmCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  model: string;
  stopReason: string | null;
  /** Cache checkpoint to pass to the next call in the same partition */
  cacheCheckpoint?: string;
}

export interface LlmClient {
  call(req: LlmCallRequest): Promise<LlmCallResult>;
}

const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_RETRIES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("connection error") ||
    msg.includes("rate limit") ||
    msg.includes("status 429") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("econn") ||
    msg.includes("etimedout")
  );
}

// ---------------------------------------------------------------------------
// System-prompt cache partition key
// ---------------------------------------------------------------------------
export type PromptPartition = {
  kind: string;
  skillHash: string; // hex of sorted skill IDs
};

export function partitionKey(kind: string, skillIds: string[]): PromptPartition {
  const sorted = [...skillIds].sort().join(",");
  // Cheap djb2-style hash
  let h = 5381;
  for (let i = 0; i < sorted.length; i++) {
    h = ((h << 5) + h) ^ sorted.charCodeAt(i);
  }
  return { kind, skillHash: Math.abs(h).toString(16) };
}

// ---------------------------------------------------------------------------
// Per-partition cache checkpoint tracker
// ---------------------------------------------------------------------------
const _partitionCache = new Map<string, string>();

export function getPartitionCache(key: PromptPartition): string | undefined {
  return _partitionCache.get(`${key.kind}:${key.skillHash}`);
}

export function setPartitionCache(key: PromptPartition, checkpoint: string): void {
  _partitionCache.set(`${key.kind}:${key.skillHash}`, checkpoint);
}

export class AnthropicClient implements LlmClient {
  private client: Anthropic;
  private defaultModel: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    this.client = new Anthropic({ apiKey });
    this.defaultModel = opts.model ?? DEFAULT_MODEL;
  }

  async call(req: LlmCallRequest): Promise<LlmCallResult> {
    const model = req.model ?? this.defaultModel;
    let res: Anthropic.Message | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const extra: Record<string, unknown> = {};
        // If we have a cache checkpoint for this partition, use it.
        // Anthropic will bill only for tokens AFTER the checkpoint.
        if (req.cacheCheckpoint) {
          extra.cache_checkpoint = req.cacheCheckpoint;
        }

        res = (await this.client.messages.create({
          model,
          max_tokens: req.maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          system: req.system as unknown as string | SystemBlock[],
          messages: [{ role: "user", content: req.user }],
          ...(Object.keys(extra).length > 0 ? { extra } : {}),
        })) as Anthropic.Message;
        break;
      } catch (err) {
        if (attempt >= MAX_RETRIES - 1 || !isTransientError(err)) {
          throw err;
        }
        await delay(300 * 2 ** attempt);
      }
    }
    if (!res) throw new Error("anthropic call did not return a response");

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const usage = res.usage as unknown as Record<string, unknown>;
    const cacheReadTokens =
      typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
    const cacheWriteTokens =
      typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;

    // Extract the new cache checkpoint if one was created (from cache_write)
    const newCheckpoint =
      typeof usage.cache_creation_input_tokens === "number" && usage.cache_creation_input_tokens > 0
        ? (res as unknown as { assistant?: { id?: string } }).assistant?.id
        : undefined;

    return {
      text,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      cacheReadTokens,
      cacheWriteTokens,
      model,
      stopReason: res.stop_reason,
      cacheCheckpoint: newCheckpoint,
    };
  }
}
