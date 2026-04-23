import { store } from "./store.js";

export type Req = { method: string; path: string; query: Record<string, string> };
export type Res = { status: number; body: unknown };

export function handle(req: Req): Res {
  if (req.method === "GET" && req.path === "/items") {
    return { status: 200, body: store };
  }
  return { status: 404, body: "not found" };
}
