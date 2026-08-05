# TerraPedia Current Status

## Date

2026-08-06

## Current Phase

Phase B foundation stabilization. Automated-ingestion readiness is closed; the
active focus moves to P1 crawler monitor and resume/recovery reliability.

## Current State

- Item-image lineage is `6131/6131/6131/6131`; projection apply targeted 6,131
  rows and changed 6,126 existing image values.
- Shimmer generation/import is complete. Domain acceptance is `45/0/0` and
  cross-DB quick is `10/10 pass`.
- NPC decision `canonical-npc-t2-cutover-verification-20260806-admin-02`
  completed with `noWrite=true` and `T2_CUTOVER_VERIFIED`. The database snapshot
  was unchanged and no authorization permit remains.
- The three item-group inputs and standardized NPC input are canonical source
  contracts. The generated NPC bridge remains retired.
- Two independent `biomes` L1 applies are committed. Policy is
  `biomes v1 L2/ACTIVE` with one L2 decision and one bounded scheduler
  eligibility decision; there is no circuit, active attempt, or reservation.
- The full Bash gate passed: backend `1523` tests with zero failures/errors and
  10 explicit skips, public `39/39`, admin `405/405`, and isolated E2E run
  `5588e137a806de4a2dd417fe8319954d` with outcome and cleanup both passed.
- Cleanup readback found no disposable E2E database, Redis DB 15 state, runner
  listener, retained permit, scheduler daemon, or crawler process.

## Gate Boundary

This is local readiness evidence, not release or production-deployment
authority. Scheduler activation records bounded eligibility only; it does not
authorize a recurring daemon or crawler run. Monitor projections remain
read-only and `notGateEvidence=true`.

## Current Risks

- Crawler monitor and resume/recovery reliability remains the main P1 area.
- Release, staging, recurring scheduler startup, crawler execution, push,
  merge, and worktree cleanup require separate decisions.
- Current companion docs and gate evidence must remain synchronized with future
  workflow, API, runtime, and data-chain changes.

## Priorities

- P0: keep spec, devlog, project status, and risk records synchronized.
- P1: stabilize crawler monitor state, interruption handling, and resume/recovery.
- P2: continue homepage aggregation and public UI quality only after P1 control
  points are stable.

## Next Actions

- Continue from the current crawler monitor/resume plans and Redis V2 attempt
  contract.
- Preserve all consumed operation identities and immutable evidence.
- Rerun relevant runtime/backend/frontend/data gates before release, staging,
  or public-readiness claims.
