# Secrets Handling

## Scope

Secret storage, access, rotation, leak prevention, and incident response across development, CI/CD, and production environments.

## Non-negotiables

- Secrets are never hardcoded, committed, or logged. Enforce with `.gitignore`, `.dockerignore`, pre-commit hooks (git-secrets, detect-secrets, truffleHog), and CI scanning.
- Runtime secret retrieval uses environment variable injection or managed secret stores (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault). Never bake secrets into container images.
- Credentials are least-privilege and short-lived where platform supports identity federation (IAM roles, workload identity, OIDC). Rotate service account keys quarterly or on suspicion of exposure.
- Logs, errors, and telemetry redact secret-like values by default. Mask tokens, passwords, and keys in request/response logging. Use structured log redaction rules.
- Exposure response includes: immediate rotation, session revocation, audit trail review, and incident record. Document the rotation procedure and test it quarterly.
- Development secrets use separate values from production. Never share production credentials with local environments. Use `.env.example` for required variables, never `.env`.
- CI/CD pipelines use short-lived OIDC tokens or repository secrets scoped to the job. Never pass long-lived service account keys as environment variables.
- Secret rotation is automated where possible: database passwords via IAM auth, TLS certs via cert-manager, API keys via secret manager rotation webhooks.

## Review checks

- Secret inventory includes: owner, scope, rotation cadence, and last rotated date.
- CI scans detect committed keys/tokens before merge with blocking gates.
- No secret references in source code (grep for `password=`, `token=`, `secret=`, `api_key=`).
- Log redaction rules are tested with sample sensitive payloads.
- Incident response playbook for secret exposure is documented and drill-tested.
