import { expect, test } from "vitest";
import { handle } from "../src/router.js";

test("default (no query): page 1 of 10, total 25", () => {
  const res = handle({ method: "GET", path: "/items", query: {} });
  expect(res.status).toBe(200);
  const body = res.body as { items: Array<{ id: string }>; page: number; pageSize: number; total: number };
  expect(body.items.length).toBe(10);
  expect(body.page).toBe(1);
  expect(body.pageSize).toBe(10);
  expect(body.total).toBe(25);
  expect(body.items[0].id).toBe("item-01");
  expect(body.items[9].id).toBe("item-10");
});

test("page=2&pageSize=5: items 06-10", () => {
  const res = handle({ method: "GET", path: "/items", query: { page: "2", pageSize: "5" } });
  expect(res.status).toBe(200);
  const body = res.body as { items: Array<{ id: string }>; page: number; pageSize: number; total: number };
  expect(body.items.length).toBe(5);
  expect(body.items[0].id).toBe("item-06");
  expect(body.items[4].id).toBe("item-10");
  expect(body.page).toBe(2);
  expect(body.pageSize).toBe(5);
  expect(body.total).toBe(25);
});

test("pageSize=999 is capped at 50; returns all 25 items", () => {
  const res = handle({ method: "GET", path: "/items", query: { pageSize: "999" } });
  expect(res.status).toBe(200);
  const body = res.body as { items: Array<{ id: string }>; page: number; pageSize: number; total: number };
  expect(body.pageSize).toBe(50);
  expect(body.items.length).toBe(25);
  expect(body.total).toBe(25);
});

test("page=99: beyond last page returns empty items", () => {
  const res = handle({ method: "GET", path: "/items", query: { page: "99" } });
  expect(res.status).toBe(200);
  const body = res.body as { items: Array<{ id: string }>; page: number; pageSize: number; total: number };
  expect(body.items.length).toBe(0);
  expect(body.page).toBe(99);
  expect(body.total).toBe(25);
});
