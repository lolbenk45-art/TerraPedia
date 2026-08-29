# Ten-Blocker Local Closure Implementation Plan

> **Execution rule:** Use the existing serial governed-operation framework. Do
> not consume a permit until all fresh proposals have been summarized for one
> exact operator confirmation.

**Goal:** Reduce the ten independent root blockers in the 2026-08-24 closure
index to zero using local evidence and exact governed operations.

**Design:**
`docs/superpowers/specs/2026-08-24-ten-blocker-closure-design.md`

## Task 0: Freeze the baseline

**Outputs:** a new run root under
`reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/<run-id>/`.

- [x] Record branch, HEAD, upstream distance, dirty/staged counts, service
  ports, database fingerprint, current closure-index hash, and the no-network
  boundary.
- [x] Run fresh SELECT-only Item partition, NPC audits, image lineage, Biome
  readiness, Boss source-chain, Shimmer readback, cross-DB, relation health,
  and core smoke.
- [x] Write `baseline.json` and `checkpoint.json`; reject any report that claims
  a write or has an input hash different from the indexed artifact.

## Task 1: Reconcile the canonical NPC terminal anchor and relation loss

**Files:**

- `pipelines/npc-canonical/build-canonical-npc-apply-input.mjs`
- `pipelines/npc-canonical/build-canonical-npc-apply-input.test.mjs`
- `reports/authorization/canonical/canonical-npc-apply.input.json`

- [x] Keep the missing private input absent. Bind reconciliation to the exact
  committed terminal T2 readiness bytes from commit
  `0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf`; never use the mutable readiness
  output itself as the terminal anchor.
- [x] Validate the frozen 25 crawler landing/maint pairs against the terminal
  input hash and current readback without recreating authorization input.
- [x] Rebuild the current NPC relation snapshot read-only. If it differs from
  terminal T2, report the real downstream loss rather than republishing pass.
- [x] Recover `relation.npc_buff_relations` only through a separate Buff-owned
  proposal derived from current `maint_npcs`, `maint_buffs`, and matched crawler
  facts. Bind all 1,270 ordered keys and prove exact equivalence to the existing
  local compatibility tuples; do not reverse-copy local rows.
- [x] Rerun NPC readiness after the governed relation recovery and prove the
  quality-gate panel clears.

## Task 2: Recover Item source evidence locally

**Files:** existing Item candidate/partition builders and a new run-local
classification report only unless a code defect is proven by a red test.

- [x] Join every blocked/quarantine candidate to raw/generated source records,
  maint Item identity, relation Item identity, and existing local source rows.
- [x] Prove exact identity using stable IDs/internal names and source keys; a
  display-name-only match is invalid.
- [x] Rebuild the partition and verify conservation across all 2,354 rows.
- [x] If accepted remains zero, emit `item-source-local-evidence-exhausted.json`
  and create no operation. If accepted is nonzero, generate a separate exact
  Item-source proposal and include it in Task 6 authorization.

## Task 3: Recover Boss and Shimmer terminal results

**Targets:** owner-05 Boss source refresh and owner-06 Shimmer L1 apply.

- [x] Search immutable manifests, packets, dispatch ledgers, operation logs,
  before/after snapshots, and audit rows for exact changed-row counts.
- [x] Add a tested result-reconciliation writer that accepts only immutable
  bound inputs and refuses current-count inference or permit replay.
- [x] Produce one terminal result per operation with original decision/packet/
  permit identities and exact counts.
- [x] If exact counts cannot be reconstructed, preserve the blocker and record
  the missing evidence; never substitute current table counts.

## Task 4: Repair the six NPC loot identities

**Owned scope:** the six named active loot identities in
`npc-identity-regression-blocker.json`.

- [x] Repair the stale plan assumption before implementation: all six active
  relation rows are legacy `generated.item_relations_bundle:chunk:0001` rows;
  the six canonical `generated.npc_item_relations_bundle` relation rows are
  missing, while their landing `12474`, maint rows, and source facts remain
  active. Updating chance text in place is forbidden because it would preserve
  incorrect lineage.
- [x] Add red tests proving the proposal freezes six canonical insert keys, six
  legacy retirement keys, and six projection keys; accepts the canonical Wiki
  modes representation; leaves local rows unchanged; and rejects a seventh
  row, changed Item identity, changed probability, stale before hash, or
  landing/maint/source-fact drift.
- [x] Implement a fresh registered operation that inserts only the six missing
  canonical relation rows, retires only the six active legacy relation rows,
  and replaces only the corresponding six projection JSON array elements.
  Source facts/details, maint, landing, and local rows are read-only.
- [x] Bind the immutable T2 readiness Git object at
  `0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf`, landing `12474` with content hash
  `febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05`,
  accepted projection
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json`
  with SHA-256
  `sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4`,
  database fingerprint, ordered before/after key sets, and row hashes. Do not
  recreate or bind the missing `canonical-npc-apply.input.json`.
- [x] Generate a dry-run proposal; no permit or DML in this task.

**Task 4 evidence (2026-08-24):**

- Registered operation: `canonical-npc-loot-identity-restoration`.
- Proposal:
  `reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json`.
- Exact scope is six canonical relation inserts, six legacy relation
  retirements, and six projection replacements (`18` physical rows). Scope is
  `sha256:b88dd7eedc5ca39292a4a1399600603bbc9531a27e25fe8febffc253e4273595`;
  proposal byte hash is
  `sha256:1f23a7f5dcdd0c5fe4a5f2db8a58b266c8902ce23cc64ac953c66c7dd05e8383`.
- The landing authority is explicitly cross-database: local landing
  `terria_v1_local.source_dataset_landings.id=12474` is produced by
  `terrapedia.generated`, while maint/fact/relation source provider remains
  `terraria.wiki.gg`. Treating maint landing ID `12474` as the authority is an
  invalid cross-database lookup.
- Focused operation tests pass `13/13`; authorization/manifest integration
  passes `85/85`. Independent locked readback exactly matches before hash
  `sha256:60fd9c6b6b232f429271d6582710bb166ad87e6beaf9272e2d448741c321d204`.
  No input, request, packet, permit, result, or database mutation was created.

## Task 5: Repair the five image ownership lanes

### 5.1 Item image / 物品图片

- [x] Rebuild the current accepted relation/projection set by joining
  `relation_item_images.item_internal_name` to the projection identity; do not
  use the unrelated numeric Item ID as the join key.
- [x] Prove the current 6,131 image values match between relation and projection
  while keeping all quarantined/legacy-unowned identities outside the accepted
  key set.
- [x] Correct the stale no-DML assumption: 331 matching values on both sides
  still carry the obsolete `localhost:9000` origin. Register one exact operation
  that removes only that trusted origin from both
  `relation_item_images.cached_url` and `projection_items.image` (`662` physical
  updates), while preserving 15 projection-only legacy identities as quarantine.
- [x] Generate and independently rebuild the exact proposal; do not replay any
  prior Item image permit.

### 5.2 NPC image / NPC 图片

- [x] Add red tests for an exact `projection_npcs.image_url` legacy-origin
  normalization operation.
- [x] Freeze 758 relation-backed keys and four missing identities as quarantine.
  Accept only the trusted `localhost:9000` origin plus the exact
  `/terrapedia-images/npcs/` bucket path and derive an origin-free after value.
- [x] Reject arbitrary origins, wrong entity buckets, query-only identities,
  path traversal, key/count drift, or a relation/projection before mismatch.
- [x] Register the new operation and generate only the 758 changed projection
  rows; relation rows remain read-only.

### 5.3 Projectile image / 弹幕图片

- [x] Add red tests for the same strict legacy-origin normalization contract on
  `projection_projectiles.image_url`.
- [x] Freeze 1,110 relation-backed keys and one missing identity as quarantine;
  accept only the exact `/terrapedia-images/projectiles/` path.
- [x] Register the independent operation and generate only changed projection
  rows; relation rows remain read-only.

### 5.4 Armor-set image / 套装图片

- [x] Prove the live projection is actually empty, not an audit adapter defect.
  The historical 88 rows were cleared by the aborted broad synchronizer, and
  both subsequent recovery operations omitted `projection_armor_sets` from
  their allow-lists.
- [x] Freeze the current canonical authority: 63 active relation sets, 470 set
  items, 175 image facts, 246 armor attributes, 320 equipment effects, and the
  current managed Item projection inputs. Never restore the obsolete 88-row
  backup as authority.
- [x] Add red tests for an exact `projection_armor_sets` restoration that
  rejects a non-empty before set, relation/count/hash drift, unsupported
  columns, or any delete/update of other projection tables.
- [x] Register a separate operation and generate a 63-row insert-only proposal.
  After restoration, evaluate the image arrays and related-Item fallback from
  the proposed rows; any remaining cached-image gap is a separate blocker and
  must not be filled from an invented URL.

### 5.5 Biome image / 生物群落图片

- [x] Freeze exactly the 40 active legacy-origin rows and the seven already
  origin-free rows as unchanged controls.
- [x] Derive every after URL only by removing the trusted legacy origin from
  the same `/terrapedia-images/items/` object path; do not synthesize paths,
  change relation rows, or refresh source timestamps.
- [x] Add red tests for count/key/origin drift and generate a new exact Biome
  projection-only proposal rather than replaying the old 47-row contract.

## Task 6: Consolidated exact authorization

- [x] Run all focused tests and all proposal validators.
- [x] Write a bilingual authorization table with operation ID, decision ID,
  target table/columns, exact row count, scope hash, proposal hash, and expected
  readback for every non-empty proposal.
- [x] Obtain one operator confirmation covering only those exact proposals.
- [x] Generate packets and one-time permits only after confirmation.

**Current authorization boundary (2026-08-24):** all seven proposals were
independently rebuilt byte-for-byte in
`reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/proposal-independent-rebuild-v2.json`.
The retained fixed-name Buff input/manifest/request are stale historical
evidence. Proposal preparation is now separated from authorization preparation,
and the current Buff technical artifacts use no-overwrite `.retry-01.*` paths.
No retry authorization artifact may be generated before the consolidated table
is confirmed.

## Task 7: Serial apply and independent readback

- [x] Execute one operation at a time; ensure no other writer is active.
- [x] Consume each permit only inside its transaction fence.
- [x] After commit, independently select every target key and compare expected
  after hashes before starting the next operation.
- [ ] On unknown outcome, stop and reconcile. Do not blindly retry.
- [x] Revoke/record the terminal permit state and index each result hash.

## Task 8: Fresh closure gates

- [x] Restart or reuse the local stack through
  `platform/local/start-local-stack.sh --reuse-existing` after all writes are
  terminal.
- [x] Run Item partition, NPC readiness/source/domain/runtime, Boss parity,
  Shimmer readback, five image lanes, cross-DB, relation health, and core smoke.
- [x] Run focused Node tests, full Maven, Admin checks, Public checks, and
  `platform/local/quality-gate.sh`.
- [x] Require the quality gate to exit `0`; classify a derived failure under its
  owning root rather than double-counting it.

## Task 9: Independent review and devlog closeout

- [x] Build a fresh closure index containing every artifact path and SHA-256.
- [x] Validate all indexed files and hashes.
- [x] Run the TerraPedia plan-auditor review against goal, source chain,
  boundaries, evidence, continuity, ownership, and closeout readiness.
- [x] Update the active devlog with exact results and residual risk.
- [x] Close only when `independentRootBlockerCount=0`; otherwise keep the
  parent active and name each remaining root cause.

## Final Continuation Checkpoint (2026-08-24 16:49 CST)

- Armor retry-05 is terminal: 63 rows committed and independently read back
  byte-for-byte. The independent evidence is indexed in
  `reports/runtime/local-data-chain-closure/20260824/fresh-163744-armor-final/`.
- Fresh acceptance is `19/19`, domain acceptance is `47/47`, cross-DB is
  `10/10`, core smoke is `OK: true`, and the complete quality gate exits `0`.
- Eight original independent roots are closed. Two Item roots remain:
  `accepted=0` source evidence and stale Item projection apply evidence.
- The plan remains blocked by design. No Item operation, reresolve candidate
  apply, direct SQL, external request, cleanup, staging, or commit is allowed
  until the two remaining evidence roots are resolved.

## Stop Conditions

- External evidence is required for Item and no local exact trace exists.
- A proposal target/hash/count drifts after operator confirmation.
- A transaction result is unknown and cannot be reconciled from readback.
- A lane would require direct SQL, permit replay, invented evidence, or a target
  outside its registered ownership boundary.

These conditions stop mutation but do not authorize cleanup, rollback of user
files, staging, commit, or scope expansion.
