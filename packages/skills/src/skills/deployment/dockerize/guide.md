add something for regex# Dockerize

## Scope

Secure, small, reproducible, and efficient production container images with minimal attack surface.

## Non-negotiables

- Multi-stage builds produce minimal runtime images without compilers, dev tools, or build artifacts. Final stage contains only runtime dependencies and application binaries.
- Base images are pinned by version or digest, never `:latest`. Document the base image update process and scan for CVEs before adoption.
- Containers run as non-root with explicit `USER` directive. Use distroless, scratch, or dedicated non-root base images. Drop all capabilities except required ones.
- `.dockerignore` excludes secrets, VCS metadata (`.git`), dependencies (`node_modules` if built), test artifacts, and local config files. Prevent context bloat and secret leakage.
- Health checks (`HEALTHCHECK`) and explicit exposed ports are defined. Health check should validate application functionality, not just process existence.
- CI image scans (Trivy, Snyk, Clair, Grype) block on critical vulnerabilities. Define SLA for CVE remediation (e.g., critical: 24h, high: 7 days).
- Build arguments and labels include: version, git commit, build timestamp. Never pass secrets as build args unless using BuildKit secret mounts.
- Layer order optimizes cache reuse: stable dependencies before application source. Copy `package.json`/`lockfile` before `npm install`, then copy source last.

## Review checks

- Runtime image contains only required binaries/assets (no `curl`, `wget`, `ssh`, `gcc`, `git`).
- Image size is monitored; alert on unexpected growth.
- No secrets in image layers (scan with `dive` or `docker history`).
- Health check endpoint validates database connectivity and critical dependencies.
- Rebuild from scratch reproduces identical functional behavior (deterministic build).
