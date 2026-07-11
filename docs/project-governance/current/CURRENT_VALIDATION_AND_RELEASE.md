# Current Validation And Release

Status: current
Last updated: 2026-07-12

This file records current validation and release boundaries for development
planning. It does not claim that any gate has passed unless this file cites a
fresh run. Current task-level validation must still be recorded in devlog,
audits, or project-management records.

## Default Validation Commands

Use the narrowest validation that proves the change.

Docs/process-only changes:

```bash
git diff --check
```

Also run targeted consistency scans for paths, terms, source-of-truth wording,
and stale/current routing touched by the task.

Backend focused tests:

```bash
cd back
mvn -Dtest=ClassA,ClassB test
```

Backend broad tests:

```bash
cd back
mvn test
```

Public frontend checks:

```bash
cd front-nuxt
pnpm run check
```

Admin frontend checks:

```bash
cd data-query-app
pnpm run check
```

Admin full package gate:

```bash
cd data-query-app
pnpm run test
```

Full local quality gate:

```bash
bash ./scripts/dev/quality-gate.sh
```

Isolated user-auth browser suites:

```bash
bash scripts/dev/run-user-auth-e2e.sh --smoke
bash scripts/dev/run-user-auth-e2e.sh --regression
```

Before the full local gate, explicitly export the runner's required isolated
E2E variables. The optional MySQL and Redis endpoint overrides must remain
loopback-only; Redis must use DB `15`.

```bash
export TERRAPEDIA_E2E_ENABLED=1
export TERRAPEDIA_E2E_MYSQL_USERNAME='<isolated-mysql-user>'
export TERRAPEDIA_E2E_MYSQL_PASSWORD='<isolated-mysql-password>'
export TERRAPEDIA_E2E_BACKEND_PORT=18080
export TERRAPEDIA_E2E_FRONTEND_PORT=15176
export TERRAPEDIA_E2E_CHROMIUM_EXECUTABLE="$(cd front-nuxt && node --input-type=module -e "import { chromium } from '@playwright/test'; process.stdout.write(chromium.executablePath())")"
# Optional loopback-only overrides: TERRAPEDIA_E2E_MYSQL_HOST/PORT and TERRAPEDIA_E2E_REDIS_HOST/PORT.
```

Missing values fail with the runner's targeted prerequisite message. The
runner never infers database names, credentials, or target services from
ordinary local-stack configuration such as `TERRAPEDIA_DB_URL` or
`TERRAPEDIA_LOCAL_STACK_CONFIG`.

## Quality Gate Contents

`scripts/dev/quality-gate.sh` currently includes:

- Node test suites for local stack, data source, crawler/source layout, wiki request/fetch boundaries, domain readiness, freshness, refresh plan, and report generation.
- Crawler source layout warning-only check.
- Domain acceptance full dry-run with blocked and warning failure enabled.
- Domain acceptance A-grade gate with blocked failure enabled.
- Cross-DB referential integrity audit in quick mode by default, or full mode with `--full-data-audit`.
- Backend domain acceptance focused tests and broad Maven tests unless skipped.
- Public frontend package test followed by the mandatory isolated user-auth browser smoke unless skipped. Keep `front-nuxt/package.json` scripts aligned with this gate before relying on a full run.
- Admin package test unless skipped.

The gate supports skip flags for scoped validation:

```bash
bash ./scripts/dev/quality-gate.sh --skip-back
bash ./scripts/dev/quality-gate.sh --skip-front
bash ./scripts/dev/quality-gate.sh --skip-admin
bash ./scripts/dev/quality-gate.sh --full-data-audit
```

Use skip flags only when the task scope justifies them and record the limitation.
In particular, `--skip-front` skips the dependent isolated browser smoke and
cannot provide full user-auth gate evidence.

## Isolated User-Auth E2E Boundary

The runner starts a dedicated E2E profile against a run-derived disposable
MySQL database, loopback Redis DB `15`, and an E2E-only verification-code
mailbox protected by a per-run secret. It rejects ordinary datasource/local
stack configuration, remote hosts, inherited database names, and missing
explicit consent or credentials before any service action. CI provisions its
own MySQL, Redis, clients, and Chromium; no local configuration secret is used.
Browser reports are runner artifacts under `reports/e2e/<run-id>/` and do not
replace the mandatory smoke result in the full local or CI quality gate.
The durable `artifacts/` subtree, its report directories, and its files are
private to the current user (`0700` directories and `0600` files). The runner
fails before any data client if a report path is a symbolic link or an unsafe
pre-existing run/artifact tree; the Playwright configuration applies the same
fail-closed check before browser work begins.

## Local Stack

Maintained local lifecycle commands:

```bash
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/stop-local-stack.sh
```

Startup and smoke evidence are runtime-oriented. They do not replace acceptance
evidence, data freshness, or quality gates.

## Release Boundary

Do not make release, staging, public-readiness, or A-grade readiness claims
unless fresh evidence is available for the relevant surfaces.

Current blockers for release wording:

- May V0.1 public-preview evidence is historical until rerun.
- Release/staging claims require fresh Bash gate, route checks, and data-readiness evidence.
- Domain Acceptance still controls public readiness; UI pages do not override missing, unknown, stale, or warning evidence.
- Gate-consumed evidence must be durable across machines, not only local ignored artifacts or command stdout.

## Evidence Placement

- Runtime/generated artifacts: `reports/`
- Durable audit conclusions: `docs/audits/`
- Active task state and validation: `docs/devlog/entries/`
- Current project phase, blockers, and next priorities: `docs/project-management/current-status.md`
- Active project risks: `docs/project-management/risk-register.md`
- Durable management decisions: `docs/project-management/decision-log.md`

Do not paste long logs into governance docs. Promote only durable conclusions
and cite the command or artifact that supports them.
