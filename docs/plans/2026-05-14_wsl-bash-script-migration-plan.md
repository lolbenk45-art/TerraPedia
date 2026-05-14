# WSL Bash Script Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` for implementation. This plan is designed for parallel workers with disjoint write scopes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TerraPedia's active local development, quality gate, and WSL runtime script chain from Windows/PowerShell-first entrypoints to Bash/WSL-first entrypoints while preserving temporary `.ps1` wrapper compatibility.

**Architecture:** Bash owns shell entrypoints, process lifecycle, logs, pid files, and command orchestration. Node `.mjs` owns complex JSON parsing, HTTP calls, report generation, date handling, and cross-platform logic. Existing `.ps1` files are retained initially as thin wrappers or Windows-only compatibility scripts, then removed in a later cleanup after the Bash chain is stable.

**Tech Stack:** Bash, Node.js ESM, Maven, pnpm, MySQL/Redis CLI or TCP probes, GitHub Actions Ubuntu runners, existing TerraPedia `scripts/dev/config/local-stack.config.json`.

---

## Confirmed Decision

- Keep `.ps1` files temporarily as compatibility wrappers.
- Make Bash/WSL scripts the primary documented and tested path.
- Delete or archive `.ps1` only after the Bash main chain is stable and accepted.

## Scope

### In Scope

- Add Bash equivalents for active local dev scripts:
  - `scripts/dev/verify-local-stack.sh`
  - `scripts/dev/quality-gate.sh`
  - `scripts/dev/quality-gate-ci.sh`
  - `scripts/dev/start-local-stack.sh`
  - `scripts/dev/stop-local-stack.sh`
  - `scripts/dev/smoke-local-stack.sh`
- Convert high-complexity PowerShell scripts into Node-first implementations with Bash wrappers:
  - `scripts/dev/acceptance-test.ps1`
  - `scripts/dev/benchmark-read-api.ps1`
- Add WSL-compatible ops wrappers for backend refresh daemon workflows.
- Update tests, docs, and CI references to Bash-first entrypoints.
- Preserve old `.ps1` scripts as wrappers or Windows-only compatibility surfaces during the migration window.

### Out Of Scope

- Starting the project during implementation unless explicitly requested during validation.
- Removing all `.ps1` scripts in this phase.
- Rewriting historical archived plans solely to erase old PowerShell evidence.
- Migrating VS2022 GUI developer shell tooling to Bash; that remains Windows-only unless a separate tmux/Linux tooling task is opened.

## Non-Negotiable Safety Rules

- Do not run `start-local-stack.sh` or any long-running service script during implementation without explicit runtime validation approval.
- Do not use destructive process cleanup by default. Port-based cleanup must require an explicit `--force-ports` flag and still verify ownership.
- Do not write real secrets into tracked files.
- Do not duplicate business logic between PowerShell and Bash. If `.ps1` compatibility is needed, make it a thin wrapper over Bash or Node.
- Do not change data backfill or import behavior while migrating shell entrypoints.

---

## Target File Map

### Shared Bash Libraries

- Create `scripts/dev/lib/common.sh`
  - Resolve repo root.
  - Provide logging helpers.
  - Provide `require_command`.
  - Provide safe directory helpers.
- Create `scripts/dev/lib/runtime-config.sh`
  - Read `scripts/dev/config/local-stack.config.json`.
  - Resolve environment overrides.
  - Export DB, Redis, backend, front, admin, auth, and MinIO settings.
  - Use Node for JSON parsing instead of depending on `jq`.
- Create `scripts/dev/lib/run-step.sh`
  - Provide `run_step "Label" "cwd" command args...`.
  - Print cwd and command.
  - Preserve command exit code.
- Create `scripts/dev/lib/net.sh`
  - Provide `tcp_check host port timeout_ms`.
  - Provide `wait_port host port timeout_seconds`.
  - Prefer Node TCP helper for consistent WSL behavior.
- Create `scripts/dev/lib/process.sh`
  - Manage pid files under `reports/local-start/`.
  - Stop process trees by pid file.
  - Resolve port PIDs with `ss -ltnp`.
  - Verify command-line ownership before killing.

### Dev Entrypoints

- Create `scripts/dev/verify-local-stack.sh`
- Create `scripts/dev/quality-gate.sh`
- Create `scripts/dev/quality-gate-ci.sh`
- Create `scripts/dev/start-local-stack.sh`
- Create `scripts/dev/stop-local-stack.sh`
- Create `scripts/dev/smoke-local-stack.sh`

### Node-First Conversions

- Create `scripts/dev/acceptance-test.mjs`
- Create `scripts/dev/acceptance-test.sh`
- Create `scripts/dev/benchmark-read-api.mjs`
- Create `scripts/dev/benchmark-read-api.sh`

### Compatibility Wrappers

- Modify `scripts/dev/acceptance-test.ps1`
- Modify `scripts/dev/benchmark-read-api.ps1`
- Modify `scripts/dev/quality-gate.ps1`
- Modify `scripts/dev/quality-gate-ci.ps1`
- Modify `scripts/dev/verify-local-stack.ps1`
- Modify `scripts/dev/start-local-stack.ps1`
- Modify `scripts/dev/stop-local-stack.ps1`
- Modify `scripts/dev/smoke-local-stack.ps1`

Wrapper responsibility: locate repo root, locate `bash`, call the matching `.sh` or `.mjs`, pass through arguments, return the same exit code. Do not keep full duplicate logic in the wrappers after the Bash path is validated.

### Ops Migration

- Create `scripts/ops/run-backend-refresh-daemon-host.sh`
- Create `scripts/ops/run-backend-refresh-scheduled.sh`
- Create `scripts/ops/check-backend-refresh-daemon-heartbeat.mjs`
- Create `scripts/ops/check-backend-refresh-daemon-heartbeat.sh`
- Create `scripts/ops/systemd/backend-refresh-daemon.service.example`
- Create `scripts/ops/systemd/backend-refresh-scheduled.timer.example`
- Create `scripts/ops/systemd/backend-refresh-scheduled.service.example`
- Update `scripts/ops/README.md`

### Test And CI Surfaces

- Modify `scripts/dev/local-stack.test.mjs`
- Modify `scripts/dev/quality-gate.test.mjs`
- Modify `scripts/dev/acceptance-test.test.mjs`
- Modify `.github/workflows/quality-gate.yml`
- Modify `.github/workflows/scheduled-staleness-monitor.yml`

### Docs

- Modify `README.md`
- Modify `project-plan/00_协作开发标准流程.md`
- Modify `project-plan/00_项目总览.md`
- Modify `docs/runbooks/local-acceptance.md`
- Modify `scripts/dev/config/README.md`
- Modify `scripts/README.md`

---

## Multi-Agent Work Plan

### P0: Shared Bash Foundation

**Owner:** Agent A

**Write Scope:**

- `scripts/dev/lib/common.sh`
- `scripts/dev/lib/runtime-config.sh`
- `scripts/dev/lib/run-step.sh`
- `scripts/dev/lib/net.sh`
- `scripts/dev/lib/process.sh`
- Add focused tests only if existing test structure supports non-invasive script-source assertions.

**Steps:**

- [ ] Create `common.sh` with strict mode helper pattern, repo root resolution, `require_command`, and basic logging.
- [ ] Create `runtime-config.sh` using `node --input-type=module` to parse `local-stack.config.json` and print shell-safe `KEY=value` exports.
- [ ] Create `run-step.sh` with `run_step` that prints label, cwd, command, runs in a subshell, and propagates failures.
- [ ] Create `net.sh` with Node-backed TCP probe functions so WSL does not depend on `/dev/tcp` support.
- [ ] Create `process.sh` with pidfile helpers and ownership-aware process tree stopping.
- [ ] Verify shell syntax:

```bash
bash -n scripts/dev/lib/common.sh
bash -n scripts/dev/lib/runtime-config.sh
bash -n scripts/dev/lib/run-step.sh
bash -n scripts/dev/lib/net.sh
bash -n scripts/dev/lib/process.sh
```

**Acceptance:**

- Libraries are sourceable from repo root and from subdirectories.
- No library starts services or kills processes during source.
- No dependency on `jq`, `pwsh`, `powershell.exe`, `mvn.cmd`, `pnpm.cmd`, or Windows drive paths.

### P1: Verify And Quality Gates

**Owner:** Agent B

**Write Scope:**

- `scripts/dev/verify-local-stack.sh`
- `scripts/dev/quality-gate.sh`
- `scripts/dev/quality-gate-ci.sh`
- `scripts/dev/verify-local-stack.ps1`
- `scripts/dev/quality-gate.ps1`
- `scripts/dev/quality-gate-ci.ps1`
- `scripts/dev/quality-gate.test.mjs`
- Relevant parts of `scripts/dev/local-stack.test.mjs`

**Steps:**

- [ ] Implement `verify-local-stack.sh` with flags matching current behavior: `--skip-db`, `--skip-back`, `--skip-front`, `--skip-admin`.
- [ ] Preserve current checks: DB TCP preflight, MyBatis XML well-formed check, backend `mvn -DskipTests compile`, front `pnpm run check`, admin `pnpm run check`.
- [ ] Implement `quality-gate-ci.sh` with CI-safe checks currently present in `quality-gate-ci.ps1`.
- [ ] Implement `quality-gate.sh` with local full checks currently present in `quality-gate.ps1`, including `--full-data-audit`, `--skip-back`, `--skip-front`, and `--skip-admin`.
- [ ] Convert `.ps1` files to thin wrappers that call corresponding `.sh` scripts.
- [ ] Update tests to assert Bash entrypoints and Ubuntu CI behavior.
- [ ] Verify syntax and source assertions:

```bash
bash -n scripts/dev/verify-local-stack.sh
bash -n scripts/dev/quality-gate.sh
bash -n scripts/dev/quality-gate-ci.sh
node --test scripts/dev/quality-gate.test.mjs scripts/dev/local-stack.test.mjs
```

**Acceptance:**

- `quality-gate-ci.sh` does not start services.
- `verify-local-stack.sh` does not start or stop services.
- Tests no longer require `windows-latest`, `pwsh`, `mvn.cmd`, or `pnpm.cmd` for the active CI path.

### P2: Local Stack Lifecycle

**Owner:** Agent C

**Write Scope:**

- `scripts/dev/start-local-stack.sh`
- `scripts/dev/stop-local-stack.sh`
- `scripts/dev/smoke-local-stack.sh`
- `scripts/dev/start-local-stack.ps1`
- `scripts/dev/stop-local-stack.ps1`
- `scripts/dev/smoke-local-stack.ps1`
- Relevant parts of `scripts/dev/local-stack.test.mjs`

**Steps:**

- [ ] Implement `stop-local-stack.sh` first because `start-local-stack.sh` depends on safe cleanup.
- [ ] Implement pidfile-based stop behavior using `reports/local-start/*.pid`.
- [ ] Implement `--force-ports` as the only path that inspects configured ports and attempts ownership-aware cleanup.
- [ ] Implement `start-local-stack.sh` to call `verify-local-stack.sh`, start Redis only if configured port is not open, then start backend/front/admin with logs and pid files.
- [ ] Use `nohup` or background subshells with explicit log redirection under `reports/local-start/`.
- [ ] Write a sanitized run manifest that redacts passwords and token secrets.
- [ ] Implement `smoke-local-stack.sh` or a Node-backed smoke helper to preserve current HTTP checks and report shape.
- [ ] Convert related `.ps1` files to thin wrappers.
- [ ] Verify syntax and structural tests:

```bash
bash -n scripts/dev/stop-local-stack.sh
bash -n scripts/dev/start-local-stack.sh
bash -n scripts/dev/smoke-local-stack.sh
node --test scripts/dev/local-stack.test.mjs
```

**Acceptance:**

- Default stop never kills by port unless `--force-ports` is passed.
- Port cleanup verifies command-line or cwd ownership before kill.
- Start script writes pid files, logs, and a sanitized manifest.
- Smoke report does not persist login tokens.

### P3: Acceptance And Benchmark Node Conversions

**Owner:** Agent D

**Write Scope:**

- `scripts/dev/acceptance-test.mjs`
- `scripts/dev/acceptance-test.sh`
- `scripts/dev/acceptance-test.ps1`
- `scripts/dev/benchmark-read-api.mjs`
- `scripts/dev/benchmark-read-api.sh`
- `scripts/dev/benchmark-read-api.ps1`
- `scripts/dev/acceptance-test.test.mjs`

**Steps:**

- [ ] Port `acceptance-test.ps1` behavior into `acceptance-test.mjs`.
- [ ] Preserve no-DB and DB-required phase separation.
- [ ] Preserve `--allow-db-skip`, output report paths, summary JSON shape, and fail/warn/block semantics.
- [ ] Implement `acceptance-test.sh` as a thin wrapper over Node.
- [ ] Convert `acceptance-test.ps1` to a thin compatibility wrapper over the Node implementation.
- [ ] Port `benchmark-read-api.ps1` into `benchmark-read-api.mjs` using Node `fetch` and `performance.now`.
- [ ] Preserve JSON and Markdown report outputs.
- [ ] Implement `benchmark-read-api.sh` and thin `.ps1` wrapper.
- [ ] Verify source and unit tests:

```bash
bash -n scripts/dev/acceptance-test.sh
bash -n scripts/dev/benchmark-read-api.sh
node --test scripts/dev/acceptance-test.test.mjs
node scripts/dev/acceptance-test.mjs --skip-db --allow-db-skip
```

**Acceptance:**

- Node implementation does not use `powershell.exe`.
- Report output is UTF-8 and JSON-parseable.
- DB-required checks can be skipped only through explicit allowed skip behavior.

### P4: Ops And Background Refresh Migration

**Owner:** Agent E

**Write Scope:**

- `scripts/ops/run-backend-refresh-daemon-host.sh`
- `scripts/ops/run-backend-refresh-scheduled.sh`
- `scripts/ops/check-backend-refresh-daemon-heartbeat.mjs`
- `scripts/ops/check-backend-refresh-daemon-heartbeat.sh`
- `scripts/ops/systemd/*.example`
- `scripts/ops/README.md`
- Optionally, thin wrappers in existing `scripts/ops/*.ps1` only if needed.

**Steps:**

- [ ] Add `run-backend-refresh-daemon-host.sh` that runs `node scripts/data/workflow/run-backend-data-refresh-daemon.mjs`.
- [ ] Add `run-backend-refresh-scheduled.sh` that runs the same daemon with `--once=true`.
- [ ] Convert heartbeat check into Node CLI for robust JSON and date handling.
- [ ] Add `.sh` wrapper for heartbeat check.
- [ ] Add systemd user service/timer examples for WSL/Linux deployment.
- [ ] Update ops README to state Windows Task Scheduler scripts remain Windows-only compatibility until a later deletion phase.
- [ ] Verify:

```bash
bash -n scripts/ops/run-backend-refresh-daemon-host.sh
bash -n scripts/ops/run-backend-refresh-scheduled.sh
bash -n scripts/ops/check-backend-refresh-daemon-heartbeat.sh
node scripts/ops/check-backend-refresh-daemon-heartbeat.mjs --help
```

**Acceptance:**

- Refresh business logic continues to live in existing `scripts/data/workflow/*.mjs`.
- WSL/Linux scheduling is documented as systemd user service/timer or cron, not as a fake translation of `schtasks`.
- Windows Task Scheduler scripts are clearly marked Windows-only compatibility.

### P5: Docs, CI, And Active References

**Owner:** Agent F

**Write Scope:**

- `README.md`
- `project-plan/00_协作开发标准流程.md`
- `project-plan/00_项目总览.md`
- `docs/runbooks/local-acceptance.md`
- `scripts/dev/config/README.md`
- `scripts/README.md`
- `.github/workflows/quality-gate.yml`
- `.github/workflows/scheduled-staleness-monitor.yml`
- Tests referencing workflow shell or runner.

**Steps:**

- [ ] Update active local commands to Bash-first examples.
- [ ] Mention `.ps1` as temporary compatibility wrapper only where needed.
- [ ] Change CI workflow to `ubuntu-latest` and `shell: bash` for active quality gate.
- [ ] Convert PowerShell line continuations and `$env:GITHUB_OUTPUT` syntax to Bash equivalents.
- [ ] Do not rewrite historical archived plan evidence unless it blocks active docs or tests.
- [ ] Verify active reference cleanup:

```bash
rg -n 'powershell|pwsh|\\.ps1\\b|pnpm\\.cmd|mvn\\.cmd|windows-latest|shell: pwsh|[A-Za-z]:\\\\' README.md docs/runbooks project-plan/00_* scripts/dev .github/workflows
```

**Acceptance:**

- Active docs point to `.sh` entrypoints.
- CI active gate runs on Ubuntu/Bash.
- Historical references are either excluded from active grep scope or explicitly labeled as historical Windows records.

---

## Integration Order

1. Merge P0 first.
2. Merge P1 after P0 passes because P1 depends on shared libraries.
3. Merge P2 after P1 because start calls verify.
4. Merge P3 in parallel with P2 if it does not touch the same tests.
5. Merge P4 in parallel after P0 if it avoids `scripts/dev`.
6. Merge P5 last so docs and CI match the final script names and tested behavior.

## Validation Matrix

### Static Validation

```bash
git diff --check
bash -n scripts/dev/lib/*.sh
bash -n scripts/dev/*.sh
bash -n scripts/ops/*.sh
node --test scripts/dev/quality-gate.test.mjs scripts/dev/local-stack.test.mjs scripts/dev/acceptance-test.test.mjs
```

### No-Startup Functional Validation

```bash
bash scripts/dev/verify-local-stack.sh --skip-admin
bash scripts/dev/quality-gate-ci.sh --skip-admin
```

Use `--skip-admin` until `data-query-app` dependencies are fixed in the local environment.

### Full Runtime Validation

Only run after explicit approval:

```bash
bash scripts/dev/stop-local-stack.sh
bash scripts/dev/start-local-stack.sh
bash scripts/dev/smoke-local-stack.sh
bash scripts/dev/stop-local-stack.sh
```

### Active Reference Cleanup

```bash
rg -n 'powershell|pwsh|\\.ps1\\b|pnpm\\.cmd|mvn\\.cmd|windows-latest|shell: pwsh|[A-Za-z]:\\\\' README.md docs/runbooks project-plan/00_* scripts/dev .github/workflows
```

Expected result after P5: no active Bash-first surfaces point users or CI at PowerShell as the primary path. Temporary `.ps1` wrapper references must be explicitly described as compatibility.

## Known Current Environment Constraints

- `data-query-app/node_modules` is not fully installed yet; admin checks may require `--skip-admin` until pnpm build approval is handled.
- Backend Java/Maven compile chain is available.
- MySQL and Redis are reachable through current local config.
- `powershell.exe` exists, but `pwsh`, `docker`, and `unzip` are not required for the Bash-first path.

## Later Cleanup Phase

After Bash main chain is stable and accepted:

- Remove `.ps1` wrapper logic or move Windows-only scripts under an explicit compatibility folder.
- Delete active docs mentioning `.ps1` wrappers unless Windows support remains required.
- Remove Windows runner assumptions from all active CI and local workflow tests.
- Re-run the active reference cleanup grep with no compatibility exceptions.
