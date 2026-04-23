import type { Router } from "./router.js";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

// Wire rate-limiting around the router's handle. Return the modified router.
export function applyMiddleware(router: Router, _opts: RateLimitOptions): Router {
  return router;
}
