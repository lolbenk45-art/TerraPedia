# Current Devlog

Last updated: 2026-08-06 21:14 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Active Focus

P1 crawler monitor runtime acceptance is complete; scheduler design remains separately authorized follow-up.

## Open Work

- No open work in this runtime-acceptance checkpoint. Scheduler daemon design and enablement remain a separately authorized follow-up.

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

## Next Agent Start Point

Create a separate plan and authorization request for any V2 scheduler daemon;
do not infer recurring automation from scheduler eligibility.

## Current Risks

- Scheduler eligibility is not authority to start a recurring daemon or crawler.
- The normal admin frontend login proxy needs a separate runtime-config review;
  final page acceptance used an authenticated backend token cookie.
- Release, deployment, push, merge, and worktree cleanup require separate user
  direction.
- Before any new runtime or release claim, rerun the relevant current gates.

## Recently Closed

- `entries/2026-08-06-crawler-v2-domain-freshness-card.md`
- `entries/2026-08-06-crawler-v2-items-sample-operation.md`
- `entries/2026-08-06-crawler-v2-automation-controls.md`
- `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- `entries/2026-07-27-crawler-automated-ingestion-closure.md`
- `entries/2026-08-04-item-image-projection-apply-runtime.md`
- `entries/2026-08-06-crawler-v2-monitor-simplification.md`
