import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Item } from "./item.js";
import { store } from "./store.js";

export type Req = { method: string; path: string; body?: unknown; query?: Record<string, string> };
export type Res = { status: number; body: unknown };

const ItemSchema = z.object({ name: z.string().min(1), qty: z.number().nonnegative() });

export function handle(req: Req): Res {
  if (req.method === "GET" && req.path === "/ping") {
    return { status: 200, body: "pong" };
  }

  if (req.method === "GET" && req.path === "/items") {
    return { status: 200, body: [...store] };
  }

  if (req.method === "POST" && req.path === "/items") {
    const parsed = ItemSchema.safeParse(req.body);
    if (!parsed.success) return { status: 400, body: { error: parsed.error.message } };
    const item: Item = { id: randomUUID(), ...parsed.data };
    store.push(item);
    return { status: 201, body: item };
  }

  return { status: 404, body: { error: "not found" } };
}
