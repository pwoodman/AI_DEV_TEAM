# Secrets handling

- Never commit secrets. `.env`, keys, tokens, private certs stay out of git via `.gitignore` + pre-commit hook.
- Load secrets from env vars or a secret manager (Vault, AWS Secrets Manager, Doppler). Never hardcode.
- Rotate credentials on any suspected exposure. Rotation plan documented per secret type.
- Redact secrets in logs, error messages, and telemetry. Assume logs are world-readable.
- Short-lived credentials > long-lived. Prefer OIDC/workload identity over static API keys.
- Principle of least privilege: scope tokens to the narrowest resource + permission that works.
