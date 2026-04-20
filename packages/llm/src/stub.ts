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
    return {
      text,
      tokensIn: req.system.length + req.user.length,
      tokensOut: text.length,
      model: req.model ?? "stub",
      stopReason: "end_turn",
    };
  }
}
