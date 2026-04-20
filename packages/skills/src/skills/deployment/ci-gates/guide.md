# CI gates

- Required before merge: typecheck, lint, unit tests, build, dependency audit. Each as a separate, named job.
- Every job is reproducible: pinned tool versions, pinned deps, no network access during tests where avoidable.
- Test job runs with `--coverage` and fails if coverage drops below the threshold.
- Integration tests run against a real DB/queue in CI, not mocks, when feasible.
- Flaky tests are quarantined with a ticket, not retried silently. Repeated retries hide real bugs.
- Main branch is protected: required checks + reviews + no force-push.
- Release job is separate and only runs from a tagged commit on main.
