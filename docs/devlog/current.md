# Current Devlog

Last updated: 2026-08-08 04:58 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Active Focus

Remaining-domain isolated acceptance and Recipe formal verification are closed.
Current work designs the isolated V2 scheduler lifecycle acceptance and its
separate governed formal activation contract.

## Open Work

- `entries/2026-08-08-crawler-v2-scheduler-lifecycle.md` - owner: Codex; status: active; branch: `design/crawler-auto-ingestion-readiness`; worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`; parent: none; blocked by: written-spec review; contract handoff: lifecycle T1 evidence precedes the formal activation proposal.

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

## Next Agent Start Point

Review the scheduler lifecycle design, then write and audit the implementation
plan. Do not start the fixture stack or enable formal V2 automation before the
written-spec gate and a fresh isolated T1 ADMIN decision.

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
