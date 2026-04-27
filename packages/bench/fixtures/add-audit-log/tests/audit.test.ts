import { beforeEach, describe, expect, it } from "vitest";
import { clearAudit, queryAudit } from "../src/audit.js";
import { handle } from "../src/router.js";
import { store } from "../src/store.js";

beforeEach(() => {
  store.length = 0;
  clearAudit();
});

describe("DELETE /items/:id", () => {
  it("returns 204 and removes the item", () => {
    const created = handle({ method: "POST", path: "/items", body: { name: "thing", qty: 1 } });
    const item = created.body as { id: string };

    const res = handle({ method: "DELETE", path: `/items/${item.id}` });
    expect(res.status).toBe(204);
    expect(store).toHaveLength(0);
  });

  it("returns 404 for an unknown id", () => {
    const res = handle({ method: "DELETE", path: "/items/does-not-exist" });
    expect(res.status).toBe(404);
  });
});

describe("audit — POST /items", () => {
  it("appends a create entry after successful POST", () => {
    const res = handle({ method: "POST", path: "/items", body: { name: "widget", qty: 5 } });
    const item = res.body as { id: string };

    const entries = queryAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("create");
    expect(entries[0].entityId).toBe(item.id);
    expect(typeof entries[0].eventId).toBe("string");
    expect(entries[0].eventId.length).toBeGreaterThan(0);
    expect(typeof entries[0].timestamp).toBe("number");
  });

  it("does NOT append an entry when POST body is invalid", () => {
    handle({ method: "POST", path: "/items", body: { qty: -1 } });
    expect(queryAudit()).toHaveLength(0);
  });
});

describe("audit — DELETE /items/:id", () => {
  it("appends a delete entry after successful DELETE", () => {
    const created = handle({ method: "POST", path: "/items", body: { name: "doomed", qty: 1 } });
    const item = created.body as { id: string };
    clearAudit();

    handle({ method: "DELETE", path: `/items/${item.id}` });

    const entries = queryAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("delete");
    expect(entries[0].entityId).toBe(item.id);
  });

  it("does NOT append an entry when DELETE target is not found", () => {
    handle({ method: "DELETE", path: "/items/ghost" });
    expect(queryAudit()).toHaveLength(0);
  });
});

describe("GET /audit", () => {
  it("returns all entries with status 200", () => {
    handle({ method: "POST", path: "/items", body: { name: "a", qty: 1 } });
    handle({ method: "POST", path: "/items", body: { name: "b", qty: 2 } });

    const res = handle({ method: "GET", path: "/audit" });
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(2);
  });

  it("filters by ?action=create", () => {
    const r = handle({ method: "POST", path: "/items", body: { name: "x", qty: 1 } });
    const id = (r.body as { id: string }).id;
    handle({ method: "DELETE", path: `/items/${id}` });

    const res = handle({ method: "GET", path: "/audit", query: { action: "create" } });
    const entries = res.body as Array<{ action: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("create");
  });

  it("filters by ?entityId=", () => {
    const r1 = handle({ method: "POST", path: "/items", body: { name: "p", qty: 1 } });
    handle({ method: "POST", path: "/items", body: { name: "q", qty: 2 } });
    const id1 = (r1.body as { id: string }).id;

    const res = handle({ method: "GET", path: "/audit", query: { entityId: id1 } });
    const entries = res.body as Array<{ entityId: string }>;
    expect(entries.every((e) => e.entityId === id1)).toBe(true);
    expect(entries).toHaveLength(1);
  });

  it("entries are sorted ascending by timestamp", () => {
    handle({ method: "POST", path: "/items", body: { name: "first", qty: 1 } });
    handle({ method: "POST", path: "/items", body: { name: "second", qty: 2 } });

    const res = handle({ method: "GET", path: "/audit" });
    const entries = res.body as Array<{ timestamp: number }>;
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i - 1].timestamp);
    }
  });

  it("read-only routes do NOT produce audit entries", () => {
    handle({ method: "GET", path: "/ping" });
    handle({ method: "GET", path: "/items" });
    expect(queryAudit()).toHaveLength(0);
  });

  it("each eventId is unique across entries", () => {
    handle({ method: "POST", path: "/items", body: { name: "m", qty: 1 } });
    handle({ method: "POST", path: "/items", body: { name: "n", qty: 2 } });

    const entries = queryAudit();
    const ids = entries.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
