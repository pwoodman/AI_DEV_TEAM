import { describe, expect, it } from "vitest";
import { ALL_SKILLS, getSkill, resolveSkills, runSkillChecks } from "../src/index.js";

describe("skills registry", () => {
  it("has 16 skills with unique ids", () => {
    const ids = ALL_SKILLS.map((s) => s.id);
    expect(ids.length).toBe(16);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves backend kind to backend/* skills and security-scoped cross-cuts", () => {
    const got = resolveSkills({ kind: "backend" }).map((s) => s.id);
    expect(got).toContain("backend/rest-api");
    expect(got).toContain("backend/data-model");
    expect(got).toContain("security/secrets");
    expect(got).not.toContain("frontend/component-design");
  });

  it("adds language-scoped skill only when language matches", () => {
    const go = resolveSkills({ kind: "backend", language: "go" }).map((s) => s.id);
    expect(go).toContain("lang/go");
    const ts = resolveSkills({ kind: "backend", language: "ts" }).map((s) => s.id);
    expect(ts).toContain("lang/typescript");
    expect(ts).not.toContain("lang/go");
  });

  it("path-scoped skill matches on touched paths", () => {
    const got = resolveSkills({
      kind: "deployment",
      touchedPaths: ["services/api/Dockerfile"],
    }).map((s) => s.id);
    expect(got).toContain("deployment/dockerize");
  });

  it("getSkill returns skill by id", () => {
    expect(getSkill("security/secrets")?.id).toBe("security/secrets");
    expect(getSkill("nope")).toBeUndefined();
  });
});

describe("skill checks", () => {
  const ctx = { workspacePath: "/tmp", allowedPaths: ["src/"] };

  it("secret leak triggers error severity", async () => {
    const secrets = ALL_SKILLS.filter((s) => s.id === "security/secrets");
    const res = await runSkillChecks(
      secrets,
      [
        {
          path: "src/config.ts",
          op: "create",
          content: "const key = 'sk-ABCDEFGHIJ1234567890XYZ';",
        },
      ],
      ctx,
    );
    expect(res[0].issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("Dockerfile :latest tag flagged", async () => {
    const docker = ALL_SKILLS.filter((s) => s.id === "deployment/dockerize");
    const res = await runSkillChecks(
      docker,
      [{ path: "Dockerfile", op: "create", content: "FROM node:latest\n" }],
      ctx,
    );
    expect(res[0].issues.some((i) => /latest/.test(i.message))).toBe(true);
  });

  it("clean code yields no issues", async () => {
    const ts = ALL_SKILLS.filter((s) => s.id === "lang/typescript");
    const res = await runSkillChecks(
      ts,
      [{ path: "src/a.ts", op: "create", content: "export const x: number = 1;\n" }],
      ctx,
    );
    expect(res[0].issues.length).toBe(0);
  });
});

describe("skill guides", () => {
  it("loads a guide from disk", async () => {
    const s = getSkill("backend/rest-api");
    const text = await s?.guide();
    expect(text).toContain("REST");
  });
});
