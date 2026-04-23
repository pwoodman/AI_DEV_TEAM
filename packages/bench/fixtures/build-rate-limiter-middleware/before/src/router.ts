export type Req = { method: string; path: string };
export type Res = { status: number; body: unknown };
export type Handler = (req: Req) => Res;

export interface Router {
  routes: Array<{ method: string; path: string; handler: Handler }>;
  handle: (req: Req) => Res;
}

export function createRouter(): Router {
  const routes: Router["routes"] = [
    { method: "GET", path: "/ping", handler: () => ({ status: 200, body: "pong" }) },
  ];
  const handle = (req: Req): Res => {
    const r = routes.find((x) => x.method === req.method && x.path === req.path);
    if (!r) return { status: 404, body: "not found" };
    return r.handler(req);
  };
  return { routes, handle };
}
