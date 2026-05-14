# Local Dev Config

`scripts/dev/config` owns local developer configuration templates used by local stack and validation scripts. It does not own data refresh pipeline logic, ops scheduled-task wrappers, shared script libraries, or CI workflow business logic.

- `local-stack.config.example.json`
  - Committed template for local ports, DB, Redis, auth, MinIO, and backend refresh scheduler options
- `local-stack.config.json`
  - Ignored local copy used by `scripts/dev/start-local-stack.ps1` and verification scripts
- `credentials.example.json`
  - Committed MinIO credentials template
- `credentials.json`
  - Ignored local MinIO credential file referenced from `local-stack.config.json`

Do not copy real local secrets into committed docs or reports. This includes DB passwords, Redis passwords, admin passwords, token secrets, bearer tokens, and MinIO keys.

Stable consumers:

- `scripts/dev/start-local-stack.ps1`
- `scripts/dev/stop-local-stack.ps1`
- `scripts/dev/verify-local-stack.ps1`
- `scripts/dev/smoke-local-stack.ps1`
- `scripts/dev/quality-gate.ps1`
- `scripts/dev/quality-gate-ci.ps1`
- `scripts/lib/local-runtime-config.mjs`
- `scripts/data/workflow/run-backend-data-refresh.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `scripts/ops/*.ps1`

Boundary rules:

- Keep template keys stable for local stack, data refresh, and ops callers unless a separate implementation plan owns the compatibility update.
- `.github/workflows/**` should invoke stable scripts and must not duplicate local config parsing or data refresh pipeline logic.
- This README documents configuration ownership only and must not change command behavior or scheduler defaults.

Recommended setup:

```powershell
Copy-Item .\scripts\dev\config\local-stack.config.example.json .\scripts\dev\config\local-stack.config.json
Copy-Item .\scripts\dev\config\credentials.example.json .\scripts\dev\config\credentials.json
```

Scheduler notes:

- Local self-start acceptance assumes `dataRefresh.enabled=false`.
- `dataRefresh.mode=apply` is a write-capable scheduler setting. It must not be enabled as part of `verify-local-stack.ps1`, `start-local-stack.ps1`, or `smoke-local-stack.ps1`.
- Configured ports are expected bind targets. An open port is only a TCP fact and does not prove business health.
- MinIO and storage sync are outside the default read-only smoke boundary.

- `dataRefresh.enabled`
  - Whether `run-backend-data-refresh-daemon.mjs` should run continuously
- `dataRefresh.intervalMinutes`
  - Refresh interval for the scheduled backend data sync loop
- `dataRefresh.reportDir`
  - Directory for timestamped backend refresh reports
- `dataRefresh.lockFile`
  - Lock file used to prevent overlapping refresh cycles
- `dataRefresh.stateFile`
  - Latest scheduler state snapshot for ops review
- `dataRefresh.heartbeatSeconds`
  - Interval for daemon-level heartbeat updates
- `dataRefresh.heartbeatFile`
  - Latest daemon heartbeat snapshot for watchdogs and ops review
