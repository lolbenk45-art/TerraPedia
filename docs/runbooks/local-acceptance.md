# Local Stack Acceptance

## Purpose

This runbook verifies a local TerraPedia runtime without changing crawler, import, backfill, refresh, evidence, or application data.

Bash/WSL is the primary acceptance path. During the migration window, matching `.ps1` files are temporary compatibility wrappers only.

Use the Bash-first sequence:

```bash
bash ./scripts/dev/verify-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/smoke-local-stack.sh
bash ./scripts/dev/stop-local-stack.sh
```

## Boundaries

- `verify-local-stack.sh` is preflight only. It checks DB TCP reachability, MyBatis XML shape, backend compile, and front/admin typecheck. It does not start or stop services and does not prove business health.
- `start-local-stack.sh` starts or reuses Redis, backend, front, and admin app after preflight. A true TCP port check means the port is open, not that the business API is healthy.
- `smoke-local-stack.sh` is post-start smoke only. It performs read-oriented HTTP probes and may use auth login only to read authenticated acceptance overview endpoints. It writes `reports/local-start/smoke-<timestamp>.json`.
- `stop-local-stack.sh` defaults to recorded pid files under `reports/local-start/*.pid`. Port cleanup requires explicit `--force-ports` and still applies ownership checks.
- `run-manifest.json` is written to `reports/local-start/run-manifest.json`. It must stay sanitized and must not include passwords, token secrets, bearer tokens, or MinIO secrets.

## Negative Rules

Do not run crawler, import, backfill, load, apply, write, refresh, evidence-generation, storage sync, or quality-gate mutation commands from this runbook.

The smoke result does not replace the data chain:

```text
manifest -> report evidence -> freshness audit -> manual refresh plan -> quality gate -> UI/API
```

Successful local smoke cannot make stale evidence fresh, cannot make planned-public domains route-ready, and cannot change Data Source or Domain Acceptance gate status.

## ForcePorts

Use `bash ./scripts/dev/stop-local-stack.sh --force-ports` only when pid files are missing or stale and the configured TerraPedia ports are known to belong to the current repo run.

Before using it:

- Check the process owner and command line.
- Confirm no unrelated local service uses the configured ports.
- Treat skipped ownership warnings as blockers, not noise.
