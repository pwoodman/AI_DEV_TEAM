import { expect, test } from "vitest";
import { handle } from "../src/router.js";

test("GET /health returns 200 {ok:true}", () => {
  const res = handle({ method: "GET", path: "/health" });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});

test("GET /ping still works", () => {
  const res = handle({ method: "GET", path: "/ping" });
  expect(res.status).toBe(200);
  expect(res.body).toBe("pong");
});
