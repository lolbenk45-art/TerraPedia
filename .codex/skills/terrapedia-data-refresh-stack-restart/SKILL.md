---
name: terrapedia-data-refresh-stack-restart
description: Use when Codex is asked to refresh, update, reload, sync, backfill, or repair TerraPedia data or database and then restart or verify the local project stack, project group, backend, front, admin, or services, including requests like "更新数据和重启项目组", "更新数据库并重启项目", "刷新数据后重启服务", "restart stack after data refresh", or "refresh database and restart local stack".
---

# Terrapedia Data Refresh Stack Restart

## Overview

Use this skill for local TerraPedia data refresh work that must end with a restarted and verified stack. Prefer repo scripts and recorded runtime state over ad hoc commands.

## Workflow

1. Identify the target data, domain, or database and whether the request is a refresh, sync, backfill, or repair.
2. Inspect current runtime state before any write:
   - `reports/local-start/*.pid`
   - `reports/local-start/*.log`
   - `reports/backend-refresh/*`
   - `scripts/dev/config/local-stack.config.json`
3. Run the canonical refresh entrypoint.
   - One-off refresh: `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply`
   - Plan only: `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan`
   - If the request explicitly concerns the scheduler or daemon, use `scripts/ops/run-backend-refresh-scheduled.ps1` or `scripts/ops/run-backend-refresh-daemon-host.ps1`.
4. Restart the local stack with `scripts/dev/stop-local-stack.ps1` then `scripts/dev/start-local-stack.ps1`.
5. Verify the stack with `scripts/dev/verify-local-stack.ps1`.
6. If a refresh daemon ran, confirm its heartbeat with `scripts/ops/check-backend-refresh-daemon-heartbeat.ps1`.

## Rules

- Treat stale heartbeat, missing PID files, or occupied ports as evidence that the stack is not settled yet.
- Do not report success until refresh, restart, and verification all pass.
- Do not invent alternate restart commands when the repo scripts already exist.
- If the request points at production or an unknown database, stop and report the ambiguity.

## Common Command Map

| Goal | Command |
| --- | --- |
| Refresh data once | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=apply` |
| Preview refresh plan | `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan` |
| Stop local stack | `scripts/dev/stop-local-stack.ps1` |
| Start local stack | `scripts/dev/start-local-stack.ps1` |
| Verify local stack | `scripts/dev/verify-local-stack.ps1` |
| Check refresh heartbeat | `scripts/ops/check-backend-refresh-daemon-heartbeat.ps1` |
