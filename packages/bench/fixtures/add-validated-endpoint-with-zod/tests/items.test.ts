import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../src/router.js";
import { store } from "../src/store.js";

beforeEach(() => {
  store.length = 0;
});

describe("POST /items", () => {
  it("valid body returns 201 with item and adds to store", () => {
    const res = handle({
      method: "POST",
      path: "/items",
      body: { name: "Widget", qty: 3 },
    });
    expect(res.status).toBe(201);
    const item = res.body as { id: string; name: string; qty: number };
    expect(typeof item.id).toBe("string");
    expect(item.name).toBe("Widget");
    expect(item.qty).toBe(3);
    expect(store).toHaveLength(1);
    expect(store[0]).toEqual(item);
  });

  it("missing name returns 400", () => {
    const res = handle({
      method: "POST",
      path: "/items",
      body: { qty: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("negative qty returns 400", () => {
    const res = handle({
      method: "POST",
      path: "/items",
      body: { name: "Bad", qty: -1 },
    });
    expect(res.status).toBe(400);
  });
});
