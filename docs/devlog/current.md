# Current Devlog

Last updated: 2026-08-06 11:18 CST by Codex

Active branch: `design/crawler-auto-ingestion-readiness`

## Active Focus

Keep completed V2 crawler progress and data freshness visible after a domain
returns to idle, starting with `town_npc_maintenance`.

## Open Work

- `entries/2026-08-06-crawler-v2-domain-freshness-card.md`
  - owner: Codex
  - status: active
  - branch: `design/crawler-auto-ingestion-readiness`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
  - relationship: standalone crawler monitor UI follow-up
  - dependencies: written-spec review before implementation planning
  - contract handoff: separate local-data update and upstream source-check labels

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

Review the domain freshness card specification, then write and execute its
implementation plan with TDD. Preserve the live Redis V2 attempt contract and
`notGateEvidence=true`.

## Current Risks

- Scheduler eligibility is not authority to start a recurring daemon or crawler.
- Release, deployment, push, merge, and worktree cleanup require separate user
  direction.
- Before any new runtime or release claim, rerun the relevant current gates.

## Recently Closed

- `entries/2026-08-06-crawler-v2-items-sample-operation.md`
- `entries/2026-08-06-crawler-v2-automation-controls.md`
- `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- `entries/2026-07-27-crawler-automated-ingestion-closure.md`
- `entries/2026-08-04-item-image-projection-apply-runtime.md`
