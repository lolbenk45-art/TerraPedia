# Item Image Projection Missing-Row Insert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert the five authorized missing item projection rows through a separate, hash-bound ADMIN operation, then complete the existing image-only projection update and audits.

**Architecture:** A new `canonical-item-image-projection-missing-row-insert` operation owns only an immutable five-key allowlist and `terria_v1_relation.projection_items` INSERT. Its read-only proposal freezes source `relation_items` and primary managed-image values, the apply transaction locks and rechecks them before inserting exactly five rows. The existing `canonical-item-image-projection-apply` remains unchanged in authority and receives a new proposal only after the inserts finish.

**Tech Stack:** Node.js ESM, `node:test`, MySQL (`mysql2/promise`), existing canonical authorization dispatcher and private evidence helpers.

---

### Task 1: Bounded Insert Contract And Snapshot

**Files:**
- Create: `scripts/data/relation/item-image-projection-missing-row-insert-contract.mjs`
- Create: `scripts/data/relation/item-image-projection-missing-row-insert-contract.test.mjs`
- Create: `scripts/data/relation/build-item-image-projection-missing-row-insert-proposal.mjs`
- Create: `scripts/data/relation/build-item-image-projection-missing-row-insert-proposal.test.mjs`

- [ ] **Step 1: Write failing pure-contract tests**

Create a fixture with the literal ordered allowlist:

```js
const EXPECTED_KEYS = [
  'AntlionEggs', 'BoneWhip', 'RoninShirt',
  'TVHeadPants', 'TimelessTravelerHood',
];
assert.deepEqual(contract.keys, EXPECTED_KEYS);
assert.equal(contract.targetRowCount, 5);
assert.throws(() => buildMissingRowInsertProposal({ ...fixture, keys: ['BoneWhip'] }), /five.*keys/i);
assert.throws(() => buildMissingRowInsertProposal(existingProjectionFixture), /already exists/i);
assert.throws(() => buildMissingRowInsertProposal(unmanagedRelationFixture), /managed/i);
```

Assert an attempt root derived from the read-only ADMIN decision, private no-overwrite paths for snapshot/proposal/input/manifest/request/packet/permit/result, canonical hashes for source rows and planned rows, and exact rejection of unknown keys or cross-attempt artifact paths. The planned row must bind the complete `projection_items` columns copied from the matching active `relation_items` record, with `relation_record_key` and `image` bound to the matching active primary image relation. It must never accept caller-supplied SQL, an UPDATE, or a DELETE.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/relation/item-image-projection-missing-row-insert-contract.test.mjs scripts/data/relation/build-item-image-projection-missing-row-insert-proposal.test.mjs
```

Expected: imports fail because the new contract and proposal modules do not exist.

- [ ] **Step 3: Implement the pure contract and read-only proposal**

Define operation ID `canonical-item-image-projection-missing-row-insert` and contract version `item-image-projection-missing-row-insert-v1`. Reuse canonical stable JSON hashing and the repository private-file confinement pattern from `item-image-projection-contract.mjs`, but keep all constants, serializers, and assertions in the new module.

The read-only proposal must validate completed overlay lineage evidence, current target fingerprint, the literal key set, active `relation_items` rows, active primary `relation_item_images` rows with managed URLs, and absence of active `projection_items` rows. It writes a private snapshot and proposal from the read-only transaction, then materializes a private input contract only from those bytes. Use `START TRANSACTION READ ONLY`, rollback, and close in `finally`; no DML SQL may exist in this module.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 command again. Expected: all tests pass and fake connection logs contain only `START TRANSACTION READ ONLY`, `SELECT`, `ROLLBACK`.

### Task 2: Insert Transaction And Authorized Apply Entry Point

**Files:**
- Create: `scripts/data/relation/item-image-projection-missing-row-insert-db.mjs`
- Create: `scripts/data/relation/item-image-projection-missing-row-insert-db.test.mjs`
- Create: `scripts/data/relation/apply-item-image-projection-missing-row-insert.mjs`
- Create: `scripts/data/relation/apply-item-image-projection-missing-row-insert.test.mjs`

- [ ] **Step 1: Write failing transaction tests**

Use a recording MySQL fixture to require this event sequence:

```js
assert.deepEqual(events, [
  'begin', 'lock-source-rows', 'lock-primary-image-rows', 'lock-projection-rows',
  'consume-permit', 'insert-five', 'read-inserted-five', 'commit',
]);
assert.match(dml[0], /^INSERT INTO `terria_v1_relation`\.`projection_items`/i);
assert.equal(dml.some((sql) => /UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER/i.test(sql)), false);
assert.throws(() => executeMissingRowInsertTransaction(driftFixture), /snapshot drifted/i);
```

Cover duplicate keys, a pre-existing row, source/image fingerprint drift, changed insert count, post-insert hash mismatch, permit-consumption ordering, and rollback after each failure. The expected INSERT has fixed column order and five parameterized value groups; it may not use `ON DUPLICATE KEY`, `INSERT IGNORE`, or an arbitrary table/column identifier.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/relation/item-image-projection-missing-row-insert-db.test.mjs scripts/data/relation/apply-item-image-projection-missing-row-insert.test.mjs
```

Expected: imports fail because the transaction and apply modules do not exist.

- [ ] **Step 3: Implement the single-transaction apply path**

Lock the five source `relation_items`, primary `relation_item_images`, and target projection keys with `FOR UPDATE`; rebuild the frozen contract and reject any drift before consuming the permit. Insert the exact five frozen projection rows, require `affectedRows === 5`, reread the five inserted rows, compare the canonical planned-row hash, and commit only after that comparison. On every exception, rollback and write a private terminal `failed` result containing transaction state. On success write a private lowercase `completed`, `apply: true` result containing the five-row count and frozen hashes.

The CLI must require an input path inside the exact attempt root and use `assertAuthorizedOperationDataBundle` plus an operation-specific authorization-environment check before opening a database connection. It cannot accept target, key, output, or SQL override flags.

- [ ] **Step 4: Verify GREEN**

Run the Task 2 command and the Task 1 suite. Expected: all tests pass.

### Task 3: Canonical Authorization Registration And Dispatcher Guards

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`
- Modify: `scripts/data/automation/authorized-operation-context.mjs`
- Modify: `scripts/data/automation/authorized-operation-context.test.mjs`

- [ ] **Step 1: Write failing manifest and runner tests**

Add assertions that the new operation has no fixed data path, has `databaseWrites: true` and `networkAccess: false`, and permits exactly one input and result rooted under its decision-derived attempt root. Verify the command contains only the input and `--apply=true`; tests must reject a sibling attempt path, fixed legacy path, altered output path, missing source/image/snapshot bytes, and data-bundle drift.

Add runner cases accepting only a lowercase completed five-row result. Reject a result with another operation ID, `apply: false`, a row count other than five, a wrong hash, a result from another attempt, or an inner failed result. Confirm the permit is created before spawn and cannot be consumed by a mismatched attempt.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/authorized-operation-context.test.mjs scripts/data/automation/run-authorized-canonical-operation.test.mjs
```

Expected: new-operation registration assertions fail.

- [ ] **Step 3: Register only the new operation**

Register its entry point, attempt-root manifest definition, strict nested private data-bundle resolver, exact result validator, and authorization environment verifier. The data bundle must hash input, proposal, snapshot, read-only owner artifact, all lineage evidence, and managed image policy bytes. The existing `canonical-item-image-projection-apply` registration, its image-only target ownership, and its result semantics must remain unchanged.

- [ ] **Step 4: Verify GREEN**

Run the Task 3 command. Expected: all listed suites pass, including existing projection-operation regressions.

### Task 4: ADMIN Evidence, Bounded Insert, Existing Image Update, And Audits

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`
- Create: immutable attempt files under `reports/authorization/canonical/item-image-projection-missing-row-insert/<attempt-id>/`
- Create: immutable attempt files under `reports/authorization/canonical/item-image-projection-apply/<attempt-id>/`
- Create: fresh reports under `reports/audit/`

- [ ] **Step 1: Run focused regression suite before evidence generation**

Run the Task 1, Task 2, and Task 3 test commands together. Expected: zero failures. Run `git diff --check` before any authorization or database step.

- [ ] **Step 2: Generate and execute bounded ADMIN insert authorization**

Create a fresh ADMIN read-only decision, generate its read-only snapshot/proposal/input, then generate a distinct ADMIN apply request, packet, and permit. Review that the immutable proposal lists exactly the five literal keys and that the formal DML scope is only `terria_v1_relation.projection_items` INSERT. Dispatch it once and require the terminal result to state five inserted rows. Do not reuse the blocked projection proposal attempt or any consumed lineage decision.

- [ ] **Step 3: Generate and execute the existing ADMIN image-only update authorization**

Create a new read-only proposal for `canonical-item-image-projection-apply`; it must now see all 6131 lineage keys as active projection rows. Generate a separate ADMIN request/packet/permit and dispatch the existing image-only operation. Verify its result updates only `projection_items.image`, with no INSERT or DELETE.

- [ ] **Step 4: Run post-apply audits and record handoff state**

Run the image lineage audit, items readiness audit, and cross-database quick audit using the new result evidence. Record actual counts, hashes, command outcomes, remaining shimmer warning, and the next gate in the devlog. Run `git diff --check` and targeted scans proving no old projection proposal is reused and no new operation permits UPDATE/DELETE.

