export type Handler = (req: { method: string; path: string }) => {
  status: number;
  body: unknown;
};

const routes: Array<{ method: string; path: string; handler: Handler }> = [
  {
    method: "GET",
    path: "/ping",
    handler: () => ({ status: 200, body: "pong" }),
  },
];

export function handle(req: { method: string; path: string }) {
  const r = routes.find((x) => x.method === req.method && x.path === req.path);
  if (!r) return { status: 404, body: "not found" };
  return r.handler(req);
}
