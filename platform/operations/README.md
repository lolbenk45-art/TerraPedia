# Ops Scripts

`platform/operations` owns machine-level automation wrappers for scheduled
tasks, daemon hosts, heartbeat checks, recovery, and registration or
unregistration flows. The former `scripts/ops` entrypoint was removed when the
compatibility window closed.

## WSL/Linux Entrypoints

Primary WSL/Linux entrypoints:

- `platform/operations/run-backend-refresh-daemon-host.sh`
- `platform/operations/run-backend-refresh-scheduled.sh`
- `platform/operations/check-backend-refresh-daemon-heartbeat.sh`

The refresh wrappers keep business refresh logic in `pipelines/workflow/run-backend-data-refresh-daemon.mjs`. Use:

```bash
bash platform/operations/run-backend-refresh-daemon-host.sh --mode apply
bash platform/operations/run-backend-refresh-scheduled.sh --mode apply
bash platform/operations/check-backend-refresh-daemon-heartbeat.sh
```

`run-backend-refresh-daemon-host.sh` runs the foreground daemon. `run-backend-refresh-scheduled.sh` runs the same workflow with `--once=true` for timer-style execution.

## WSL/Linux Scheduling

Example systemd user units live under `platform/operations/systemd/`:

- `backend-refresh-daemon.service.example`
- `backend-refresh-scheduled.service.example`
- `backend-refresh-scheduled.timer.example`

Copy examples into `~/.config/systemd/user/`, adjust `WorkingDirectory` and `ExecStart` paths if the repository is not at `~/TerraPedia`, then use the normal user-service lifecycle:

```bash
systemctl --user daemon-reload
systemctl --user enable --now backend-refresh-scheduled.timer
```

Do not treat these examples as a one-to-one translation of Windows Task Scheduler. WSL/Linux scheduling should use systemd user services and timers for this migration path.

## Windows Compatibility

Windows Task Scheduler scripts remain Windows-only compatibility surfaces until a later deletion or archive phase:

- `platform/operations/check-backend-refresh-daemon-heartbeat.ps1`
- `platform/operations/recover-backend-refresh-daemon.ps1`
- `platform/operations/register-backend-refresh-daemon-task.ps1`
- `platform/operations/register-backend-refresh-scheduled-task.ps1`
- `platform/operations/run-backend-refresh-daemon-host.ps1`
- `platform/operations/run-backend-refresh-scheduled.ps1`
- `platform/operations/unregister-backend-refresh-daemon-task.ps1`
- `platform/operations/unregister-backend-refresh-scheduled-task.ps1`

## Boundary Rules

- Ops wrappers may orchestrate stable data refresh scripts, but business refresh logic belongs in `pipelines/workflow`.
- CI workflow YAML should call stable scripts and must not duplicate ops or data pipeline internals.
- Windows PowerShell wrappers are path-sensitive compatibility scripts. Do not register or modify them from the WSL/Linux migration path.
