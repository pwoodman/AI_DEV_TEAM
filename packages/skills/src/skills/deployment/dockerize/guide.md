# Dockerize

- Multi-stage builds: fat builder, slim runtime. Final image has no compilers, no dev deps.
- Pin base image to a digest or specific version tag, not `:latest`.
- Run as a non-root user (`USER app`). Create the user in the image.
- `.dockerignore` excludes `node_modules`, `.git`, `.env`, test fixtures, build artifacts.
- One process per container. Use an init (`tini`) if you fork subprocesses.
- `HEALTHCHECK` defined. Expose only the ports you use.
- Cache layers deliberately: dependency install before source copy, so source changes don't invalidate deps.
- Image scanned (Trivy/Grype) in CI; critical CVEs block the build.
