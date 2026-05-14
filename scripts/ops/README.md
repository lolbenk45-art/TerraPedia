# Ops Scripts

`scripts/ops` owns machine-level automation wrappers for scheduled tasks, daemon hosts, heartbeat checks, recovery, and registration or unregistration flows.

Stable entrypoints:

- `scripts/ops/check-backend-refresh-daemon-heartbeat.ps1`
- `scripts/ops/recover-backend-refresh-daemon.ps1`
- `scripts/ops/register-backend-refresh-daemon-task.ps1`
- `scripts/ops/register-backend-refresh-scheduled-task.ps1`
- `scripts/ops/run-backend-refresh-daemon-host.ps1`
- `scripts/ops/run-backend-refresh-scheduled.ps1`
- `scripts/ops/unregister-backend-refresh-daemon-task.ps1`
- `scripts/ops/unregister-backend-refresh-scheduled-task.ps1`

Boundary rules:

- Ops wrappers may orchestrate stable data refresh scripts, but business refresh logic belongs in `scripts/data/workflow`.
- CI workflow YAML should call stable scripts and must not duplicate ops or data pipeline internals.
- These PowerShell wrappers are path-sensitive and are not move candidates in the current responsibility-structure pass.
