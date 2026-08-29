# Local Dev Config

`platform/local/config` owns local developer configuration templates used by local stack and validation scripts. It does not own data refresh pipeline logic, ops scheduled-task wrappers, shared script libraries, or CI workflow business logic.

- `local-stack.config.example.json`
  - Committed template for local ports, DB, Redis, auth, MinIO, and backend refresh scheduler options
- `local-stack.config.json`
  - Ignored local copy used by `platform/local/start-local-stack.sh` and verification scripts
- `credentials.example.json`
  - Committed MinIO credentials template
- `credentials.json`
  - Ignored local MinIO credential file referenced from `local-stack.config.json`

Do not copy real local secrets into committed docs or reports. This includes DB passwords, Redis passwords, admin passwords, token secrets, bearer tokens, MinIO keys, and SMTP authorization codes.

Stable consumers:

- `platform/local/start-local-stack.sh`
- `platform/local/stop-local-stack.sh`
- `platform/local/verify-local-stack.sh`
- `platform/local/smoke-local-stack.sh`
- `platform/local/quality-gate.sh`
- `platform/local/quality-gate-ci.sh`
- `scripts/lib/local-runtime-config.mjs`
- `pipelines/workflow/run-backend-data-refresh.mjs`
- `pipelines/workflow/run-backend-data-refresh-daemon.mjs`
- `platform/operations/*.sh` target wrappers for WSL/Linux ops
- `platform/operations/*.ps1` temporary Windows compatibility wrappers during migration

Boundary rules:

- Keep template keys stable for local stack, data refresh, and ops callers unless a separate implementation plan owns the compatibility update.
- `.github/workflows/**` should invoke stable scripts and must not duplicate local config parsing or data refresh pipeline logic.
- This README documents configuration ownership only and must not change command behavior or scheduler defaults.

Recommended setup:

```bash
cp ./platform/local/config/local-stack.config.example.json ./platform/local/config/local-stack.config.json
cp ./platform/local/config/credentials.example.json ./platform/local/config/credentials.json
```

Mail notes:

- Local stack reads project-root `.env` before resolving runtime config.
- Preferred SMTP keys are `TERRAPEDIA_MAIL_USERNAME`, `TERRAPEDIA_MAIL_PASSWORD`, and `TERRAPEDIA_MAIL_FROM`.
- `QQ_SMTP` is accepted as a local compatibility alias for `TERRAPEDIA_MAIL_PASSWORD` only.
- `QQ_EMAIL`, `QQ_NUMBER`, or `QQ` can be used as local aliases for the sender mailbox.
- QQ Mail requires both the sender email address and the SMTP authorization code; the authorization code alone is not enough.

Scheduler notes:

- Local self-start acceptance assumes `dataRefresh.enabled=false`.
- `dataRefresh.mode=apply` is a write-capable scheduler setting. It must not be enabled as part of `verify-local-stack.sh`, `start-local-stack.sh`, or `smoke-local-stack.sh`.
- Configured ports are expected bind targets. An open port is only a TCP fact and does not prove business health.
- MinIO and storage sync are outside the default read-only smoke boundary.
- Managed image reads use `TERRAPEDIA_IMAGE_ORIGIN` first, then `TERRAPEDIA_MINIO_PUBLIC_ENDPOINT`, and default to the MinIO object API on `http://localhost:19000`.
- `19001` is the MinIO console port, not an image origin. Do not use it for `endpoint`, `publicEndpoint`, or `TERRAPEDIA_IMAGE_ORIGIN`.
- Legacy `http://localhost:9000` and `http://127.0.0.1:9000` image URLs are compatibility origins only; local startup may proxy them to the canonical object API when the port is free.

Local API acceptance notes:

- `start-local-stack.sh` exports `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=true` by default and preserves an explicitly provided value. The generated `reports/local-start/run-manifest.json` records the effective value under `backend.httpRateLimitEnabled`.
- A read-only NPC runtime parity audit may use `--fast-local-api` only with an API base URL on `localhost`, `127.0.0.1`, or `[::1]`; this sets its request interval to zero and rejects remote URLs. For a loopback acceptance run that needs the backend limiter disabled, set `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false` for that stack process only, then restore the default for ordinary local development.

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
