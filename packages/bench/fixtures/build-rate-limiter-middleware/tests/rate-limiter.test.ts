import { beforeEach, expect, test } from "vitest";
import { setNow } from "../src/clock.js";
import { createRouter } from "../src/router.js";
import { applyMiddleware } from "../src/middleware.js";

const PING = { method: "GET", path: "/ping" };

beforeEach(() => {
  // Reset clock to a known baseline before each test
  setNow(() => 1000);
});

test("allow within limit: first 3 requests return 200", () => {
  let t = 1000;
  setNow(() => t);
  const router = applyMiddleware(createRouter(), { limit: 3, windowMs: 1000 });
  expect(router.handle(PING).status).toBe(200);
  expect(router.handle(PING).status).toBe(200);
  expect(router.handle(PING).status).toBe(200);
});

test("reject when exceeded: 4th request within window returns 429", () => {
  let t = 1000;
  setNow(() => t);
  const router = applyMiddleware(createRouter(), { limit: 3, windowMs: 1000 });
  router.handle(PING);
  router.handle(PING);
  router.handle(PING);
  const res = router.handle(PING);
  expect(res.status).toBe(429);
});

test("refill after window advance: request after windowMs returns 200", () => {
  let t = 1000;
  setNow(() => t);
  const router = applyMiddleware(createRouter(), { limit: 3, windowMs: 1000 });
  router.handle(PING);
  router.handle(PING);
  router.handle(PING);
  // Advance clock past the window
  t += 1001;
  const res = router.handle(PING);
  expect(res.status).toBe(200);
});

test("independent buckets per route key: exhausting /ping does not affect other paths", () => {
  let t = 1000;
  setNow(() => t);
  const base = createRouter();
  // Add a /other route for testing
  base.routes.push({ method: "GET", path: "/other", handler: () => ({ status: 200, body: "other" }) });
  const router = applyMiddleware(base, { limit: 2, windowMs: 1000 });
  // Exhaust /ping bucket
  router.handle(PING);
  router.handle(PING);
  expect(router.handle(PING).status).toBe(429);
  // /other should still work (separate bucket)
  const res = router.handle({ method: "GET", path: "/other" });
  expect(res.status).toBe(200);
});
