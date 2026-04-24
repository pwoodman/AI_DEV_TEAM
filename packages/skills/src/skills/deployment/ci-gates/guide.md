# CI Gates

## Scope

Merge and release controls that prevent low-signal, unsafe, or broken deploys through automated quality gates.

## Non-negotiables

- Required jobs are separate and named: typecheck, lint, tests (unit + integration), build, dependency audit (npm audit, pip-audit, cargo audit), and container scan.
- CI is reproducible: pinned toolchain versions, locked dependencies, deterministic scripts. Use exact versions in `package.json`, `requirements.txt`, `go.mod`, or lockfiles.
- Test stage enforces coverage floor and fails on regression. Track coverage trends, not just absolute numbers. Fail if coverage drops by >2% or falls below threshold.
- Integration tests run against real infrastructure components when practical (testcontainers, localstack, ephemeral databases). Mock only external services you do not own.
- Flaky tests are quarantined with owner and ticket, not silently retried. Retry is allowed only for infrastructure flakes (network timeouts), never for logic bugs.
- Protected branch rules require reviews and passing checks; release runs from tagged main only. No direct pushes to main. Require signed commits for release branches.
- Build artifacts are immutable and signed. Container images use SBOM generation and signing (cosign, notation). Never rebuild artifacts for production deployment.
- Deployment gates require: passing tests, security scan clearance, manual approval for production, and automated rollback trigger on error rate > threshold.

## Review checks

- Gate failures are actionable and link to owning team/runbook. No generic "build failed" messages.
- New repos/services inherit the same baseline gate set via shared workflow templates or policy-as-code.
- CI duration is monitored; alert on jobs taking >2x normal duration.
- Secret scanning (git-secrets, truffleHog, GitHub secret scanning) runs on every push and blocks on findings.
- Check omitted: automated CI configuration review requires manual DevOps review.
