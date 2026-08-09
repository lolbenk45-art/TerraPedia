# Current Devlog

Last updated: 2026-08-09 20:20 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Active Focus

The isolated Scheduler T1 and Item 100-row acceptance are closed. Active work
prepares a read-only, current-hash formal Scheduler enablement plan. Formal
Scheduler activation remains disabled and is not authorized.

## Open Work

- `entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md` - owner: Codex; status: active; branch: `design/crawler-auto-ingestion-readiness`; worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`; parent: scheduler lifecycle; blocked by: future fresh ADMIN authorization for enablement only; contract handoff: preparation is proposal-only and must first replace representative production constants with a fresh read-only preflight binding control state, epoch, namespace, readiness, T1 report, and code hashes.
- Item request: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-20260809-07.request.json`; packet `...-20260809-07.packet.json`; status: `AUTHORIZED` and consumed under `canonical-crawler-v2-items-t1-acceptance-20260809-admin-07`.
- Scheduler request: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance-20260809-04.request.json`; packet `...-20260809-04.packet.json`; status: `AUTHORIZED` and consumed once under `canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-07`.

## Current State

- NPC T2 decision `canonical-npc-t2-cutover-verification-20260806-admin-02`
  completed as a no-write operation; maintained readiness is
  `pass/formal-t2/T2_CUTOVER_VERIFIED`.
- The three item-group inputs and standardized NPC input are canonical source
  contracts; the generated NPC bridge remains retired.
- Domain acceptance is `45/0/0`, cross-DB quick is `10/10 pass`, and the full
  local quality gate passed. Isolated E2E run
  `5588e137a806de4a2dd417fe8319954d` passed and cleaned up.
- Runtime readback found no disposable E2E database, Redis DB 15 state, runner
  listener, active automation attempt/reservation, retained permit, scheduler
  daemon, or crawler process.
- NPC T1 refresh `npc-t1-20260807-01` passed against a current 129-table
  read-only snapshot; rollback/commit/restore was `0/1/0` across all three
  isolated roles, and independent cleanup readback returned all resources to zero.
- Projectile run `npc-t1-projectile-20260807-01` passed exact item-only closure
  under `canonical-projectile-t1-acceptance-20260807-admin-01`: 2 imports, 2
  maint rows, 2 item relations, 2 projections, NPC `not-covered/0`, snapshot
  `129/129`, probes `0/1/0`, and independent cleanup all zero.
- Buff run `npc-t1-buff-20260808-06` passed under ADMIN decision
  `canonical-buff-t1-acceptance-20260808-admin-06`: 2 imports, 11 item
  relations, 4 inflicting-NPC relations, 0 invented immune relations, complete
  payload readback, snapshot `129/129`, probes `0/1/0`, and cleanup all zero.
- Biome run `npc-t1-biome-20260808-04` passed under ADMIN decision
  `canonical-biome-t1-acceptance-20260808-admin-04`: 2 Biomes, 2 reciprocal
  relations, 4 resource/item-biome/item-source rows, 2 NPC-biome rows, 6
  stored decoys with 0 leaks, snapshot `129/129`, probes `0/1/0`, and cleanup
  all zero.
- Recipe formal verification passes against input hash `3503bdd...aefc`, the
  embedded applied pipeline, and final formal hash `582c415...f20e`. Source
  and blocking readiness are both pass; the overwritten two-row standalone
  report is classified `superseded-invalid`.
- Historical pre-final dry-run failures remain diagnostic only. The final
  isolated Scheduler T1 is closed by run
  `npc-t1-crawler-v2-auto-ingestion-20260809-04`; its separately authorized
  production activation path remains disabled and unauthorized.
- A derived E2E backend/Redis run is now proven startable and cleaned to zero;
  the remaining blocker is a fixture-only scheduled source/rule missing from
  `WIKI_MONITOR_RULES`. Manual dispatch remains out of scope.
- Fixture-only scheduled routing is now implemented and tested (`197/197`). A
  rejected mixed-domain run exposed and fixed formal-domain leakage; all its
  isolated resources were cleaned and it is not acceptance evidence.
- The system driver now provisions marker-owned derived resources, starts an
  owned Spring child, binds authenticated loopback automation enable/cutover,
  snapshots/restores scheduler files, and cleans exact owned resources. Its
  default path observes Redis renewals, owned backend restart, and terminal
  progress, while lease-loss remains a dedicated observer boundary so the
  primary attempt is not invalidated; a fresh authorized live run remains open. Focused
  scheduler/fixture/recorded-response/domain validation is `68/68`; the full
  monitor Node lane is `57/57`; combined manifest + monitor validation is now
  `96/96` after the lifecycle-order and lease-loss work.
- Task 3A dry run `scheduler-dry-20260808-01` reached real provisioning but
  backend startup failed at Flyway V9 duplicate `review_status`; exact
  compensation and independent readback returned derived DBs, temporary
  accounts, Redis DB14, and marker root to zero. The driver now disables
  Spring Flyway because the provisioning adapter already applied migrations.
- Dry run `scheduler-dry-20260808-02` reached authenticated loopback startup
  but observed V2 automation before cutover, returning HTTP 409. Cutover now
  occurs in `prepare` after login and before disabled-tick observation; its
  automatic cleanup/readback returned zero.
- Dry run `scheduler-dry-20260808-03` reached the loopback cutover call but
  received HTTP 409. Exact manual compensation removed its owned backend,
  schemas, temporary accounts, DB14 keys, marker root, and restored the
  backed-up durable artifacts. Current work adds a safe response reason to
  the driver and traces the backend cutover branch before another fresh run.
- Dry runs `scheduler-dry-20260808-05` through `-08` proved marker-root legacy
  evidence, fresh fixture cutover, and automatic zero cleanup. Run `-05`
  rejected a stale pre-routing backend JAR after it leaked an owned Buff child;
  the exact child and DB14 key were stopped/cleared. The driver now rejects a
  JAR older than `CrawlerMonitorServiceImpl.java`; a current JAR was rebuilt.
  Run `-08` reaches fixture-only V2 dispatch but its recorded Recipe child
  exits nonzero before lease renewal. No Wiki child remains and DB14 is zero.
- Scheduler T1 run `scheduler-dry-20260808-17` passed recorded Recipe
  ingestion, scheduled tick, two renewals, restart adoption, lease-loss reap,
  and independent all-zero cleanup. Canonical evidence and the current-hash
  request were refreshed; formal activation remains disabled.
- Final Scheduler T1 run `npc-t1-crawler-v2-auto-ingestion-20260809-04` passed
  under `canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-07` with
  a real scheduled tick, two renewals, restart adopt/reject, lease-loss reap,
  and matching Recipe persistence/readback: `947` recipes, `1256` ingredient
  relations, `1015` station relations, unresolved `0/0`. Its report hash is
  `bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`.
  Independent cleanup found derived schemas/accounts, Redis DB14, port 18189,
  marker root, processes, and dispatch permit all at zero.

## Next Agent Start Point

Close the T1 evidence with a focused commit and implement the read-only
preflight/proposal hardening in
`docs/superpowers/plans/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md`.
Do not generate a proposal/request/packet/permit, enable production V2
automation, write formal stores, or access Wiki network without a new explicit
owner authorization.

## Current Risks

- Scheduler eligibility is not authority to start a recurring daemon or crawler.
- The normal admin frontend login proxy needs a separate runtime-config review;
  final page acceptance used an authenticated backend token cookie.
- Release, deployment, push, merge, and worktree cleanup require separate user
  direction.
- Before any new runtime or release claim, rerun the relevant current gates.
- Passing NPC T1 isolation does not authorize formal writes or another domain.
- Projectile item-only acceptance does not prove NPC-projectile relations.
- Current full-gate blocker: four B1 exemption panels report 35-hour-old
  readiness evidence; this is independent of the Boss T1 isolated lane and
  requires a separate evidence refresh task.

## Recently Closed

- `entries/2026-08-08-recipe-formal-read-only-verification.md` - formal Recipe
  state verified read-only; overwritten standalone evidence rejected.
- `entries/2026-08-08-biome-t1-isolated-acceptance.md` - exact Biome T1 passed
  and cleaned to zero; formal Biome apply remains unauthorized.
- `entries/2026-08-08-buff-t1-isolated-acceptance.md` - exact Buff T1 passed
  and cleaned to zero; formal Buff apply remains unauthorized.
- `entries/2026-08-07-projectile-item-only-t1-acceptance.md` - exact item-only
  Projectile T1 passed and cleaned to zero; NPC relation coverage remains
  explicitly out of scope.
- `entries/2026-08-07-projectile-t1-source-blocker.md` - original NPC-inclusive
  lane intentionally stopped and transferred to the owner-approved item-only
  child.
- `entries/2026-08-07-boss-t1-isolated-acceptance.md`
- `entries/2026-08-07-npc-t1-isolated-acceptance-refresh.md`
- `entries/2026-08-06-crawler-v2-domain-freshness-card.md`
- `entries/2026-08-06-crawler-v2-items-sample-operation.md`
- `entries/2026-08-06-crawler-v2-automation-controls.md`
- `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- `entries/2026-07-27-crawler-automated-ingestion-closure.md`
- `entries/2026-08-04-item-image-projection-apply-runtime.md`
- `entries/2026-08-06-crawler-v2-monitor-simplification.md`
