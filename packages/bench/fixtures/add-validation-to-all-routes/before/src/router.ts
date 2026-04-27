export type Req = { method: string; path: string; body?: Record<string, unknown>; params?: Record<string, string> };
export type Res = { status: number; body: unknown };

export function handle(req: Req): Res {
  if (req.method === "POST" && req.path === "/users") {
    return { status: 201, body: { id: 1, ...req.body } };
  }
  if (req.method === "POST" && req.path === "/posts") {
    return { status: 201, body: { id: 1, ...req.body } };
  }
  if (req.method === "PUT" && req.path.startsWith("/posts/")) {
    return { status: 200, body: { id: req.params?.id, ...req.body } };
  }
  if (req.method === "DELETE" && req.path.startsWith("/users/")) {
    return { status: 204, body: null };
  }
  if (req.method === "POST" && req.path === "/comments") {
    return { status: 201, body: { id: 1, ...req.body } };
  }
  return { status: 404, body: { error: "not found" } };
}
