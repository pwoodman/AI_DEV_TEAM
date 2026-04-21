import type { LlmCallRequest, LlmCallResult, LlmClient } from "./client.js";

export type StubResponder = (req: LlmCallRequest) => string | Promise<string>;

export class StubLlmClient implements LlmClient {
  private responder: StubResponder;
  public calls: LlmCallRequest[] = [];

  constructor(responder: StubResponder) {
    this.responder = responder;
  }

  async call(req: LlmCallRequest): Promise<LlmCallResult> {
    this.calls.push(req);
    const text = await this.responder(req);
    const systemLen =
      typeof req.system === "string"
        ? req.system.length
        : req.system.reduce((acc, b) => acc + b.text.length, 0);
    return {
      text,
      tokensIn: systemLen + req.user.length,
      tokensOut: text.length,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      model: req.model ?? "stub",
      stopReason: "end_turn",
    };
  }
}
