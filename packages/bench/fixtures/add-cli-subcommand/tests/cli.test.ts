import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

describe("cli", () => {
  it('run(["greet","Ada"]) returns greeting', () => {
    expect(run(["greet", "Ada"])).toBe("Hello, Ada!");
  });

  it('run(["farewell","Ada"]) returns farewell', () => {
    expect(run(["farewell", "Ada"])).toBe("Goodbye, Ada!");
  });

  it('run(["greet"]) returns error containing "missing name"', () => {
    expect(run(["greet"])).toContain("missing name");
  });

  it('run(["farewell"]) returns error containing "missing name"', () => {
    expect(run(["farewell"])).toContain("missing name");
  });
});
