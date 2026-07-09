# TerraPedia Current Spec

This file is the current project fact sheet. It is intentionally short. It decides which project facts and documents are authoritative for future work.

## Purpose

TerraPedia is a Terraria Chinese data platform with four maintained lines:

- public Nuxt frontend: `front-nuxt/`
- admin/data-query Nuxt frontend: `data-query-app/`
- Spring Boot backend: `back/`
- data crawl, standardization, import, sync, and audit tooling: `scripts/data/` and `data/`

## Current Authority

Read order for project facts:

1. `docs/project-governance/00_CURRENT_SPEC.md`
2. `docs/project-governance/00_WORKFLOW.md`
3. `docs/devlog/current.md`
4. Current plans in `docs/plans/`, `docs/superpowers/plans/`, or `docs/project-governance/current/`
5. Reference docs in `docs/project-governance/reference/`
6. Historical docs in `docs/project-governance/archive/` and `docs/project-governance/legacy/`

Historical docs do not override current spec or workflow.

## Default Local Workflow

- Default local database: `terria_v1_local`
- Start stack: `bash ./scripts/dev/start-local-stack.sh`
- Stop stack: `bash ./scripts/dev/stop-local-stack.sh`
- Full quality gate: `bash ./scripts/dev/quality-gate.sh`
- Backend focused tests: run Maven from `back/`
- Public frontend checks: run `pnpm run check` from `front-nuxt/`
- Admin frontend checks: run `pnpm run check` or `pnpm run test` from `data-query-app/`

Bash/WSL is the primary local automation path. Matching `.ps1` files are compatibility wrappers unless a current runbook says otherwise.

## Documentation Placement

- Agent quickstart: `AGENTS.md`
- Current project governance: `docs/project-governance/`
- Active handoff and task traceability: `docs/devlog/`
- Task-level plans: `docs/plans/` and `docs/superpowers/plans/`
- Project status, decisions, and risks: `docs/project-management/`
- Runbooks: `docs/runbooks/`
- Audits: `docs/audits/`
- Local temporary task context: `task/`

The old `project-plan/` root has been retired. Use `docs/project-governance/`.

## Spec Impact Rule

Every non-trivial task must decide whether it changes the current project facts.

Update this spec when a task changes:

- project purpose or maintained application boundaries
- source-of-truth order
- default local commands, database, or service lifecycle
- data source chain or durable data ownership
- documentation placement rules
- workflow rules that future agents must follow

Do not update this spec for ordinary bug fixes, temporary investigation notes, command logs, or one-off task progress. Record those in devlog, plans, audits, or project-management files.
