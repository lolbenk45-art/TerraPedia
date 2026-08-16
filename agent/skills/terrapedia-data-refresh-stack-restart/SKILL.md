---
name: terrapedia-data-refresh-stack-restart
description: Use when a TerraPedia data refresh, database repair, or reload must be followed by a local stack restart or verification.
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
   - `platform/local/config/local-stack.config.json`
3. Run the canonical refresh entrypoint.
   - One-off refresh: `node pipelines/workflow/run-backend-data-refresh.mjs --mode=apply`
   - Plan only: `node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan`
   - If the request explicitly concerns the scheduler or daemon, use `platform/operations/run-backend-refresh-scheduled.ps1` or `platform/operations/run-backend-refresh-daemon-host.ps1`.
4. Restart the local stack with `platform/local/stop-local-stack.ps1` then `platform/local/start-local-stack.ps1`.
5. Verify the stack with `platform/local/verify-local-stack.ps1`.
6. If a refresh daemon ran, confirm its heartbeat with `platform/operations/check-backend-refresh-daemon-heartbeat.ps1`.

## Rules

- Treat stale heartbeat, missing PID files, or occupied ports as evidence that the stack is not settled yet.
- Do not report success until refresh, restart, and verification all pass.
- Do not invent alternate restart commands when the repo scripts already exist.
- If the request points at production or an unknown database, stop and report the ambiguity.

## Common Command Map

| Goal | Command |
| --- | --- |
| Refresh data once | `node pipelines/workflow/run-backend-data-refresh.mjs --mode=apply` |
| Preview refresh plan | `node pipelines/workflow/run-backend-data-refresh.mjs --mode=plan` |
| Stop local stack | `platform/local/stop-local-stack.ps1` |
| Start local stack | `platform/local/start-local-stack.ps1` |
| Verify local stack | `platform/local/verify-local-stack.ps1` |
| Check refresh heartbeat | `platform/operations/check-backend-refresh-daemon-heartbeat.ps1` |
