// God module — five responsibilities mixed together. Split into focused modules.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedRequest {
  userId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseRequest(raw: string): ParsedRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("expected object");
  const obj = parsed as Record<string, unknown>;
  const userId = typeof obj.userId === "string" ? obj.userId : "";
  const action = typeof obj.action === "string" ? obj.action : "";
  const payload =
    obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
      ? (obj.payload as Record<string, unknown>)
      : {};
  return { userId, action, payload };
}

// ── Response formatter ────────────────────────────────────────────────────────

export function formatOk(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

export function formatError(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}

// ── Validator ─────────────────────────────────────────────────────────────────

const ALLOWED_ACTIONS = new Set(["read", "write", "delete", "list"]);

export function validateRequest(req: ParsedRequest): ValidationResult {
  const errors: string[] = [];
  if (!req.userId) errors.push("userId is required");
  if (!req.action) errors.push("action is required");
  if (req.action && !ALLOWED_ACTIONS.has(req.action)) errors.push(`unknown action: ${req.action}`);
  return { ok: errors.length === 0, errors };
}

// ── Permissions ───────────────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  admin: new Set(["read", "write", "delete", "list"]),
  editor: new Set(["read", "write", "list"]),
  viewer: new Set(["read", "list"]),
};

const USER_ROLES: Record<string, string> = {
  "user-1": "admin",
  "user-2": "editor",
  "user-3": "viewer",
};

export function checkPermission(userId: string, action: string): boolean {
  const role = USER_ROLES[userId] ?? "viewer";
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(userId);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetInMs: WINDOW_MS };
  }
  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: WINDOW_MS - (now - bucket.windowStart),
    };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - bucket.count,
    resetInMs: WINDOW_MS - (now - bucket.windowStart),
  };
}
