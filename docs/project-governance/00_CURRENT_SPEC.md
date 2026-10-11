# TerraPedia Current Spec

This file is the current project fact sheet. It is intentionally short. It decides which project facts and documents are authoritative for future work.

## Purpose

TerraPedia is a Terraria Chinese data platform with four maintained lines:

- public Nuxt frontend: `apps/public-web/`
- admin/data-query Nuxt frontend: `apps/admin-console/`
- Spring Boot backend: `services/catalog-api/`
- data crawl, standardization, import, sync, and audit tooling: `pipelines/` and `data/`

Project skills marked `portable` have one editable common source under
`agent/skills/`. `platform/tooling/sync-agent-skills.mjs` generates the
tool-discovery views under `.codex/skills/` and `.claude/skills/`; their
tool-specific metadata remains runtime-owned. `AGENTS.md` is the primary agent
entrypoint, with `CLAUDE.md` and `GEMINI.md` as thin adapters to the same
governance sources.

The legacy application and script roots were retired when the 2026-08-16
compatibility window closed (`front-nuxt/`, `data-query-app/`, `back/`,
`shared/article-runtime/`, `scripts/dev/`, `scripts/ops/`, `scripts/tooling/`,
and `scripts/data/`). They must not be recreated. Canonical consumers and new
writes use the target roots documented in
`docs/architecture/project-structure-v2.md`.

The retired untracked `front/` directory has been removed. Do not recreate it or
add a second public frontend implementation under any legacy path.

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
- Start stack: `bash ./platform/local/start-local-stack.sh`
- Stop stack: `bash ./platform/local/stop-local-stack.sh`
- Full quality gate: `bash ./platform/local/quality-gate.sh`
- Shared local Redis persists outside individual worktrees under
  `~/.local/share/terrapedia/redis/redis-<port>` by default; each worktree uses
  its allocated logical database, and startup refuses a reachable Redis whose
  configured persistence directory does not match.
- The governed local automatic-ingestion split reserves Redis `6380/DB14` for
  the Armor worktree/runtime (`18104`) and Redis `6380/DB15` for the Buff
  worktree/runtime (`18105`). Buff must use DB15 and must never launch against
  DB14 or DB16; DB16 is retained historical state only. Both runtimes use the
  fixed V2 namespace but keep separate epochs and state-store evidence.
  Scheduler control remains disabled until each domain's fresh authorization
  and natural-tick gates pass.
- When a real Wiki fingerprint has not changed, Buff automation may be tested
  only through the bounded fixture window
  `bash ./platform/local/run-buff-automation-test-window.sh --fixture-profile=t1 --window-minutes=5`.
  The window uses run-derived T1 schemas and Redis logical DB13, enables the
  fixture-only `fixture-changed-only` mode long enough for a real `@Scheduled`
  tick, runs the isolated Buff T1 chain, and disables the test scheduler before
  cleanup. It must never write formal databases or Buff DB15, and it cannot
  establish production authorization or unattended-ingestion completion.
- A fresh current-Wiki Buff source replay is a separate bounded acceptance lane:
  `bash ./platform/local/run-buff-current-source-replay.sh --redis-db=18`.
  It fetches the revision-bound Buff modules/pages and runs the T1 chain only
  against run-derived databases and Redis logical DB18. The wrapper accepts no
  other Redis DB; DB14, DB15, DB16, and DB17 remain reserved or historical.
- Isolated user-auth browser smoke: `bash ./platform/local/run-user-auth-e2e.sh --smoke`
- Isolated user-auth browser regression: `bash ./platform/local/run-user-auth-e2e.sh --regression`
- Backend focused tests: run Maven from `services/catalog-api/`
- Public frontend checks: run `pnpm run check` from `apps/public-web/`
- Admin frontend checks: run `pnpm run check` or `pnpm run test` from `apps/admin-console/`

Bash/WSL is the primary local automation path. Matching `.ps1` files are compatibility wrappers unless a current runbook says otherwise.

Crawler monitor live state uses Redis V2 attempt state under the fixed prefix
`terrapedia:crawler:wiki-monitor:v2:`. It is the only live queue authority:
every control and progress write carries exact attempt identity, every
non-terminal state is deadline-bound, and overview is a pure read. V1 crawler
queue records are immutable cutover history only and cannot block, dedupe,
restore, own, or report V2 live work. See
`docs/runbooks/crawler-monitor-queue-v2-cutover.md` for the authenticated
cutover, first-mutation, reset, and restart procedure.

Scheduler-owned automatic V2 attempts additionally carry one immutable source
dispatch identity: a canonical content fingerprint, the validated probe run
identity, and the validated probe-content identity. Redis attempt state,
attempt manifest/operation plan, worker environment, automatic bundle,
reconciliation evidence, and final V2 readback must agree exactly. Missing or
mismatched identity fails before the worker can apply data or acknowledge the
source. Retries retain the original identity; a changed fingerprint creates a
new attempt identity rather than relying on mutable last-sweep output.
Automatic runner source-monitor verification binds the configured monitor state
to a repository-confined ordinary file through no-follow descriptor access and
rechecks its object identity after reading; a symbolic link, replacement race,
or malformed state fails before publication, mutation, or acknowledgement.

Scheduler-owned automatic artifacts are attempt-isolated without changing
content-level database deduplication. The logical database run ID remains
content-derived; immutable artifact paths additionally bind the exact source
dispatch triple and `(stateStoreEpoch, queueId, attemptId)` carried in the hashed
`importPlan.automaticAttemptIdentity`. Canonical consumers recompute those paths
and reject sibling-attempt progress/evidence. Committed-run recovery verifies
and reuses the persisted original bundle/source identities rather than importing
again from a new empty attempt directory. Historical artifacts remain immutable;
external runner result output cannot overlap automatic or reconciliation
evidence namespaces. Legacy no-dispatch invocation retains its existing paths.

The scheduler authorization code bundle pins the automatic runners, their
spawned source entrypoints and transitive runtime helpers. In dual-root local
operation, automatic and wiki-sync child scripts resolve from the executing
code root; `WORKTREE_ROOT`, working directory and data/progress/manifest paths
continue to identify the durable data root. Importing wiki-sync as a library
does not start its CLI, a monitor, or a request-gate reset.

Canonical ownership repair uses registered executors and fresh exact packets;
draft metadata, caller booleans and partition mode strings are never authority.
The bounded Armor incremental operation updates existing projection identities
only and preserves unmatched rows; it is distinct from historical empty-table
restoration and does not implement upstream ingestion. Buff general sync is
read-only until a registered executor binds page-immunity and managed-image
evidence without schema preparation. Shimmer cross-owner execution remains
blocked until real enforced partitions for `world_contexts` and
`entity_source_snapshots` join its four transform scopes. These contracts do not
widen H8 or authorize runtime writes by themselves; see devlog for current
scope approval, review and runtime validation state.

The separate `canonical-buff-item-maint-insert` operation is registered for
the six Item game IDs `6148/6149/6155/6161/6164/6173` required by the Buff
dependency chain. It binds frozen Iteminfo capture bytes, inserts one
non-current source-evidence landing and six missing `maint_items` identities,
and requires two exclusive fences, locked rederivation, real insert receipts,
immutable recovery evidence, and independent committed readback before fence
release. It does not write local Item rows or Buff relation/projection rows.
The exact scope was approved by the user on 2026-10-06 and executed under
decision `buff-item-maint-20261006-admin-01`, run
`buff-items-20261006-task18-exec-v1`. The committed result inserted landing
`12546` with `is_current=0` and six active `maint_items` identities
`6162/6163/6164/6165/6166/6167`; independent readback and fence release passed.
This operation does not write local Item rows or Buff relation/projection rows;
the remaining `1340`, NPC secondary identity, and Buff zero-baseline/full-chain
gates remain independent.

The separate `canonical-armor-secondary-projection` operation publishes existing
Armor-member attributes and item-owned `armor_attribute_cell` effects into the
two relation secondary projection tables. It binds an explicit member subset,
current source/baseline snapshots, collision-checked relation-row insert IDs,
locked rederivation and immutable PREPARED/result evidence. It preserves other
rows and existing IDs; it does not own upstream attribute/effect facts, local
items or new set effects. Historical lineage equality and DB/API parity alone
do not establish source semantic correctness or automatic ingestion acceptance.

Canonical item-group runtime reads use the published formal
`terria_v1_local` projection backed by maint and relation lineage. The admin
item-group, admin recipe-group, and recipe-tree consumers have no production
JSON reader or JSON fallback. The three JSON artifacts were regenerated as the
one-way compatibility export `ig_export_20260729_01`; fresh canonical readiness
passes with distinct runtime and compatibility snapshot identities. Their
source contracts are canonical, and the JSON files remain compatibility-export
and governance evidence rather than steady-state runtime readers.

Canonical NPC runtime reads use the published formal `terria_v1_local`
projection backed by maint and relation lineage. The formal no-write T2 cutover
verification passes against matching admin/public API evidence. The standardized
NPC input remains compatibility and governance evidence, while the generated
NPC bridge contract remains retired.

Canonical item image ownership follows the active primary
`terria_v1_relation.relation_item_images.cached_url` rows. The governed
`canonical-item-image-projection-apply` operation may update only the `image`
column of existing active `terria_v1_relation.projection_items` rows; the
projection value is derived state and relation sync must not reverse-copy
`terria_v1_local.items.image` into it. The local item image remains available
only for the existing armor-set `related_items_json` compatibility fallback.

Canonical Biome image ownership follows
`terria_v1_maint.maint_biome_images -> terria_v1_relation.relation_biome_images
-> terria_v1_relation.projection_biomes.icon_url`. The governed 47-row local
contract preserves 40 managed icons and seven Wiki fallback URLs as source
evidence. Public API response sanitization may suppress a Wiki fallback until
it has a managed cached copy; read-only API requests must not mirror it as a
side effect.

The user-auth E2E runner is an explicit isolated boundary: it accepts only
loopback MySQL and Redis, creates a run-derived disposable database, uses Redis
DB `17`, and exposes verification codes only through the E2E profile's
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
- Cross-model agent adapters: `CLAUDE.md` and `GEMINI.md`
- Common project skill source: `agent/skills/`; generated runtime views:
  `.codex/skills/` and `.claude/skills/`
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

Armor source-image acquisition and governed cache uploads expose independent
read-only monitor evidence at `data/generated/armor-image-cache-progress.latest.json`
under the configured crawler data root. The registered `armor-set-images` task
reads that file even when generic Wiki progress uses Redis. This progress is
observability only; it grants no scheduler, queue or ingestion authority.
