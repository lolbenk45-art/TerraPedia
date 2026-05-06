# Local Dev Config

- `local-stack.config.example.json`
  - Committed template for local ports, DB, Redis, auth, MinIO, and backend refresh scheduler options
- `local-stack.config.json`
  - Ignored local copy used by `scripts/dev/start-local-stack.ps1` and verification scripts
- `credentials.example.json`
  - Committed MinIO credentials template
- `credentials.json`
  - Ignored local MinIO credential file referenced from `local-stack.config.json`

Do not copy real local secrets into committed docs or reports. This includes DB passwords, Redis passwords, admin passwords, token secrets, bearer tokens, and MinIO keys.

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
