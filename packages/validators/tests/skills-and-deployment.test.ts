import { describe, expect, it } from "vitest";
import {
  buildDeploymentReadinessGate,
  buildSecurityValidator,
  buildSkillChecksValidator,
} from "../src/index.js";

const ctx = { workspacePath: "/tmp", allowedPaths: ["src/"] };

describe("security validator", () => {
  const v = buildSecurityValidator();
  it("flags hardcoded AWS key as error", async () => {
    const res = await v.run(
      {
        taskId: "t1",
        notes: "",
        patches: [
          { path: "src/aws.ts", op: "create", content: "const k = 'AKIAABCDEFGHIJKLMNOP';" },
        ],
      },
      ctx,
    );
    expect(res.validator).toBe("security");
    expect(res.ok).toBe(false);
  });

  it("passes clean code", async () => {
    const res = await v.run(
      { taskId: "t1", notes: "", patches: [{ path: "src/a.ts", op: "create", content: "export const x = 1;\n" }] },
      ctx,
    );
    expect(res.ok).toBe(true);
  });
});

describe("skill-checks validator", () => {
  it("runs only specified skills", async () => {
    const v = buildSkillChecksValidator({ skillIds: ["backend/rest-api"] });
    const res = await v.run(
      {
        taskId: "t1",
        notes: "",
        patches: [{ path: "src/api.ts", op: "create", content: "app.get('/v1/getUser', h);" }],
      },
      ctx,
    );
    expect(res.validator).toBe("skill-checks");
    expect(res.issues.some((i) => /verb/i.test(i.message))).toBe(true);
  });
});

describe("deployment readiness gate", () => {
  const v = buildDeploymentReadinessGate();
  it("fails when no Dockerfile present", async () => {
    const res = await v.run(
      { taskId: "t1", notes: "", patches: [{ path: "src/a.ts", op: "create", content: "x" }] },
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => /Dockerfile/i.test(i.message))).toBe(true);
  });

  it("passes (with warnings only) when Dockerfile present", async () => {
    const res = await v.run(
      {
        taskId: "t1",
        notes: "",
        patches: [
          {
            path: "Dockerfile",
            op: "create",
            content: "FROM node:20\nHEALTHCHECK CMD curl -f http://localhost/healthz\nlogger.info('x')\n",
          },
          {
            path: ".github/workflows/ci.yml",
            op: "create",
            content: "name: ci\non: push\n",
          },
        ],
      },
      ctx,
    );
    expect(res.ok).toBe(true);
  });
});
