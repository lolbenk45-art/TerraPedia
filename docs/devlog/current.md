# Current Devlog

Last updated: 2026-08-08 02:34 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Active Focus

Boss + Boss Loot Batch 1, Projectile item-only Batch 2, and Buff Batch 3 passed
exact isolated acceptance and cleaned to zero. Batch 4 Biome T1 is active.

## Open Work

- `entries/2026-08-07-remaining-domain-isolated-acceptance.md` - owner: Codex; status: active; branch: `design/crawler-auto-ingestion-readiness`; worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`; parent: none; blocked by: none; contract handoff: open a separate Biome T1 child.
- `entries/2026-08-08-biome-t1-isolated-acceptance.md` - owner: Codex; status: active; branch: `design/crawler-auto-ingestion-readiness`; worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`; parent: `entries/2026-08-07-remaining-domain-isolated-acceptance.md`; blocked by: implementation, review, and fresh ADMIN authorization; contract handoff: exact two-Biome fixture, local-owned source relations, consumer filtering, and cleanup to zero.

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

## Next Agent Start Point

Audit and implement the Batch 4 Biome design. Repair the missing public-list
deleted filter test-first, then authorize only after focused validation.

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
