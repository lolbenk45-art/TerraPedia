# Script Layout

Use the repo root as the working directory unless a script says otherwise.

## Responsibility Map

- `platform/local`
  - Local developer stack lifecycle, local validation gates, smoke checks, and config templates.
  - Bash/WSL primary entrypoints: `platform/local/start-local-stack.sh`, `platform/local/stop-local-stack.sh`, `platform/local/verify-local-stack.sh`, `platform/local/smoke-local-stack.sh`, `platform/local/quality-gate.sh`, and `platform/local/quality-gate-ci.sh`.
  - Matching `.ps1` files are Windows-specific wrappers around canonical commands.
- `platform/operations`
  - WSL/Linux daemon host wrappers, heartbeat checks, recovery wrappers, systemd examples, and machine lifecycle glue.
  - Bash-first target entrypoints: `platform/operations/*.sh`.
  - Windows Scheduled Task `.ps1` files remain Windows-only wrappers for scheduled operations.
- `platform/tooling`
  - Repository maintenance tooling that is not app runtime, not data lifecycle automation, and not CI workflow logic.
- `scripts/lib`
  - Shared automation helpers used by script groups without owning business pipelines.
  - Stable entrypoint: `scripts/lib/local-runtime-config.mjs`.
- `pipelines`
  - Data lifecycle automation with explicit `fetch -> normalize/transform -> canonical -> audit -> import/backfill/sync -> workflow -> export` responsibilities.
  - Stable entrypoints include `pipelines/workflow/run-wiki-sync.mjs`, `pipelines/workflow/run-backend-data-refresh.mjs`, `pipelines/workflow/run-backend-data-refresh-daemon.mjs`, and `pipelines/crawler/source-layout-check.mjs`.

## Automation Boundary

- `.github/workflows/**` should call stable scripts such as the quality gates and data checks instead of embedding business pipeline logic directly in workflow YAML.
- Keep script behavior, defaults, argument contracts, and test lists stable unless a separate implementation plan explicitly owns those changes.
- `pipelines/` is the only pipeline root. The retired `scripts/data/` path must
  not be recreated or used in new commands.
- README files document ownership only. They must not redefine command behavior.
