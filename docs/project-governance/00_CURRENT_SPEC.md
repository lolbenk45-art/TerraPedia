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
- Shared local Redis persists outside individual worktrees under
  `~/.local/share/terrapedia/redis/redis-<port>` by default; each worktree uses
  its allocated logical database, and startup refuses a reachable Redis whose
  configured persistence directory does not match.
- Isolated user-auth browser smoke: `bash ./scripts/dev/run-user-auth-e2e.sh --smoke`
- Isolated user-auth browser regression: `bash ./scripts/dev/run-user-auth-e2e.sh --regression`
- Backend focused tests: run Maven from `back/`
- Public frontend checks: run `pnpm run check` from `front-nuxt/`
- Admin frontend checks: run `pnpm run check` or `pnpm run test` from `data-query-app/`

Bash/WSL is the primary local automation path. Matching `.ps1` files are compatibility wrappers unless a current runbook says otherwise.

Crawler monitor live state uses Redis V2 attempt state under the fixed prefix
`terrapedia:crawler:wiki-monitor:v2:`. It is the only live queue authority:
every control and progress write carries exact attempt identity, every
non-terminal state is deadline-bound, and overview is a pure read. V1 crawler
queue records are immutable cutover history only and cannot block, dedupe,
restore, own, or report V2 live work. See
`docs/runbooks/crawler-monitor-queue-v2-cutover.md` for the authenticated
cutover, first-mutation, reset, and restart procedure.

Canonical item-group runtime reads use the published formal
`terria_v1_local` projection backed by maint and relation lineage. The admin
item-group, admin recipe-group, and recipe-tree consumers have no production
JSON reader or JSON fallback. The three JSON artifacts were regenerated as the
one-way compatibility export `ig_export_20260729_01`; fresh canonical readiness
passes with distinct runtime and compatibility snapshot identities. They remain
bounded compatibility-export and governance inputs until the source-contract
registry is explicitly flipped. That flip stays fail-closed while the complete
repository gate still reports domain warnings or blockers.

The user-auth E2E runner is an explicit isolated boundary: it accepts only
loopback MySQL and Redis, creates a run-derived disposable database, uses Redis
DB `15`, and exposes verification codes only through the E2E profile's
run-secret mailbox. Full local and CI quality gates require its smoke suite;
`--skip-front` also omits that dependent evidence and reports the limitation.
The runner requires E2E-scoped consent, credentials, service ports, runner
ports, and Chromium executable path. It must never infer a database name,
credentials, or target from ordinary local-stack configuration.
Its durable browser evidence lives only under
`reports/e2e/<run-id>/artifacts`: the runner creates and validates private
current-user directories, and Playwright rejects an unprepared, symbolic-link,
or group/other-readable artifact path before it creates a report.

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

When a task changes project progress, active focus, project risk, durable
management decisions, or handoff state, update the corresponding current record
in the same task:

- handoff state: `docs/devlog/current.md`
- current phase, blockers, and next priorities: `docs/project-management/current-status.md`
- active project risks: `docs/project-management/risk-register.md`
- durable management decisions: `docs/project-management/decision-log.md`

Do not update this spec for ordinary bug fixes, temporary investigation notes,
command logs, or one-off task progress. Record those in devlog, plans, audits,
or project-management files.
