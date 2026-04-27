import {
  parseRequest,
  formatOk,
  formatError,
  validateRequest,
  checkPermission,
  checkRateLimit,
} from "./god.js";

export function handleRequest(raw: string, userId?: string): string {
  let req;
  try {
    req = parseRequest(raw);
  } catch (e) {
    return formatError((e as Error).message);
  }

  if (userId) req = { ...req, userId };

  const rateResult = checkRateLimit(req.userId);
  if (!rateResult.allowed) return formatError("rate limit exceeded");

  const validation = validateRequest(req);
  if (!validation.ok) return formatError(validation.errors.join(", "));

  if (!checkPermission(req.userId, req.action)) return formatError("forbidden");

  return formatOk({ action: req.action, payload: req.payload });
}
