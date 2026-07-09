# Current Validation And Release

Status: current
Last updated: 2026-07-09

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

## Quality Gate Contents

`scripts/dev/quality-gate.sh` currently includes:

- Node test suites for local stack, data source, crawler/source layout, wiki request/fetch boundaries, domain readiness, freshness, refresh plan, and report generation.
- Crawler source layout warning-only check.
- Domain acceptance full dry-run with blocked and warning failure enabled.
- Domain acceptance A-grade gate with blocked failure enabled.
- Cross-DB referential integrity audit in quick mode by default, or full mode with `--full-data-audit`.
- Backend domain acceptance focused tests and broad Maven tests unless skipped.
- Public frontend package test unless skipped. Keep `front-nuxt/package.json` scripts aligned with this gate before relying on a full run.
- Admin package test unless skipped.

The gate supports skip flags for scoped validation:

```bash
bash ./scripts/dev/quality-gate.sh --skip-back
bash ./scripts/dev/quality-gate.sh --skip-front
bash ./scripts/dev/quality-gate.sh --skip-admin
bash ./scripts/dev/quality-gate.sh --full-data-audit
```

Use skip flags only when the task scope justifies them and record the limitation.

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
