import type { Item } from "./item.js";
import { store } from "./store.js";

export type Req = { method: string; path: string; body?: unknown };
export type Handler = (req: Req) => { status: number; body: unknown };

const routes: Array<{ method: string; path: string; handler: Handler }> = [
  {
    method: "GET",
    path: "/ping",
    handler: () => ({ status: 200, body: "pong" }),
  },
];

export function handle(req: Req) {
  const r = routes.find((x) => x.method === req.method && x.path === req.path);
  if (!r) return { status: 404, body: "not found" };
  return r.handler(req);
}
