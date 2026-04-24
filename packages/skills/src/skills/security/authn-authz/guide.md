# Authentication and Authorization

## Scope

Identity verification, session management, permission enforcement, and secure access control for protected resources.

## Non-negotiables

- Authentication (who you are) and authorization (what you can do) are separate, explicit checks on every protected request. Never conflate them.
- Resource-level ownership/tenant checks are enforced server-side. Never trust client-sent ownership IDs without verification against the authenticated identity.
- Permission logic is centralized (policy engine, middleware, or decorator), not duplicated in individual route handlers. Use RBAC, ABAC, or ReBAC with explicit policy definitions.
- Sessions use secure cookie settings (`HttpOnly`, `Secure`, `SameSite=Strict` or `Lax`), rotation on privilege change, and idle/absolute expiry. Store session state server-side or use signed JWT with short expiry.
- Passwords use modern KDFs (`argon2id`, `bcrypt`, or `scrypt`) with appropriate cost factors. Never log passwords, tokens, or hashes. Enforce minimum complexity (NIST 800-63B guidelines).
- Admin/elevated flows support MFA (TOTP, WebAuthn, or push) and aggressive rate limits (e.g., 3 attempts per 15 minutes). Alert on privilege escalation attempts.
- Default decision is deny on policy uncertainty or lookup failure. Log all access denials with context (user, resource, attempted action, timestamp).
- Token refresh uses rotation: issue new refresh token on every use, invalidate the old one. Detect reuse of invalidated refresh tokens and revoke the entire session family.
- API keys are scoped, time-bound, and revocable. Never use long-lived API keys for user-facing flows.

## Review checks

- Privilege escalation paths are covered by tests (horizontal and vertical escalation).
- Audit events exist for: login success/failure, role change, password change, MFA enrollment, sensitive action execution.
- Session timeout and concurrent session limits are enforced.
- Authorization decisions are cached only with TTL and invalidation on policy change.
- Check omitted: automated authorization logic review is manual review only.
