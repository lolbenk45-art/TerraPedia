# Item Canonical Identity Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive and replace exactly five legacy records that occupy current standardized item IDs across canonical tables, then create their derived `projection_items` rows through a separately authorized bounded operation.

**Architecture:** A new `canonical-item-base-entity-restoration` operation owns an immutable, decision-derived attempt directory. Its no-write proposal loads only the five allowlisted records from `data/standardized/items.standardized.json`, verifies the five exact historical legacy occupants and their five audit rows, managed relation-image evidence, and absence of protected consumer references, then freezes an archival snapshot. Its apply path writes the archive before it enters a transaction, locks and rechecks all target rows, consumes the permit, deletes `5/5/5/5` legacy/audit rows, inserts five rows into each canonical entity table in dependency order, re-reads them, and commits only on exact hashes.

**Tech Stack:** Node.js ESM, `node:test`, MySQL (`mysql2/promise`), existing canonical authorization/manifest/dispatch utilities.

---

## Scope and Source Chain

- Sole write source: `data/standardized/items.standardized.json`.
- Exact source IDs: `5049`, `5051`, `5063`, `5067`, `5074`; exact keys: `RoninShirt`, `TimelessTravelerHood`, `TVHeadPants`, `AntlionEggs`, `BoneWhip`.
- Database chain: standardized record -> `terria_v1_maint.maint_items` -> `terria_v1_relation.relation_items` -> `terria_v1_relation.projection_items`.
- `relation_item_images` is read-only evidence for the frozen managed projection image. `terria_v1_local.items` is never read for field values and is never written.
- No `UPDATE`, `REPLACE`, `ON DUPLICATE KEY`, `INSERT IGNORE`, schema DDL, full rebuild, local write, crawler, source flip, shimmer, scheduler, or cleanup of the other 15 legacy-only rows. Hard deletion is restricted to the five archived legacy records in each owned table and their five audit rows.

### Task 1: Define The Frozen Five-Record Contract

**Files:**
- Create: `scripts/data/relation/item-canonical-base-entity-restoration-contract.mjs`
- Create: `scripts/data/relation/item-canonical-base-entity-restoration-contract.test.mjs`

- [ ] **Step 1: Write failing contract tests**

Test the public contract against a fixture with source IDs and managed image evidence:

```js
assert.deepEqual(RESTORATION_KEYS, [
  'AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood',
]);
assert.deepEqual(proposal.maintRows.map((row) => row.sourceId), [5067, 5074, 5049, 5063, 5051]);
assert.equal(proposal.maintRows.length, 5);
assert.equal(proposal.relationRows.length, 5);
assert.equal(proposal.projectionRows.length, 5);
assert.throws(() => buildProposal({ ...fixture, standardized: fixture.standardized.slice(1) }), /five.*standardized/i);
assert.throws(() => buildProposal({ ...fixture, legacyMaintRows: fixture.legacyMaintRows.slice(1) }), /five.*legacy/i);
assert.throws(() => buildProposal({ ...fixture, protectedReferences: [{ table: 'item_recipe_heads' }] }), /protected consumer/i);
assert.throws(() => buildProposal({ ...fixture, managedImages: [{ itemInternalName: 'BoneWhip', cachedUrl: 'https:\/\/example.invalid\/x.png' }] }), /managed/i);
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/data/relation/item-canonical-base-entity-restoration-contract.test.mjs`

Expected: fail because the contract module does not exist.

- [ ] **Step 3: Implement the pure contract**

Export the exact key/ID and legacy-occupant constants, `buildItemCanonicalBaseEntityRestorationProposal`, serializers, stable SHA-256 hashing, proposal/input/result validators, and repository-confined JSON writer. Build maint fields solely from the standardized record, preserve the standardized JSON as `raw_json`, derive relation rows with `buildBaseEntityRelations`, and derive projection rows with `buildProjectionPayload` plus the frozen managed primary image. Require the five exact active historical legacy rows in each target table, exactly five audit rows, zero protected consumer references, and one unique active managed primary image for each standardized key.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command. Expected: all contract tests pass.

### Task 2: Read-Only Proposal And Transactional Insert

**Files:**
- Create: `scripts/data/relation/item-canonical-base-entity-restoration-db.mjs`
- Create: `scripts/data/relation/item-canonical-base-entity-restoration-db.test.mjs`
- Create: `scripts/data/relation/build-item-canonical-base-entity-restoration-proposal.mjs`
- Create: `scripts/data/relation/build-item-canonical-base-entity-restoration-proposal.test.mjs`
- Create: `scripts/data/relation/apply-item-canonical-base-entity-restoration.mjs`
- Create: `scripts/data/relation/apply-item-canonical-base-entity-restoration.test.mjs`

- [ ] **Step 1: Write failing DB and CLI tests**

Use a recording connection to require:

```js
assert.deepEqual(events, [
  'archive', 'begin', 'lock-maint', 'lock-relation', 'lock-projection', 'lock-audits',
  'lock-images', 'recheck-standardized', 'recheck-legacy', 'consume-permit',
  'delete-maint-five', 'delete-relation-five', 'delete-projection-five', 'delete-audits-five',
  'insert-maint-five', 'insert-relation-five', 'insert-projection-five', 'read-five-layers', 'commit',
]);
assert.equal(dml.filter((sql) => /^INSERT\b/i.test(sql.trim())).length, 3);
assert.equal(dml.filter((sql) => /^DELETE\b/i.test(sql.trim())).length, 4);
assert.equal(dml.some((sql) => /\b(?:UPDATE|REPLACE|ALTER|CREATE|DROP)\b/i.test(sql)), false);
assert.equal(dml.some((sql) => /ON\s+DUPLICATE|INSERT\s+IGNORE/i.test(sql)), false);
await assert.rejects(runTransaction(driftFixture), /snapshot drifted/i);
assert.equal(events.includes('consume-permit'), false);
```

Also prove the read-only proposal uses only `START TRANSACTION READ ONLY`, `SELECT`, and `ROLLBACK`, rejects an unallowlisted standardized record, and the apply CLI refuses missing `--apply=true` before opening a connection.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/relation/item-canonical-base-entity-restoration-db.test.mjs scripts/data/relation/build-item-canonical-base-entity-restoration-proposal.test.mjs scripts/data/relation/apply-item-canonical-base-entity-restoration.test.mjs
```

Expected: fail because proposal, DB, and apply modules do not exist.

- [ ] **Step 3: Implement proposal and apply boundaries**

The proposal command must obtain its decision-derived attempt root from the new read-only `ADMIN` owner artifact, read standard bytes, run an explicit read-only transaction, verify server/database fingerprint, the five exact legacy occupants and their historical markers, five audit rows, no protected downstream consumer references, and active managed `relation_item_images`. Materialize `archive.json`, `snapshot.json`, `proposal.json`, and `input.json` only under that attempt root.

The apply command must load only its frozen input contract and authorized packet context. It writes the archival bytes by exclusive creation before opening the transaction. In one transaction lock all five `(source_id, internal_name)` maint/relation keys, projection keys, audit rows, and primary image rows with `FOR UPDATE`; recompute legacy/source hashes and reject any drift before consuming the dispatch permit. Delete exactly five rows from each of `maint_items`, `relation_items`, `projection_items`, and `item_projectile_audits`, then insert exactly five rows into each of `maint_items`, `relation_items`, and `projection_items`, re-read all 15 entities, compare hashes, and commit. Any error rolls back; no terminal completed result is written on failure except the operation-specific private failed result.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 command and Task 1 command. Expected: all tests pass, with rollback on every failure fixture.

### Task 3: Register The Distinct Governed Operation

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`

- [ ] **Step 1: Write failing registration tests**

Assert the new operation has an exact decision-derived attempt root, one input/result pair, `databaseWrites: true`, `networkAccess: false`, and command:

```js
[
  'node',
  'scripts/data/relation/apply-item-canonical-base-entity-restoration.mjs',
  `--input-contract=${attemptRoot}/input.json`,
  '--apply=true',
  `--output=${attemptRoot}/result.json`,
]
```

Reject a foreign attempt root, an input whose hashes do not bind standard/proposal/snapshot/archive/read-only authorization bytes, any result other than `completed`, `apply: true`, `5/5/5/5` deletes and `5/5/5` canonical inserts, and a result whose input hash differs from manifest input bytes.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/run-authorized-canonical-operation.test.mjs
```

Expected: registration assertions fail for the missing operation.

- [ ] **Step 3: Implement operation registration**

Add only `canonical-item-base-entity-restoration` to the catalog, operation code bundle, execution-manifest definition, authorization data-entry reader, and dispatcher result validator. Its data bundle must include standard source bytes, read-only owner artifact, proposal, snapshot, input, and relevant contract/apply code bundle. Preserve every existing item-image projection operation unchanged; do not register or execute the invalid projection-only insertion operation.

- [ ] **Step 4: Verify GREEN**

Run the Task 3 command plus Task 1 and Task 2 tests. Expected: all suites pass.

### Task 4: Generate Fresh ADMIN Authorization And Restore Canonical Rows

**Files:**
- Create: decision-derived private artifacts under `reports/authorization/canonical/item-canonical-base-entity-restoration/<attempt-id>/`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`

- [ ] **Step 1: Preflight implementation evidence**

Run all Task 1-3 suites, `node --check` for each new executable, and `git diff --check`. Resolve any failure before creating an owner artifact.

- [ ] **Step 2: Generate and run the read-only ADMIN proposal**

Create a fresh `ADMIN` no-write decision for `canonical-item-base-entity-restoration`. Execute only the proposal command and verify its snapshot lists exactly the five IDs/keys, 5 standardized records, 5 managed primary image records, and zero active target rows in maint/relation/projection. No permit is created or consumed in this step.

- [ ] **Step 3: Generate independent ADMIN apply material**

Build a new execution manifest and authorization request from the successful proposal; create a distinct `ADMIN` packet and one-time permit. Confirm it binds the same attempt root, data hashes, code bundle, the four target table names, immutable archive, exact `5/5/5/5` DELETE scope, and exact `5/5/5` INSERT scope.

- [ ] **Step 4: Dispatch once and validate result**

Dispatch through `run-authorized-canonical-operation.mjs`. Require terminal result `completed`, `apply: true`, exactly five archived/deleted records in each owned legacy/audit table, and exactly five inserted records for each canonical entity table. Read back all 15 current rows by source ID/internal name, verify no local writes, no rows outside the exact legacy allowlist were deleted, and no permit remains.

### Task 5: Close The Existing Item-Image Projection Runtime Gate

**Files:**
- Create: new immutable artifacts under `reports/authorization/canonical/item-image-projection-apply/<attempt-id>/`
- Create: post-apply audit reports under `reports/audit/`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`

- [ ] **Step 1: Create a fresh read-only projection proposal**

Run the existing `canonical-item-image-projection-apply` proposal path with a fresh `ADMIN` no-write decision. Require active parity of all 6131 lineage keys in `projection_items`; the five restored keys must now be present and the 20 projection-only rows must remain untouched.

- [ ] **Step 2: Authorize and apply only the 6131 image updates**

Generate independent `ADMIN` request/packet/permit and dispatch the existing projection apply. Verify the result records only `projection_items.image` updates and forbids `INSERT`/`DELETE`.

- [ ] **Step 3: Run closure evidence**

Run the image-lineage audit, items-readiness audit, and cross-DB quick audit. Record counts, hashes, residual shimmer warning, and the next gated task in the devlog. If any audit is blocked, retain this entry as `blocked` with its new evidence rather than continuing to shimmer/source-flip/scheduler work.
