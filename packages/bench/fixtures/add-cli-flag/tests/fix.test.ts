import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

describe("add-cli-flag", () => {
  it("default text output unchanged", () => {
    expect(run(["alice", "30"])).toBe("name=alice age=30");
  });
  it("--json flag returns JSON", () => {
    const out = run(["alice", "30", "--json"]);
    expect(JSON.parse(out)).toEqual({ name: "alice", age: 30 });
  });
  it("--json flag works in any position", () => {
    const out = run(["--json", "bob", "25"]);
    expect(JSON.parse(out)).toEqual({ name: "bob", age: 25 });
  });
});
