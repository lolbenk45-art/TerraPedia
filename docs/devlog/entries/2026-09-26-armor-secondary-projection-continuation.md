# Armor secondary projection continuation

## Status

`active`

## Context

- Goal: execute the newly approved A6 two-table repair, then continue the
  source-to-DB/API automation plan; overall automatic ingestion remains open.
- Owner: Codex, current-model serial implementation/spec/quality review; no
  reviewer-model or subagent dispatch.
- Branch: `feat/automation-scheduler-continuation`; HEAD `0f871e94`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Parent: `2026-09-24-armor-frozen-candidate-continuation.md` (still active).
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`.
- Authority: `user://conversation/2026-09-26/armor-secondary-projections-approved-01`,
  recorded in the standing authorization register. No packet is implied.
- Git baseline:69 modified/1534 untracked,0 staged, no upstream. Preserve the
  dirty continuation; no stage/commit/reset/clean/push is authorized by this task.

## Scope and acceptance

- Write only bounded existing Armor-member projection_item_armor_attributes
  and exact item-owned armor_attribute_cell projection_equipment_effect_attributes
  in terria_v1_relation. Preserve unrelated rows and existing projection IDs;
  explicit collision-checked source bindings for inserted IDs.
- Read maint/relation lineage and local item IDs/names. Reuse pure builders,
  never the broad relation synchronizer or schema-preparation CLI.
- No local item writes, new set-effect authority, H8 expansion, scheduler
  activation, DDL, direct SQL/Redis repair or consumed identity reuse.
- Proof: source-derived proposal, scope/identity/drift/rollback tests, fresh
  operation packet, locked rederivation, exact terminal DB rows and matching
  public/admin field readback including Ninja member256. Repair evidence is
  distinct from fresh source-change and automatic natural-tick acceptance.

## Execution checklist

- [x] Record explicit amendment and preserve original guardrails.
- [x] Build a pure bounded secondary-projection proposal with source-derived
  values, complete baselines and explicit inserted-ID bindings; RED/GREEN first.
- [x] Add transaction locking/fences, exact readback and uncertainty handling;
  register only the exact operation and immutable proposal/result paths.
- [x] Review proposal/runner/catalog/manifest with the current model and run
  related tests. Generate a new frozen packet only after every gate passes.
- [x] Execute once through the registered runner and compare DB/public/admin
  results. Record no-op separately if the target no longer needs changes.
- [ ] Continue Armor source/image-role/cache/full-chain, Buff and Shimmer gates
  from the parent plan without widening the authorized scope silently.

## Current observations

- Backend18102/MySQL13306/Redis6380/MinIO19000 are listening, same backend owner.
- Read-only MySQL at2026-09-26T06:25:45Z matches server UUID
  b4ae6728-4f72-11f1-bcc9-00155d37eadf. Ninja attribute34/maint34/landing12448
  and effect6 have matching persisted relation lineage; landing is historical
  maint legacy_compat, not a newly fetched source_evidence row.
- Existing secondary projection schemas have non-auto-increment primary IDs.
  Generic buildProjectionPayload assigns index+1; this repair must discard that
  allocation and bind new IDs to verified stable relation row IDs instead,
  rejecting collisions. Existing projection identities take precedence.

## Implementation and current-model review (2026-09-26 15:00 CST)

- Proposal, source/target snapshot, transaction and governed runner are now
  implemented in `pipelines/relation/armor-secondary-projection*` and
  `run-armor-secondary-projection*`; catalog/manifest register only the two
  approved ownership predicates. See git for code-level diff details.
- Source re-extraction, maint/relation equality and exact local member ID-name
  joins precede projection derivation. Existing IDs and timestamps survive;
  inserts bind explicit existing relation IDs, never ordinal IDs.
- Freeze an explicit223-member subset:224 attributes and290 effects,514
  prospective inserts. Ten missing-source members remain excluded, and
  coverage.complete=false; this is not full A6 or automatic acceptance.
- Transaction uses RR, locked Owner/policy/fence/source/target readback,
  durable private PREPARED before permit/DML, exact receipts and pre/post-commit
  after-set equality. Commit uncertainty never triggers blind rollback.
- Current-model serial review found a material registration gap: the request
  builder omitted dynamic proposal bytes. RED reproduced missing manifest
  rejection; the fix binds the exact private manifest input and rejects missing
  or publicly readable artifacts. Shared verifier was not relaxed.
- The original related regression was1790 pass/3 fail/1 existing skip; the
  three catalog test failures were reconciled with the new operation. Updated
  binding/manifest/transaction tests119/119; related automation/Armor/relation
  regression1587/1587; governed runner integration4/4, including real packet,
  one-use permit, private immutable PREPARED/result and repeat rejection.
- Runner fixture errors were test SQL-routing/parsing bugs, repaired without
  changing production behavior. Full related rerun after that test is pending.
- Runtime health UP. First preflight timed out at15s; a bounded45s retry returned
  HTTP200 at2026-09-26T06:59:15.640123283Z: disabled,0/0 live work and unchanged
  H8/epoch. No restart or runtime mutation was needed. Capture fresh persisted
  preflight before packet preparation/execution; old readback is not authority.
- Logs: `.local/logs/armor-secondary-binding-review-20260926.log` and
  `.local/logs/armor-secondary-reviewed-regression-20260926.log`.

## Validation and risks

- Final related regression1588/1588, syntax checks and `git diff --check`
  passed. Current-model spec/quality review has no remaining material finding
  for this explicit bounded subset (not independent approval).
- Live read-only preparation produced proposal
  `sha256:54beeabc2d9e9c3244619782d71f10cc1c0c2c9cfd38a5a46c97f0f706fe7073`;
  fresh rederivation before authorization was identical. Both targets0 rows;
  insert224+290/update0/delete0. Ninja public pieceEffects still empty before.
- Fresh packet for decision `armor-secondary-a6-20260926-01` expires at
  2026-09-26T07:33:47.156Z; private artifacts use prefix
  `reports/authorization/canonical/canonical-armor-secondary-projection.a6-20260926-01`.
  Packet SHA256 `4f2026d947a27a7fdbcdcbc9a1ecfde83e7eac873c7fff945b2f5cf1ab13d862`.
  Next action is one registered dispatch followed by separate terminal readback.
- The pre-dispatch checkpoint above is superseded by the live result below.
- Technical source/freshness/ownership gates remain despite user approval.
- Full-chain source-evidence and managed-image gaps remain in the parent.

## Governed result and separate readback (2026-09-26 15:10 CST)

- Registered dispatch exited0; result COMMITTED, affectedRows514:
  projection_item_armor_attributes0->224 and
  projection_equipment_effect_attributes0->290. No updates or deletes.
  Decision `armor-secondary-a6-20260926-01` and its permit are consumed;
  never replay. Durable PREPARED/result and dispatcher log
  `.local/logs/armor-secondary-dispatch-a6-20260926-01.log` are retained.
- Separate read-only readback at2026-09-26T07:06:31.335Z matches the complete
  frozen after-set hash; complete source snapshot hash is unchanged, and
  rederiving from current targets gives0 changes. Private `.readback.json`
  under the same prefix includes DB counts plus public/admin Ninja members
  256/257/258 with exactly3 existing source-derived effects each (previously0).
  IDs, owner/source/class/stat/value/unit/parse fields match expected rows.
- Post-write preflight at07:06:30.653172241Z: HTTP200, disabled, attempts/claims
  0/0, healthy reconciler, unchanged H8/epoch. No restart, source probe,
  crawler/import, scheduler control, Redis write, local item write or DDL.
- This proves only approved bounded projection publication and DB/API parity,
  not semantic source correctness, complete A6, fresh-source ingestion,
  eight-domain/natural-tick or sustained automation acceptance.

## New material finding: historical attribute/effect semantics

- Owner/reviewer: current-model Codex, serial. Disposition: BLOCK further
  acceptance/publication until a new bounded source-chain amendment is approved
  and validated; this is not a repeat request for the already-used two-table
  projection scope. Parent remains active; this child is blocked on that new
  boundary. No corrective business write or discretionary rollback was made.
- Complete frozen-batch comparison finds133 attribute rows (133 members) whose
  slot_group conflicts with relation_armor_set_items.part_role,181 effect rows
  with mismatched slot_type, and114 explicit melee/ranged/magic critical-chance
  cells represented as class_scope=all. All already exist in upstream facts.
- Ninja256/257/258 demonstrates both: maint records34/76/108 and historical
  landing12448 already label every piece head; module members correctly say
  head/body/legs. `buildArmorAttributeRelations` carries that slot through.
  `buildArmorAttributeEffectRows` explicitly maps all three class-specific crit
  cells to all; sourceLine retains the original class-specific cell key.
- Public UI `effectReadableStatName` partially compensates using sourceLine;
  do not claim a measured triple-counting UI bug. The DB/API typed ownership
  and class fields are nonetheless inconsistent. No browser visual claim made.
- Existing tests/locked hashes proved historical lineage equality, not these
  cross-source semantic invariants. Add RED fixtures for all three crit classes,
  body/leg slot identity, partial/ambiguous source and old-key retirement before
  allowing another publication. Do not hide this with a projection-only rewrite.
- Proposed new scope is in plan A6.3: reviewed attribute-source acquisition/
  parsing plus bounded maint/relation repair and republishing; preserve original
  landing history, declare any new armor_attributes_raw landing partition,
  authorize only exact stale-effect retirement/new keys necessitated by real
  evidence, and keep scheduler/H8/local-item/DDL restrictions. Ten missing-source
  members stay excluded unless new valid source evidence supports them.

## 2026-09-27 continuation

- User explicitly continued the full automation-ingestion plan. Coordinator
  remains Codex; all existing dirty paths and the consumed A6.2 identity are
  preserved. A6.3 is active again under a new operation/decision identity;
  `armor-secondary-a6-20260926-01` remains consumed and must not be replayed.
- Fresh read-only runtime probe at 2026-09-26T21:03:29.593Z (backend 18102)
  returned UP, scheduler disabled/changed-only/60m, live attempts/claims 0/0,
  healthy reconciler, unchanged H8 and V2 epoch, and Redis PONG. All eight
  domain readiness rows remain blocked, so scheduler activation and natural
  tick execution are not entered.
- Fresh relation read-only audit still finds 133 unique member slot conflicts
  and 128 item-owned critical cells with `class_scope=all`; these are the
  A6.3 RED targets. No database, Redis, scheduler-control, local-item, DDL,
  or source landing write has been made in this continuation checkpoint.
- The live source fetch now uses the actual Wiki headings (`头盔`/`上衣`/`裤装`)
  and produced 230 records with slot counts head92/body74/legs64. Immutable
  source evidence and proposal artifacts are private and no-overwrite:
  `reports/authorization/canonical/canonical-armor-semantic-repair.a63-20260927-01.source.json`
  (`sha256:97a8a09d0c24f7b7406ccb8a5fbd3c415eae64476708a933f7148b6d24262581`)
  and `...proposal-final.json`
  (`sha256:426ac39b2ac87f3bfb4e5006500747a3aab97252c165766351b3f01291c38df5`).
  The proposal is read-only and preserves historical landing 12448; it plans
  154 maint inserts/138 exact stale-key retirements and 252 relation-effect
  inserts/252 exact old-key retirements. Rebuilt slot mismatch is 0 and the
  new class scopes are explicit melee/ranged/magic/summon.
- TDD RED/GREEN coverage now includes live Wiki heading parsing, exact
  member-slot reconciliation, class-specific critical cells, candidate slot
  blocking, and the `armor_attributes_raw` source-evidence partition. The
  integrated A6.3-focused command passed 182/182 tests plus syntax checks.
- A3/A4 execution remains blocked after the proposal: the registered
  `canonical-armor-ingestion` executor owns only armor-set landing/maint/
  relation/projection tables, while `canonical-armor-secondary-projection`
  owns only the two projection tables. No registered packet can yet write the
  new armor-attributes landing/maint/relation rows or retire the exact stale
  effect keys. No packet, permit, decision, database, Redis, scheduler, or
  local-item mutation was attempted.

## A6.3 semantic repair and projection completion (2026-09-27)

- The semantic repair executor completed the upstream landing/maint/relation
  repair before this projection continuation. A fresh proposal/manifest/request/
  packet chain was generated under the new `.a63-20260927-22` namespace with
  owner `admin`; no prior `.16` or failed retry identity was reused.
- Registered serial dispatch committed `718` projection changes through
  `run-authorized-canonical-operation.mjs`. Terminal evidence is
  `reports/authorization/canonical/canonical-armor-secondary-projection.a63-20260927-22.result.json`:
  status `COMMITTED`, `affectedRows=718`, exact after-set hash
  `sha256:3569b189ad0b04a00946a618cb1b0bff0c8b00249cb8f9140bb361f92f30af0a`.
  Decision and permit are consumed; the `.21` attempt is retained as
  `ROLLBACK_CONFIRMED` evidence after the pre-fix retired-key receipt failure.
- Database readback confirms projection attributes `224 total/223 active/1
  retired`, effects `515 total/290 active/225 retired`, zero active lineage
  mismatches, zero active class-scope mismatches, and exactly `223` active
  attribute members. The ten excluded member IDs have no active or historical
  projection rows from this operation. No `local.items` write or DDL occurred.
- The executor regression exposed that a retired relation key can change while
  the projection primary ID remains stable. Its minimal fix updates by stable
  projection `id` and writes the replacement `relation_record_key`; focused
  Node22 secondary projection validation is `47/47`.
- API readback after a backend restart with scheduling disabled confirms public
  Ninja `256/257/258` each return one armor attribute and exactly three active
  melee/ranged/magic effects. The public query now filters `status=1 AND
  deleted=0`; `PublicItemServiceImplTest` is `12/12`. Admin armor summary
  reports `totalRows=223`, `effectRows=290`, `rowsWithEffects=144`.
- Final runtime preflight at `2026-09-26T23:47:46.902559820Z` is HTTP 200 with
  scheduler disabled/changed-only/60m, attempts/claims `0/0`, healthy
  reconciler, queue contract v2, unchanged epoch
  `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`; authenticated Redis readback is
  `PONG`. The backend restart used worktree classes and preserved
  `SPRING_TASK_SCHEDULING_ENABLED=false`.

## Remaining scope

- This closes the A6.3 semantic/projection/API gate for the selected223-member
  subset only. Armor image revision/cache evidence, complete Armor source
  acceptance, Buff, Shimmer, fresh source changes, natural tick and sustained
  automation remain open under the parent plan. Scheduler activation remains
  forbidden until those independent gates pass.

## Handoff

- Read this entry, authorization register and plan A6.3 first. Do not replay
  any consumed identity, including the successful514-row batch or failed
  `.21` attempt. User need not restart services after the verified backend
  restart.
- Fresh validations: secondary projection Node22 tests47/47, focused Maven
  tests12/12, terminal DB/API/preflight/Redis readback, `node --check`, and
  `git diff --check` all pass. Broad Maven/frontend/full gate and live source
  refresh were not run in this slice.
- Final read-only checks for this continuation:73 tracked changes/1347
  untracked,0 staged, HEAD0f871e94, no upstream. `git diff --check`, syntax,
  focused tests, private artifact modes and consumed-identity preservation
  pass. The ownership inspection confirms the existing full-chain manifest
  still excludes the A6.3 landing/maint/relation tables.

## Commits

- None; active uncommitted continuation.

## 2026-09-27 Armor image evidence checkpoint

- Fresh read-only runtime recheck at `2026-09-27T00:24:39.504611450Z` returned
  HTTP 200, scheduler disabled/changed-only/60m, attempts/claims `0/0`, healthy
  reconciler, unchanged H8 policy hash and V2 epoch. Backend PID 3848587 remains
  on 18102 with `SPRING_TASK_SCHEDULING_ENABLED=false`; MySQL server UUID is
  `b4ae6728-4f72-11f1-bcc9-00155d37eadf` and Redis authenticated readback remains
  available.
- The authorized Armor image source fetch completed without warnings at
  `2026-09-27T00:39:49.026Z`: 63 armor-set inputs, 419 image rows, roles
  `male=67`, `female=87`, `part=238`, `demo=27`; every row has an original URL
  and per-file source revision. Collection revision remains null by contract.
  The fetch only wrote worktree raw/progress/report evidence and did not write a
  database, Redis, local item, or scheduler-control row.
- Immutable private evidence is
  `reports/authorization/canonical/canonical-armor-image-source-evidence.a63-20260927-23.json`
  (`0600`, sha256
  `sha256:07b4c5b3fa413100cab8a4c346556d3a222b5af6d6924463802e522c89a0b4ae`).
  It binds the raw source bytes and a read-only maint snapshot. The source has
  419 missing managed cache URLs; maint has 175 rows, all 175 missing revisions
  and one missing cache. This is an explicit blocker: no managed-image value was
  invented and no image write authority exists in the current bounded operation.
- Focused source, landing, maint, semantic-key, and registration regression is
  `61/61` passing. The image evidence gate therefore remains blocked on a
  separately authorized managed-image upload/cache operation and cannot mint a
  full Armor packet or scheduler acceptance.
- Supplementary Buff/Shimmer contract regression after this checkpoint is `87/87`
  passing, covering Buff projection containment, supplementary L1 preview modes,
  Shimmer input-contract binding and rollback/drift guards. These are mechanism
  checks only; no Buff or Shimmer packet was minted because Buff still lacks a
  bounded full-chain page-immunity executor and Shimmer still lacks the reviewed
  six-scope cross-owner partition executor.
- Final post-test preflight at `2026-09-27T03:56:20.828382875Z` is HTTP 200 with
  `enabled=false`, `changed-only`, live attempts/claims `0/0`, healthy reconciler,
  unchanged epoch/policy hash; authenticated Redis readback is `PONG`.
