# TerraPedia Current Status

## Date

2026-08-28

## Eight-Domain L2 Readiness (2026-08-28)

The exact eight-domain default ceiling was registered under
`user://conversation/2026-08-28/eight-domain-default-l2-ceiling`. Immutable
r12 evidence at
`reports/runtime/local-data-chain-closure/20260828/l2-readiness/20260828-064652-phase2-readonly-r12/`
has `32/32` passing domain panels, cross-DB `9 pass / 1 warning / 0 blocker`,
relation-health `0 blocker / 1 warning`, database-bound acceptance `19/19`, and
an HTTP `200` V2 preflight with zero live attempts/claims and a healthy
reconciler.

Each target domain now has one registered immutable `v2/L2` policy-version row,
but every effective policy remains `v1/L1/ACTIVE`. The r12 adapter readback
qualifies zero committed L1 runs for every domain, and full reconciliation is
still absent. No L2 proposal, packet, permit, `L2_PROMOTION` decision, scheduler
activation, source refresh, crawler/import, or automatic ingestion was
performed. The readiness records remain display-only and cannot be used as
proposal inputs until the separate L1 evidence gate is satisfied.

## Fresh Closure Checkpoint (2026-08-26)

The parent local data-chain closure is `closed` at
`reports/runtime/local-data-chain-closure/20260825/parent-final-1055/closure-index.json`.
The standard local stack is reachable on MySQL `13306`, Backend `18091`, Public
`5177`, Admin `3004`, and Redis `6380`. Read-only continuation checks passed:
local preflight, core smoke `OK: true`, acceptance `19/19`, NPC source coverage
`762/762`, NPC domain-chain blockers `0`, and NPC closure smoke `pass`.
Cross-DB and relation-health each retain one warning with blocking `0`.

Current image lineage is `7/7 ready` when bound to the current authorized Item
origin-normalization evidence. The generic acceptance image step omits that
binding and reports `6/7` without failing its schema-only check; this is a
validation-harness gap, not a new data-chain blocker. A fresh API parity replay
was stopped by HTTP `429` with zero retries; the final independent `418/418`
parity evidence remains authoritative. No new DML, permit, external request,
cleanup, staging, commit, or push is authorized for this closed lane.

All sections below dated before 2026-08-26 are retained historical checkpoints;
they do not override this closed-parent disposition.

## Fresh Closure Checkpoint (2026-08-24)

The maintained local stack is live on MySQL `13306`, Redis `6380`, backend
`18091`, public `5177`, and admin `3004`. Fresh local stack smoke passes `5/5`;
the prior four HTTP 429 failures were caused by overlap with the completed fast
NPC API audit and did not require another MySQL restart.

Boss current source-chain/API readback and parity pass, and Shimmer is
`COMPLETED/COMMITTED` at generation `9`. Core smoke passes; cross-DB and
relation health have blocking `0`. Maven passes 1573 tests, Admin full test
passes 413 unit tests plus typecheck/build, and Public check passes. Quality
automation is `189/189`, while domain acceptance remains `46/47` because the
canonical NPC readiness input is absent.

The parent closure remains blocked by five blocker groups containing ten
independent roots: Item source has no accepted rows; canonical NPC input is
missing; six NPC loot identities have flattened-vs-template chance-text drift;
image lineage is ready for only `2/7` entity types across five separate image
owners; and both Boss owner-05 and Shimmer owner-06 lack exact changed-row
closeout metadata. The authoritative index is
`reports/runtime/local-data-chain-closure/20260824/fresh-042509/closure-index.json`.

## Remaining-Chain Checkpoint (2026-08-22)

The operator-started MySQL/local stack is available on the loopback ports. The
fresh read-only run `090736-remaining-chain-r2` records NPC/domain/runtime
closure pass, Projectile no-op relation preview, cross-DB `10/10`, Biome `47`
managed icons, image lineage `7/7`, and local smoke `5/5`. Item source remains
blocked by explicit quarantine and duplicate lanes (`522` policy candidates,
`1295` dry-run duplicates, `311` potential inserts); no proposal, permit, or
apply was created. Local-core compatibility still has documented projection
drift in items/NPCs/bosses, and the full quality gate remains `323/328` because
five historical authorization fixtures are absent. The parent closure remains
active and no release or production claim is implied.

The formal remediation plan is
`docs/superpowers/plans/2026-08-22-remaining-closure-remediation.md`. It
requires hermetic test-fixture repair before any data write, then separate
governed Item-source and projection-parity operations with fresh freezes and
authorization. It does not permit reconstruction of historical authorization
artifacts, direct SQL, or broad relation rebuilds.

## Current Phase

Phase B foundation stabilization. The parent local data-chain closure is closed;
the eight-domain L2 plan is in Phase 2 evidence capture with an explicit
fail-closed runtime gate. No additional data-chain apply or scheduler activation
is active.

## Current State

Code-style authority: `docs/project-governance/current/CURRENT_CODE_STYLE.md`
and the root `.editorconfig` are the active baseline; formatter and linter
adoption remains staged.

Root governance files `03`, `04`, and `07-12` were removed from the current tree on 2026-07-10. Do not recreate removed root governance files; use Git history only for audit or rollback.

- Item-image lineage is `6131/6131/6131/6131`; the current exact projection
  apply froze 6,131 existing rows and changed 332 image values.
- Fresh image source lineage is `2/7` ready. Buffs and Bosses pass; Items,
  NPCs, Projectiles, Armor sets, and Biomes are blocked by their exact report
  reasons. Biome has 7 managed projection paths and 40 legacy-origin URLs.
  Older `7/7` and the superseded `3/7` evidence are historical and do not
  override the fresh run.
- Shimmer generation/import is complete at generation `9`. Domain acceptance
  is `46 pass / 0 warning / 1 blocked`; the blocked panel is derived from the
  missing canonical NPC input. Cross-DB and relation health have blocking `0`.
- NPC decision `canonical-npc-t2-cutover-verification-20260806-admin-02`
  completed with `noWrite=true` and `T2_CUTOVER_VERIFIED`. The database snapshot
  was unchanged and no authorization permit remains.
- The three item-group inputs and standardized NPC input are canonical source
  contracts. The generated NPC bridge remains retired.
- Two independent `biomes` L1 applies are committed. Policy is
  `biomes v1 L2/ACTIVE` with one L2 decision and one bounded scheduler
  eligibility decision; there is no circuit, active attempt, or reservation.
- A historical full Bash gate passed: backend `1523` tests with zero failures/errors and
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
