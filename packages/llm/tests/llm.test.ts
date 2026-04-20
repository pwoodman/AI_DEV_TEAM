import { describe, expect, it } from "vitest";
import { StubLlmClient, renderTemplate } from "../src/index.js";

describe("renderTemplate", () => {
  it("replaces {{var}} placeholders", () => {
    expect(renderTemplate("hi {{name}}!", { name: "x" })).toBe("hi x!");
  });

  it("throws on missing var", () => {
    expect(() => renderTemplate("hi {{missing}}!", {})).toThrow(/missing/);
  });

  it("handles whitespace inside braces", () => {
    expect(renderTemplate("a {{ kind }} b", { kind: "backend" })).toBe("a backend b");
  });
});

describe("StubLlmClient", () => {
  it("records calls and returns stub text", async () => {
    const stub = new StubLlmClient(() => "hello");
    const res = await stub.call({ system: "sys", user: "usr", maxTokens: 10 });
    expect(res.text).toBe("hello");
    expect(res.stopReason).toBe("end_turn");
    expect(stub.calls).toHaveLength(1);
  });

  it("supports async responder", async () => {
    const stub = new StubLlmClient(async (req) => `echo:${req.user}`);
    const res = await stub.call({ system: "s", user: "u", maxTokens: 5 });
    expect(res.text).toBe("echo:u");
  });
});
