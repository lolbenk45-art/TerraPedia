# TerraPedia Current Status

## Date

2026-08-10

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
- Isolated Scheduler T1 run `npc-t1-crawler-v2-auto-ingestion-20260809-04`
  passed with a real scheduled recorded-Recipe tick, two lease renewals,
  restart adopt/reject, lease-loss reap, matching `947/1256/1015` Recipe and
  relation readback, and independent cleanup to zero. This evidence is local
  acceptance only; formal Scheduler V2 automation remains disabled.
- Preparation Tasks 1-3 are implemented: the backend exposes a read-only
  `GET /admin/crawler-monitor/v2/automation/preflight`, the Node collector
  binds disabled/changed-only control, zero attempts/claims, reconciler health,
  epoch/namespace, domain evidence, T1 hash, and code hashes, and the proposal
  builder rejects representative current-state constants and byte drift.
  No real preflight artifact was generated because no backend listener was
  available; starting one would cross the no-daemon/formal-store boundary.

## Gate Boundary

This is local readiness evidence, not release or production-deployment
authority. Scheduler activation records bounded eligibility only; it does not
authorize a recurring daemon or crawler run. Monitor projections remain
read-only and `notGateEvidence=true`.

Formal Scheduler enablement preparation must use a fresh read-only preflight
and current-hash proposal before a separate ADMIN request. No prior T1 report,
eligible-domain result, or consumed decision authorizes a production mutation.

## Current Risks

- Crawler monitor and resume/recovery reliability remains the main P1 area.
- Release, staging, recurring scheduler startup, crawler execution, push,
  merge, and worktree cleanup require separate decisions.
- A proposal built from representative control values is not production-ready;
  it must bind a fresh observed disabled/changed-only state, zero activity,
  reconciler health, epoch/namespace, readiness, and code/report hashes.
- The preparation implementation is now fail-closed for evidence paths outside
  the repository and for code bundle bytes changed after preflight. A future
  request still requires a fresh production read-only GET and owner decision;
  this branch has generated no proposal, request, packet, or permit.
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
