import { expect, test } from "vitest";

// Each import must come from the new focused module path, not from god.ts
import { parseRequest } from "../src/parser.js";
import { formatOk, formatError } from "../src/response.js";
import { validateRequest } from "../src/validator.js";
import { checkPermission } from "../src/permissions.js";
import { checkRateLimit } from "../src/rate-limiter.js";

// ── parser ────────────────────────────────────────────────────────────────────
test("parseRequest parses valid JSON", () => {
  const req = parseRequest(JSON.stringify({ userId: "user-1", action: "read", payload: { id: 42 } }));
  expect(req.userId).toBe("user-1");
  expect(req.action).toBe("read");
  expect(req.payload).toEqual({ id: 42 });
});

test("parseRequest throws on invalid JSON", () => {
  expect(() => parseRequest("not-json")).toThrow("invalid JSON");
});

test("parseRequest defaults missing fields to empty string and empty object", () => {
  const req = parseRequest(JSON.stringify({}));
  expect(req.userId).toBe("");
  expect(req.action).toBe("");
  expect(req.payload).toEqual({});
});

// ── response ──────────────────────────────────────────────────────────────────
test("formatOk wraps data in ok envelope", () => {
  const out = JSON.parse(formatOk({ x: 1 }));
  expect(out.ok).toBe(true);
  expect(out.data).toEqual({ x: 1 });
});

test("formatError wraps message in error envelope", () => {
  const out = JSON.parse(formatError("oops"));
  expect(out.ok).toBe(false);
  expect(out.error).toBe("oops");
});

// ── validator ─────────────────────────────────────────────────────────────────
test("validateRequest ok for valid request", () => {
  const result = validateRequest({ userId: "user-1", action: "read", payload: {} });
  expect(result.ok).toBe(true);
  expect(result.errors).toHaveLength(0);
});

test("validateRequest fails for missing userId", () => {
  const result = validateRequest({ userId: "", action: "read", payload: {} });
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("userId is required");
});

test("validateRequest fails for unknown action", () => {
  const result = validateRequest({ userId: "user-1", action: "fly", payload: {} });
  expect(result.ok).toBe(false);
  expect(result.errors.some((e) => e.includes("unknown action"))).toBe(true);
});

// ── permissions ───────────────────────────────────────────────────────────────
test("admin user-1 can delete", () => {
  expect(checkPermission("user-1", "delete")).toBe(true);
});

test("editor user-2 cannot delete", () => {
  expect(checkPermission("user-2", "delete")).toBe(false);
});

test("viewer user-3 can read", () => {
  expect(checkPermission("user-3", "read")).toBe(true);
});

test("unknown user defaults to viewer and cannot delete", () => {
  expect(checkPermission("unknown-user", "read")).toBe(true);
  expect(checkPermission("unknown-user", "delete")).toBe(false);
});

// ── rate-limiter ──────────────────────────────────────────────────────────────
test("first request for a user is allowed with 9 remaining", () => {
  const result = checkRateLimit(`rl-test-${Date.now()}-a`);
  expect(result.allowed).toBe(true);
  expect(result.remaining).toBe(9);
});

test("remaining decreases with each successive request", () => {
  const userId = `rl-seq-${Date.now()}-b`;
  checkRateLimit(userId);
  const second = checkRateLimit(userId);
  expect(second.remaining).toBe(8);
});
