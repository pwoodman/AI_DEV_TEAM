import Anthropic from "@anthropic-ai/sdk";

export interface LlmCallRequest {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  temperature?: number;
}

export interface LlmCallResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  stopReason: string | null;
}

export interface LlmClient {
  call(req: LlmCallRequest): Promise<LlmCallResult>;
}

const DEFAULT_MODEL = "claude-opus-4-7";

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
    const res = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      model,
      stopReason: res.stop_reason,
    };
  }
}
