import { describe, expect, it } from "vitest";
import { ALL_SKILLS, getSkill, resolveSkills, runSkillChecks } from "../src/index.js";

describe("skills registry", () => {
  it("has unique skill ids", () => {
    const ids = ALL_SKILLS.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves backend kind to backend/* skills and security-scoped cross-cuts", () => {
    const got = resolveSkills({ kind: "backend" }).map((s) => s.id);
    expect(got).toContain("backend/rest-api");
    expect(got).toContain("backend/data-model");
    expect(got).toContain("security/secrets");
    expect(got).toContain("testing/unit-testing");
    expect(got).toContain("performance/caching");
    expect(got).not.toContain("frontend/component-design");
  });

  it("resolves test-gen kind to testing skills", () => {
    const got = resolveSkills({ kind: "test-gen" }).map((s) => s.id);
    expect(got).toContain("testing/unit-testing");
    expect(got).toContain("testing/integration-testing");
  });

  it("resolves architect kind to architecture skills", () => {
    const got = resolveSkills({ kind: "architect" }).map((s) => s.id);
    expect(got).toContain("backend/design");
    expect(got).toContain("architecture/event-driven");
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

  it("new skills are registered", () => {
    expect(getSkill("frontend/performance")).toBeDefined();
    expect(getSkill("testing/unit-testing")).toBeDefined();
    expect(getSkill("testing/integration-testing")).toBeDefined();
    expect(getSkill("architecture/event-driven")).toBeDefined();
    expect(getSkill("architecture/diagramming")).toBeDefined();
    expect(getSkill("performance/caching")).toBeDefined();
    expect(getSkill("lang/regex")).toBeDefined();
    expect(getSkill("backend/api-integration")).toBeDefined();
    expect(getSkill("backend/database-flavors")).toBeDefined();
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

  it("unit test anti-patterns are flagged", async () => {
    const unitTest = ALL_SKILLS.filter((s) => s.id === "testing/unit-testing");
    const res = await runSkillChecks(
      unitTest,
      [
        {
          path: "src/component.test.ts",
          op: "create",
          content: `it('should work', () => { setTimeout(() => {}, 1000); });`,
        },
      ],
      ctx,
    );
    expect(res[0].issues.some((i) => /fake timers/.test(i.message))).toBe(true);
  });

  it("event-driven missing DLQ is flagged", async () => {
    const eventDriven = ALL_SKILLS.filter((s) => s.id === "architecture/event-driven");
    const res = await runSkillChecks(
      eventDriven,
      [
        {
          path: "src/consumer.ts",
          op: "create",
          content: `kafka.consumer({ groupId: 'test' }).subscribe({ topic: 'orders' });`,
        },
      ],
      ctx,
    );
    expect(res[0].issues.some((i) => /dead-letter/.test(i.message))).toBe(true);
  });
});

describe("skill guides", () => {
  it("loads a guide from disk", async () => {
    const s = getSkill("backend/rest-api");
    const text = await s?.guide();
    expect(text).toContain("REST");
  });

  it("new skill guides are loadable", async () => {
    const perf = getSkill("frontend/performance");
    const text = await perf?.guide();
    expect(text).toContain("Core Web Vitals");
  });
});
