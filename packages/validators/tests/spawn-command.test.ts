import { describe, expect, it } from "vitest";
import { spawnCommand } from "../src/spawn-command.js";

describe("spawnCommand", () => {
  it("captures stdout from a successful command", async () => {
    const result = await spawnCommand("node", ["-e", "process.stdout.write('hello')"], process.cwd());
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("hello");
  });

  it("captures stderr output", async () => {
    const result = await spawnCommand("node", ["-e", "process.stderr.write('err')"], process.cwd());
    expect(result.stderr).toBe("err");
  });

  it("returns code 1 when process exits with non-zero", async () => {
    const result = await spawnCommand("node", ["-e", "process.exit(2)"], process.cwd());
    expect(result.code).toBe(2);
  });
});
