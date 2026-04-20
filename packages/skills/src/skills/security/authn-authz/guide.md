# AuthN / AuthZ

- Authentication ≠ authorization. Every protected endpoint checks *both*: who you are AND what you can do.
- Authorize on every request, not just on login. Session ≠ permission grant.
- Check ownership on every resource access: `SELECT ... WHERE id = ? AND owner_id = currentUser`.
- Centralize permission logic (policy module / middleware). Don't scatter `if user.role === 'admin'` through handlers.
- Sessions: HttpOnly + Secure + SameSite cookies. Rotate session id on login. Expire on logout + idle timeout.
- Passwords: argon2id or bcrypt with cost ≥ 12. Never MD5/SHA1. Never log or email them.
- MFA-capable for admin/elevated roles. Rate-limit login + password-reset endpoints.
- Default deny: if the policy engine isn't sure, refuse.
