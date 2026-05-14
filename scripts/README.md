# Script Layout

Use the repo root as the working directory unless a script says otherwise.

## Responsibility Map

- `scripts/dev`
  - Local developer stack lifecycle, local validation gates, smoke checks, and config templates.
  - Bash/WSL primary entrypoints: `scripts/dev/start-local-stack.sh`, `scripts/dev/stop-local-stack.sh`, `scripts/dev/verify-local-stack.sh`, `scripts/dev/smoke-local-stack.sh`, `scripts/dev/quality-gate.sh`, and `scripts/dev/quality-gate-ci.sh`.
  - Matching `.ps1` files are temporary compatibility wrappers during the migration window.
- `scripts/ops`
  - WSL/Linux daemon host wrappers, heartbeat checks, recovery wrappers, systemd examples, and machine lifecycle glue.
  - Bash-first target entrypoints: `scripts/ops/*.sh`.
  - Windows Scheduled Task `.ps1` files remain Windows-only compatibility wrappers until the later cleanup phase.
- `scripts/tooling`
  - Repository maintenance tooling that is not app runtime, not data lifecycle automation, and not CI workflow logic.
- `scripts/lib`
  - Shared automation helpers used by script groups without owning business pipelines.
  - Stable entrypoint: `scripts/lib/local-runtime-config.mjs`.
- `scripts/data`
  - Data lifecycle automation with explicit `fetch -> normalize/transform -> canonical -> audit -> import/backfill/sync -> workflow -> export` responsibilities.
  - Stable entrypoints include `scripts/data/workflow/run-wiki-sync.mjs`, `scripts/data/workflow/run-backend-data-refresh.mjs`, `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`, and `scripts/data/crawler/source-layout-check.mjs`.

## Automation Boundary

- `.github/workflows/**` should call stable scripts such as the quality gates and data checks instead of embedding business pipeline logic directly in workflow YAML.
- Keep script behavior, defaults, argument contracts, and test lists stable unless a separate implementation plan explicitly owns those changes.
- In this structure pass, do not move `scripts/data/workflow/**`, `scripts/data/audit/**`, crawler source or crawler tests, Bash migration wrappers, or Windows compatibility wrappers.
- README files document ownership only. They must not redefine command behavior.
