# Current Devlog

Last updated: 2026-09-27 05:39 CST by Codex

Active branch: `feat/automation-scheduler-continuation`
Active focus: governed automatic ingestion, canonical ownership repair and
serial data-visible acceptance; not complete.

## Open work

- Owner/coordinator: Codex; status: `active`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Active child: [Armor secondary projections](entries/2026-09-26-armor-secondary-projection-continuation.md),
  status `active` for the user-authorized A6.3 upstream semantic-repair
  continuation; scheduler remains disabled while readiness is blocked.
- Child parent: [Armor frozen candidate continuation](entries/2026-09-24-armor-frozen-candidate-continuation.md).
- Child parent: [canonical ownership execution](entries/2026-09-24-canonical-ownership-execution.md).
- Ancestor: [plan repair and continuation](entries/2026-09-22-automation-ingestion-plan-repair.md).
- Parent: [scheduler activation](entries/2026-08-31-automation-scheduler-activation-handoff.md).
  Parent entries remain active with the same owner/branch/worktree; detailed
  dependency and review history stays in their entries.
- Standing authority: [authorization register](entries/2026-09-19-automation-scheduler-authorization-list.md).
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
- Dependencies: current-model serial spec/quality review, fresh source/baseline/
  code/policy/server binding, exact ownership and terminal DB/API readback.
- Contract handoff: H8
  `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`;
  V2 epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`; Redis DB14.

## Current state

- A6.3 semantic repair and secondary projection are now COMMITTED: fresh
  decision `canonical-armor-secondary-projection-a63-20260927-22` committed
  718 bounded projection changes. The DB has223 active armor attributes and
  290 active item effects, with exact lineage readback and the10 excluded
  members left unwritten. Public/admin Ninja256/257/258 readback now returns
  one attribute and3 active class-specific effects per member. The public
  projection query was repaired to exclude retired rows and its focused Maven
  test passes12/12. Earlier A6.2 decision `armor-secondary-a6-20260926-01`
  remains consumed and must never be replayed.
- Runtime semantic review exposed historical upstream errors:133 attribute
  slot mismatches,181 effect slot mismatches and114 class-specific crit cells
  mapped to all. Full-chain acceptance is BLOCKED on new source/maint/relation
  repair authority; current two-table scope does not cover those writes.
  Plan A6.3 and active child define the exact amendment and regression gates.
- Post-apply preflight07:06:30Z: HTTP200, scheduler disabled, attempts/claims0/0,
  healthy reconciler, unchanged H8/epoch. No restart/source probe/crawler/Redis/
  local item write or DDL. No visual/browser acceptance claimed.
- Fresh continuation probe2026-09-26T21:03:29.593Z: backend UP, scheduler
  disabled/changed-only/60m, attempts/claims0/0, healthy reconciler, unchanged
  H8/V2 epoch, Redis PONG. All eight domain readiness rows are blocked; no
  scheduler preflight or natural tick is authorized from this state.
- A6.3 read-only source/proposal checkpoint2026-09-26T21:29Z: live Wiki
  armor parser produced230 rows with head92/body74/legs64. Fresh private
  source evidence and proposal-final artifacts are recorded under the new
  `canonical-armor-semantic-repair.a63-20260927-01` namespace; proposal
  predicts154 maint inserts/138 retirements and252 relation-effect inserts/
  252 exact retirements, with rebuilt slot mismatch0. Focused integrated
  validation is182/182 plus syntax checks. Registered executors still do not
  own the new armor-attributes landing/maint/relation tables, so no packet or
  business write was attempted.
- Git: HEAD0f871e94, no upstream or staged paths;1420 dirty paths observed
  (73 tracked changes/1347 untracked, including this continuation's private
  evidence). All pre-existing paths remain preserved; no reset/clean/stage/
  commit/push.

## Earlier checkpoints (historical, superseded where noted above)

- Latest source-producer slice: shared image-info requests now retain the real
  file timestamp and Armor image rows propagate it through locator/maint.
  Aggregate revision and unproven cache stay null. Default/custom/env progress
  is monitor-visible before requests, mirrored, and terminal failures persist.
  Offline focused tests21/21; related Node22 regression1725 passed,0 failed,
  1 existing Shimmer maint skip; backend monitor328/328; UI contract58/58.
  See active child for logs and source hashes. No live fetch or DB apply.
- Fresh API preflight at `2026-09-26T06:08:31.552278964Z` confirms disabled,
  0/0 live work, healthy reconciler and unchanged H8/epoch. Read-only MySQL/API
  at06:15:55Z reconfirms175/175 image revisions missing,1 cache missing,
  legacy-only landings and empty secondary projections; Ninja API piece effects
  for256/257/258 remain empty. The user has now explicitly approved the exact
  two-table A6 amendment; technical packet/readback gates remain. Overall
  automatic ingestion is not complete.
- Code-state reconciliation: `canonical-armor-ingestion` is present in the
  catalog with packet-bound runner/manifest tests. Earlier “unregistered”
  checkpoints below describe their historical slice, not current catalog state.
  Registration is not a live packet/permit or terminal DB/API acceptance.
- User requires current-model review, with no review-model/subagent dispatch.
  Current-model self-review is not independent approval; runtime ADMIN/Owner
  authority is unchanged. Historical independent reviews cover their frozen
  scopes only.
- Three pure contracts repaired and re-reviewed: Armor source-evidence landing
  transition, typed intent and recovery journal. Invalid insert IDs/markers,
  conflicting lists, chronology/terminal-evidence drift, wrong-parent references,
  duplicate declarations and mutable verified ID maps are now guarded.
  Exact source/test hashes and RED evidence are in the active child.
- ID-independent landing/maint intent and explicit relation derivation mode are
  now covered by the latest pure-contract slice (`420/420` pass). Unresolved
  landing IDs remain typed references; no allocator guesses or runtime writes.
- A non-registered Armor transaction core was added with TDD coverage. It locks
  the two Armor landing partitions, Owner/server/fence state and target rows
  under `REPEATABLE READ`, rederives before the first DML, materializes exact
  generated IDs/readbacks, updates only bounded rows, and quarantines commit
  acknowledgement loss for journal reconciliation. It is not yet a governed
  executor: relation-intent composition, durable journal adapter, packet
  registration and terminal API readback remain open.
- Fresh related Node22 regression after the core and journal store is `1581
  passed, 0 failed, 0 skipped`; log
  `.local/logs/armor-current-model-final-20260925.log`.
- Fresh authenticated read-only Phase 0 at `2026-09-25T10:18:34.175973262Z`
  against backend `18102` returned HTTP 200: control disabled/changed-only/60m,
  live attempts/claims `0/0`, reconciler healthy, H8 and V2 epoch unchanged,
  and all eight readiness domains blocked. Health is UP. No scheduler control,
  sweep, source probe, crawler/import, Redis or business-table write occurred.
- A private journal-store boundary is now tested (`3/3`): repository-confined
  `0600` atomic writes, symlink/duplicate rejection, exact previous-hash
  advancement and history retention. It is not wired to the transaction-core
  callbacks yet; durable operation evidence remains an open A4 gate.
- The durable journal adapter was repaired on 2026-09-26: `prepared()` now
  persists a `PENDING` PREPARED file before materialization/DML, and
  `materialized()` advances that same hash with real receipts before commit.
  Adapter/Journal/Store/Executor focused validation is `27/27`; Armor-related
  integration is `348/348`. This remains contract evidence only; no executor
  registration or runtime write occurred.
- Executor/filesystem-journal integration now passes with real receipt IDs and
  terminal `COMMITTED` readback. The focused Armor run is `349 passed, 0
  failed, 0 skipped`; log `.local/logs/armor-current-model-final-20260926.log`.
- The full-chain continuation now has a non-executable
  `armor-canonical-full-chain-intent/v1` composer. It cross-binds the reviewed
  landing/maint and ID-independent relation/projection graphs, emits typed
  landing/maint/relation/projection plans, permits only declared local landing
  and maint external receipts, and hashes a recovery/dependency envelope.
  Its integration test drives the transaction executor with the composed
  relation intent rather than a fixture. Native MySQL collation-equivalence
  `FOR UPDATE` range/gap locks and byte-different collision rejection are now
  asserted before locked rederivation. This is still a pure/mechanism gate;
  no executor catalog registration, packet, permit, or business write exists.
- Fresh related Node22 validation after this continuation is `1595 passed, 0
  failed, 0 skipped`; log `.local/logs/armor-full-chain-current-model-20260926.log`.
- The read-only locked rederivation adapter now reads the complete Armor
  baselines/dependencies inside the transaction, rebuilds the full graph and
  requires exact full-chain hash equality before DML. Its adapter plus
  runner/catalog/manifest slice is `79/79`; the fresh related Node22 regression
  is `1603 passed, 0 failed, 0 skipped` (log
  `.local/logs/armor-locked-rederivation-current-model-20260926.log`); a real
  snapshot read returned
  maint Armor `63/175`, relation `63/470/175`, projection `63`, effects `320`,
  secondary projections `0/0`, and local items/images `6159/25470`. Existing
  source rows still fail the required source-evidence revision/cache contract,
  so no intent, packet or apply was attempted.
- The broader pipelines regression is not a release gate yet: `2203 passed,
  17 failed, 1 skipped`. Failures are outside this Armor slice: one existing
  syntax-error test and 16 modules requiring an unavailable `mysql2/promise`
  install. No runtime or business-table write occurred.
- Historical September25 Node22 regression:1563 passed,0 failed,0 skipped, exit0;
  `.local/logs/armor-current-model-rereview-20260925-KrU21g.log`.
  This proves tested contracts, not live ingestion. The temporary full-chain
  draft was removed; at that checkpoint no full-chain operation was registered.
- Fresh authenticated Phase0 at `2026-09-26T03:56:01.973852700Z`: HTTP200,
  control disabled/changed-only/60min, attempts/claims0/0, healthy reconciler,
  unchanged H8/epoch, all eight domains blocked. The historical last-sweep
  payload is not a new execution; no scheduler/control, source probe,
  crawler/import, Redis, or business-table write occurred.
- Dual-root startup repair is retained: primary durable root
  `/home/lolben/TerraPedia`, continuation worktree command-root, scheduling=false.
  Earlier source-monitor result is9/9 healthy/9 changed with five missing
  ingestion-manifest entries; its immutable report and earlier runtime history
  are recorded in the child. No source probe or restart in this review phase.
- User-approved bounded Armor/Buff/Shimmer repair remains authorized after
  technical gates; the private scope record is not an executable packet.
  Planned new landing ownership is local; historical maint lineage is distinct.
- HEAD `0f871e94`, no upstream,0 staged,1603 dirty paths (1534 untracked,
  69 tracked modified) preserved.
  No reset/clean/stage/commit/push. This review phase made no scheduler/control,
  source/crawler/import, Redis or business-table write.
- Retry39/decision65, Retry41/decision74, Retry42/decision75 and L2 decisions
  66–73 remain consumed. Retry42 is projectiles no-op evidence only.

## Next safe action and risks

- Execute the user-authorized A6.3 upstream semantic-repair boundary with a
  new source evidence namespace and new decision identity. Do not request or
  replay the already-consumed two-table packet. No further publication or
  automatic acceptance before source class/slot invariants pass. Ten members
  still lack source attributes; do not invent their facts.
- Next implementation gate: complete the remaining source/image-role/cache
  evidence, then proceed through the separately scoped Buff and Shimmer gates;
  no scheduler activation or natural tick is entered from this state. The
  projection executor is registered and its fresh terminal evidence is
  `reports/authorization/canonical/canonical-armor-secondary-projection.a63-20260927-22.result.json`.
- Complete the remaining A3/A4 gates: operation-specific packet/server/policy
  binding, governed catalog/executor review, live validation of locked
  rederivation against a fresh valid source packet, and terminal DB/API equality
  readback. Only after those gates
  and fresh authorization may a serial changed-row run be considered. No
  generic legacy-history pruning, DDL, scheduler enablement or business DML.
- Armor image evidence remains missing:175/175 maint images lack revisions and
  one lacks cache. Secondary projections are now224/290, but new upstream
  semantic findings block acceptance. No local item writes, set-effect source,
  DDL, H8 widening or scheduler activation. Before
  a live source run also reconcile producer `part` image roles with the bounded
  candidates and bind the Armor raw payload in managed-image authorization.
- Automatic hookup needs composite module/image source identity and an explicit
  policy transition; do not silently widen H8. Buff full executor, Shimmer
  six-scope enforced partitions, eight-domain changed-row/API/natural-tick proof
  and separately scoped sustained operation remain open.
- Preserve private evidence outside commit scope. A temporary bearer token was
  accidentally printed earlier; the child records the incident. Do not repeat
  it or rotate secrets without authorization.

## Historical context

- Superseded chronology: [scheduler history snapshot](archive/2026-09-22-scheduler-current-history.md).
- Closed source-identity child: `2026-09-03-source-dispatch-identity-repair.md`
  at `6341f8f0`; closed L2 promotion parent at `edc40b4f`.

- 2026-09-27 image checkpoint: fresh Armor image fetch produced 419 rows with
  per-file source revisions and zero warnings. Private evidence is
  `canonical-armor-image-source-evidence.a63-20260927-23.json`; all 419 source
  rows lack managed cache URLs and current maint has 175 missing revisions, so
  image acceptance remains blocked pending a separately authorized managed-image
  operation. No business-table, Redis, local-item, DDL, or scheduler write.
- Buff/Shimmer contract regression after the image checkpoint: 87/87 passing;
  this remains mechanism evidence only and no Buff/Shimmer packet or business
  write was attempted because their full-chain ownership executors remain open.
- Final post-test preflight 2026-09-27T03:56:20.828Z: scheduler disabled,
  attempts/claims 0/0, reconciler healthy, H8/V2 unchanged, Redis PONG.
