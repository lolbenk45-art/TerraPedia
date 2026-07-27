# B1 Group Landing Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and contract-test the immutable-history `source_dataset_landings` foundation for the Any Item Group canonical chain without changing any runtime/admin consumer or writing a formal database.

**Architecture:** Extend the landing contract in one place, then make the importer and all existing read-only consumers use the same current-row identity. A new Flyway migration expresses the exact local-schema change, but execution in this phase is limited to parser/contract tests; applying the migration to `terria_v1_local` or any T2 database remains a separate operation-level authorization.

**Tech Stack:** Node 20 ESM, `node:test`, MySQL 8 DDL text contracts, Spring Boot Flyway migration files, existing injectable database adapters.

**Source spec:** `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md`, especially Landing, DDL and volume invariants, Migration Sequence step 1, Testing and Acceptance items 1/2/14, and Rollback.

---

## Scope And Authorization Boundary

This plan is Phase 1A of the group chain. It delivers only the shared landing contract required by later canonical group tables and processors.

In scope:

- `item_groups_raw` dataset registration;
- landing artifact identity and producer metadata;
- multiple immutable historical rows with one current row;
- compatibility defaults for every existing dataset type;
- importer rejection of `compat_export` feedback and duplicate bootstrap hashes;
- the four existing consumers named by the design: importer archived-row handling, landing audit, cross-database integrity, and lineage trace;
- a byte-stable, parser-checked V56 migration artifact.

Out of scope:

- maint/relation group tables and group resolution;
- backend/admin consumer cutover;
- compatibility export generation;
- capability catalog expansion from 19 to 21;
- Owner or policy bootstrap;
- any crawler, import, backfill, apply, schema migration execution, T1 run, T2 write, service restart, push, or merge.

The plan may create the V56 SQL file and validate it as text. It must not run Spring against a formal database. A later separately authorized checkpoint binds the exact V56 bytes and database fingerprints before Flyway execution.

Execution is serial and single-owner. Tasks 1-3 share the landing contract and cannot be delegated as parallel writes; independent review may be read-only, but the primary implementer owns every planned file and the devlog coordinator role.

## Source Chain And Closure

```text
source evidence artifact
  -> source-dataset locator descriptor
  -> landing row validation
  -> source_dataset_landings history/current rotation
  -> maint/relation consumers (later phase)
```

This phase is complete when a no-database contract suite proves:

1. existing dataset rows receive non-null compatibility metadata;
2. a source identity may have many historical rows and at most one current row;
3. `item_groups_raw` accepts only `bootstrap_input` or `source_evidence`;
4. a `compat_export` cannot be inserted or promoted;
5. the same bootstrap manifest hash cannot be accepted twice;
6. no existing consumer relies on deleting the sole archived row or on the old unique key.

## File Structure

| File | Responsibility |
| --- | --- |
| `back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql` (create) | Exact formal-local DDL and compatibility backfill; never executed by this plan |
| `scripts/data/landing/source-dataset-landing-schema.mjs` (modify) | Dataset/artifact catalogs, validation, and create-table SQL authority |
| `scripts/data/landing/source-dataset-landing-schema.test.mjs` (modify) | Contract tests for required columns, generated current slot, indexes, and accepted values |
| `scripts/data/landing/import-source-dataset-landings.mjs` (modify) | Normalize artifact metadata, reject feedback/replay, and retain governed history |
| `scripts/data/landing/import-source-dataset-landings.test.mjs` (modify) | Executable importer behavior with injected connection calls |
| `scripts/data/landing/audit-source-dataset-landings.mjs` (modify) | Report current/history/artifact-role integrity without mutating data |
| `scripts/data/landing/audit-source-dataset-landings.test.mjs` (modify) | Audit query and summary contracts |
| `scripts/data/audit/cross-db-referential-integrity.mjs` (modify) | Join only the generated current slot and reject missing artifact identity for governed types |
| `scripts/data/audit/cross-db-referential-integrity.test.mjs` (modify) | Query-plan regression coverage |
| `scripts/data/audit/record-lineage-trace.mjs` (modify) | Surface artifact/producer/bootstrap identity in landing trace stages |
| `scripts/data/audit/record-lineage-trace.test.mjs` (modify) | Trace SQL regression coverage |
| `scripts/data/landing/source-dataset-landing-migration-contract.test.mjs` (create) | Parse and lock the V56 contract without connecting to MySQL |
| `docs/devlog/current.md` (modify at closeout) | Point to the next active group-chain phase |
| `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md` (modify at closeout) | Record result, validation, authorization boundary, and remaining phases |

## Contract Constants

Use these exact values in schema, importer, and tests:

```js
export const LANDING_ARTIFACT_ROLES = Object.freeze([
  'legacy_compat',
  'bootstrap_input',
  'source_evidence',
  'compat_export',
]);

export const GOVERNED_CANONICAL_DATASET_TYPES = Object.freeze([
  'item_groups_raw',
]);

export const LANDING_COMPATIBILITY_DEFAULTS = Object.freeze({
  artifactRole: 'legacy_compat',
  producerId: 'legacy.source-dataset-importer',
  producerVersion: 'pre-v56',
});

export function buildLegacyProducerRunKey(contentHash) {
  return `legacy-${String(contentHash ?? 'unknown').slice(0, 64)}`;
}
```

The metadata columns are generic and can support future canonical datasets without another shared-table ALTER. Only `item_groups_raw` is registered now. `npcs_base_raw` and `npc_crawler_facts_raw` remain deferred and are not accepted dataset types in this phase.

### Task 0: Checkpoint The Approved Execution Contract

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- Create: `docs/superpowers/plans/2026-07-27-b1-group-landing-foundation.md`

- [ ] **Step 1: Validate the documentation checkpoint**

Run:

```bash
git diff --check
rg -n "Phase 1A|V55|166205513|do not execute V56|System Owner" \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md \
  docs/superpowers/plans/2026-07-27-b1-group-landing-foundation.md
```

Expected: no whitespace errors; the V55 recovery evidence, approved Phase 1A handoff, and formal-write restrictions are all present.

- [ ] **Step 2: Commit only the documentation checkpoint**

Run `git status --short` and `git diff --cached --stat`, then stage only the three files above.

```bash
git add \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md \
  docs/superpowers/plans/2026-07-27-b1-group-landing-foundation.md
git commit -m "docs(data): checkpoint V55 recovery and landing plan"
```

Keep the parent devlog entry `active`; this commit fixes the execution contract before production-code work begins and does not close the group chain.

### Task 1: Lock The Landing Schema And V56 Bytes

**Files:**
- Create: `back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql`
- Modify: `scripts/data/landing/source-dataset-landing-schema.mjs`
- Modify: `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- Create: `scripts/data/landing/source-dataset-landing-migration-contract.test.mjs`

- [ ] **Step 1: Write failing schema-contract tests**

Add assertions that `LANDING_DATASET_TYPES` contains `item_groups_raw` but not the two deferred NPC types, the existing execution-plan dataset count changes from 15 to 16, artifact-role validation recognizes only the four constants, and generated SQL includes the exact new columns and key:

```js
assert.match(sql, /`artifact_role` VARCHAR\(32\) NOT NULL/);
assert.match(sql, /`producer_id` VARCHAR\(128\) NOT NULL/);
assert.match(sql, /`producer_version` VARCHAR\(64\) NOT NULL/);
assert.match(sql, /`producer_run_key` VARCHAR\(128\) NOT NULL/);
assert.match(sql, /`bootstrap_manifest_hash` CHAR\(64\) DEFAULT NULL/);
assert.match(sql, /`full_file_content_hash` CHAR\(64\) DEFAULT NULL/);
assert.match(sql, /`full_file_byte_size` BIGINT UNSIGNED DEFAULT NULL/);
assert.match(sql, /`source_page` VARCHAR\(255\) NOT NULL/);
assert.match(sql, /`current_slot` TINYINT GENERATED ALWAYS AS \(CASE WHEN `is_current` = 1 THEN 1 ELSE NULL END\) STORED/);
assert.match(sql, /UNIQUE KEY `uk_source_dataset_landings_current` \(`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`\)/);
assert.doesNotMatch(sql, /`source_page`, `is_current`\)/);
```

Add a V56 test that reads the migration and asserts it creates the pre-V56 table shape before altering it, drops the old key before adding the generated-slot key, backfills the four non-null identity fields before constraining them, and never contains `DELETE FROM source_dataset_landings`.

- [ ] **Step 2: Run the tests and verify the contract is red**

Run:

```bash
node --test \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/source-dataset-landing-migration-contract.test.mjs
```

Expected: FAIL because V56 and the new constants/columns do not exist.

- [ ] **Step 3: Extend the schema authority**

Add the constants above, `validateLandingArtifactRole`, and the seven columns to `buildSourceDatasetLandingCreateTableSql`. Put `current_slot` immediately after `is_current`; keep `is_current` because existing readers and rotation statements still use it.

The create-table definition must use:

```sql
`artifact_role` VARCHAR(32) NOT NULL,
`producer_id` VARCHAR(128) NOT NULL,
`producer_version` VARCHAR(64) NOT NULL,
`producer_run_key` VARCHAR(128) NOT NULL,
`bootstrap_manifest_hash` CHAR(64) DEFAULT NULL,
`full_file_content_hash` CHAR(64) DEFAULT NULL,
`full_file_byte_size` BIGINT UNSIGNED DEFAULT NULL,
`source_page` VARCHAR(255) NOT NULL,
`is_current` TINYINT(1) NOT NULL DEFAULT 1,
`current_slot` TINYINT GENERATED ALWAYS AS
  (CASE WHEN `is_current` = 1 THEN 1 ELSE NULL END) STORED
```

Add these indexes:

```sql
UNIQUE KEY `uk_source_dataset_landings_current`
  (`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`),
UNIQUE KEY `uk_source_dataset_landings_bootstrap_hash`
  (`dataset_type`, `provider`, `source_key`, `source_page`, `bootstrap_manifest_hash`),
KEY `idx_source_dataset_landings_artifact_role`
  (`dataset_type`, `artifact_role`, `is_current`)
```

MySQL permits multiple `NULL` values in both unique keys, which is required for history rows and non-bootstrap rows. The bootstrap key includes source identity because every row from one frozen bundle shares the same manifest hash; it rejects replay of one bundle/source pair without rejecting the other source rows in that bundle.

- [ ] **Step 4: Create the exact V56 migration**

The migration must first create the exact pre-V56 table shape when a clean Flyway database does not have the script-owned table. Use the current `buildSourceDatasetLandingCreateTableSql` DDL byte-for-byte before the new columns, wrapped in `CREATE TABLE IF NOT EXISTS`. Then perform additive/backfill/constrain/key-swap in this order:

```sql
ALTER TABLE `source_dataset_landings`
  ADD COLUMN `artifact_role` VARCHAR(32) NULL AFTER `parse_status`,
  ADD COLUMN `producer_id` VARCHAR(128) NULL AFTER `artifact_role`,
  ADD COLUMN `producer_version` VARCHAR(64) NULL AFTER `producer_id`,
  ADD COLUMN `producer_run_key` VARCHAR(128) NULL AFTER `producer_version`,
  ADD COLUMN `bootstrap_manifest_hash` CHAR(64) NULL AFTER `producer_run_key`,
  ADD COLUMN `full_file_content_hash` CHAR(64) NULL AFTER `bootstrap_manifest_hash`,
  ADD COLUMN `full_file_byte_size` BIGINT UNSIGNED NULL AFTER `full_file_content_hash`;

UPDATE `source_dataset_landings`
SET `artifact_role` = 'legacy_compat',
    `producer_id` = 'legacy.source-dataset-importer',
    `producer_version` = 'pre-v56',
    `producer_run_key` = CONCAT('legacy-', `id`),
    `source_page` = COALESCE(`source_page`, `source_key`)
WHERE `artifact_role` IS NULL
   OR `producer_id` IS NULL
   OR `producer_version` IS NULL
   OR `producer_run_key` IS NULL
   OR `source_page` IS NULL;

ALTER TABLE `source_dataset_landings`
  MODIFY COLUMN `artifact_role` VARCHAR(32) NOT NULL,
  MODIFY COLUMN `producer_id` VARCHAR(128) NOT NULL,
  MODIFY COLUMN `producer_version` VARCHAR(64) NOT NULL,
  MODIFY COLUMN `producer_run_key` VARCHAR(128) NOT NULL,
  MODIFY COLUMN `source_page` VARCHAR(255) NOT NULL,
  ADD COLUMN `current_slot` TINYINT GENERATED ALWAYS AS
    (CASE WHEN `is_current` = 1 THEN 1 ELSE NULL END) STORED AFTER `is_current`,
  DROP INDEX `uk_source_dataset_landings_current`,
  ADD UNIQUE KEY `uk_source_dataset_landings_current`
    (`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`),
  ADD UNIQUE KEY `uk_source_dataset_landings_bootstrap_hash`
    (`dataset_type`, `provider`, `source_key`, `source_page`, `bootstrap_manifest_hash`),
  ADD KEY `idx_source_dataset_landings_artifact_role`
    (`dataset_type`, `artifact_role`, `is_current`);
```

Do not add a schema-level enum/check for dataset type or artifact role; this repository supports compatibility inputs through application validation, and a closed SQL enum would turn future registration into another shared-table DDL.

- [ ] **Step 5: Run the focused schema tests**

Run the Step 2 command again.

Expected: PASS for the existing landing schema contract and the new V56 text contract. The separate V55 automation migration contract remains untouched.

- [ ] **Step 6: Commit the schema contract checkpoint**

Before committing, run `git status --short` and `git diff --cached --stat`, and stage only the four Task 1 files.

```bash
git add \
  back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql \
  scripts/data/landing/source-dataset-landing-schema.mjs \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/source-dataset-landing-migration-contract.test.mjs
git commit -m "feat(data): define canonical landing history contract"
```

### Task 2: Make Import Rotation Immutable And Fail Closed

**Files:**
- Modify: `scripts/data/landing/import-source-dataset-landings.mjs`
- Modify: `scripts/data/landing/import-source-dataset-landings.test.mjs`

- [ ] **Step 1: Add failing importer tests**

Use the existing injected connection fixture and add a `runGovernedImport` helper that captures `query`, `execute`, `beginTransaction`, `commit`, and `rollback` counts. Its `execute` dispatcher returns manifest rows for SQL containing `bootstrap_manifest_hash`, current rows for SQL containing `SELECT id, content_hash`, and an empty result for other selects. Add these exact assertions:

```js
const result = await runGovernedImport({ currentRows: [{ id: 41, source_page: 'groups' }] });
assert.equal(result.calls.filter(({ sql }) => sql.startsWith('DELETE FROM source_dataset_landings')).length, 0);
assert.equal(result.calls.filter(({ sql }) => sql.includes('SET is_current = 0')).length, 1);

const legacy = await runLegacyReplacement();
assert.equal(legacy.calls.filter(({ sql }) => sql.startsWith('DELETE FROM source_dataset_landings')).length, 1);

await assert.rejects(
  runGovernedImport({ entry: { artifactRole: 'compat_export' } }),
  /landing artifact contract rejected: artifactRole: compat_export cannot be imported/,
);

await assert.rejects(
  runGovernedImport({ entry: { producerId: null } }),
  /landing artifact contract rejected: producerId: required/,
);

await assert.rejects(
  runGovernedImport({ manifestRows: [{ id: 9 }] }),
  /landing artifact contract rejected: bootstrapManifestHash: already accepted for source identity/,
);

await assert.rejects(
  runGovernedImport({ entry: { artifactRole: 'source_evidence', bootstrapManifestHash: 'a'.repeat(64) } }),
  /landing artifact contract rejected: bootstrapManifestHash: forbidden for source_evidence/,
);
```

For every rejected case assert that no captured SQL starts with `INSERT INTO` or contains `SET is_current = 0`. The invalid role/field cases must also assert `beginTransaction === 0`; the replay case may perform its read-only manifest query but must not begin a transaction.

The governed happy-path fixture must include:

```js
{
  datasetType: 'item_groups_raw',
  artifactRole: 'bootstrap_input',
  producerId: 'bootstrap.item-groups',
  producerVersion: '1',
  producerRunKey: 'bootstrap-run-001',
  bootstrapManifestHash: 'a'.repeat(64),
  fullFileContentHash: 'b'.repeat(64),
  fullFileByteSize: 4950220,
}
```

- [ ] **Step 2: Run importer tests and verify red**

Run:

```bash
node --test scripts/data/landing/import-source-dataset-landings.test.mjs
```

Expected: FAIL on missing metadata behavior and the current archived-row deletion.

- [ ] **Step 3: Normalize and validate artifact identity before connection mutation**

Extend `buildLandingRow` with camelCase fields mapped to the seven new columns. Add a pure `validateLandingArtifactContract(row)` called before any `beginTransaction`, `execute`, or current-row rotation.

The validation matrix is exact:

| Dataset class | Allowed roles | Required identity |
| --- | --- | --- |
| Existing non-governed types | `legacy_compat`, `source_evidence` | missing legacy metadata is filled with the compatibility defaults and `buildLegacyProducerRunKey(contentHash)` |
| `item_groups_raw` | `bootstrap_input`, `source_evidence` | producer id/version/run key + full-file hash/size |
| Any type | never `compat_export` | reject before SQL |
| `bootstrap_input` | governed types only | 64-char bootstrap manifest hash |
| `source_evidence` | any accepted type | bootstrap manifest hash must be null |

Use errors in the form `landing artifact contract rejected: <field>: <reason>` and never echo payload bytes or credentials. Existing descriptors do not yet send artifact metadata; normalize them to `legacy_compat` before validation so this phase does not break the fifteen maintained dataset imports.

- [ ] **Step 4: Insert all metadata and preserve governed history**

Extend `insertLandingRow` and `updateLandingRow` parameter lists with the new identity fields. Replace unconditional `clearArchivedLandingRowForKey` with:

```js
function retainsImmutableHistory(datasetType) {
  return GOVERNED_CANONICAL_DATASET_TYPES.includes(datasetType);
}
```

For governed types, retirement only sets `is_current = 0`; it never deletes an archived row. Keep legacy cleanup unchanged for existing types in this phase so the migration does not expand retention volume outside approved scope.

Before rotation, query by `(dataset_type, provider, source_key, source_page, bootstrap_manifest_hash)` when the hash is non-null. If any row exists, reject the import even when that row is historical. The unique key is the final race guard, not the primary error path. This permits the four source rows in one frozen bootstrap bundle to share their manifest hash while preventing any one source identity from replaying it.

- [ ] **Step 5: Run importer and schema suites**

Run:

```bash
node --test \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/import-source-dataset-landings.test.mjs
```

Expected: PASS with explicit test counts and zero real database connections.

- [ ] **Step 6: Commit the importer checkpoint**

Stage only the two Task 2 files after status/staged-stat checks.

```bash
git add \
  scripts/data/landing/import-source-dataset-landings.mjs \
  scripts/data/landing/import-source-dataset-landings.test.mjs
git commit -m "fix(data): preserve governed landing history"
```

### Task 3: Align Read-Only Landing Consumers

**Files:**
- Modify: `scripts/data/landing/audit-source-dataset-landings.mjs`
- Modify: `scripts/data/landing/audit-source-dataset-landings.test.mjs`
- Modify: `scripts/data/audit/cross-db-referential-integrity.mjs`
- Modify: `scripts/data/audit/cross-db-referential-integrity.test.mjs`
- Modify: `scripts/data/audit/record-lineage-trace.mjs`
- Modify: `scripts/data/audit/record-lineage-trace.test.mjs`

- [ ] **Step 1: Add failing query-contract tests**

Require every current-row read to use `current_slot = 1`, not merely an unscoped landing join. Add audit summary cases for:

```js
{
  duplicateCurrentIdentityCount: 0,
  governedCurrentMissingIdentityCount: 0,
  governedCompatExportCount: 0,
  duplicateBootstrapManifestCount: 0,
}
```

Any non-zero count is blocking. Add lineage assertions for these selected aliases:

```sql
artifact_role AS artifactRole,
producer_id AS producerId,
producer_version AS producerVersion,
producer_run_key AS producerRunKey,
bootstrap_manifest_hash AS bootstrapManifestHash,
full_file_content_hash AS fullFileContentHash
```

- [ ] **Step 2: Run the three consumer test files and verify red**

Run:

```bash
node --test \
  scripts/data/landing/audit-source-dataset-landings.test.mjs \
  scripts/data/audit/cross-db-referential-integrity.test.mjs \
  scripts/data/audit/record-lineage-trace.test.mjs
```

Expected: FAIL because the current queries do not expose or validate the artifact identity.

- [ ] **Step 3: Update current-row joins and audit checks**

Change current-row predicates from `is_current = 1` to `current_slot = 1` in these three consumers. Keep `is_current` in output where operators need to distinguish history. Correct both `cross-db-referential-integrity.mjs` and `record-lineage-trace.mjs` so their landing database default is `terria_v1_local`, matching the current spec and landing importer; update each `parseArgs([])` assertion for that exact default while keeping `maintDatabase = 'terria_v1_maint'`.

Add four read-only integrity queries to the landing audit:

```sql
SELECT COUNT(*) AS total FROM (SELECT dataset_type, provider, source_key, source_page FROM source_dataset_landings WHERE current_slot = 1 GROUP BY dataset_type, provider, source_key, source_page HAVING COUNT(*) > 1) duplicate_currents;
SELECT COUNT(*) AS total FROM source_dataset_landings WHERE dataset_type = 'item_groups_raw' AND current_slot = 1 AND (artifact_role IS NULL OR producer_id IS NULL OR producer_version IS NULL OR producer_run_key IS NULL OR full_file_content_hash IS NULL OR full_file_byte_size IS NULL);
SELECT COUNT(*) AS total FROM source_dataset_landings WHERE dataset_type = 'item_groups_raw' AND artifact_role = 'compat_export';
SELECT COUNT(*) AS total FROM (SELECT dataset_type, provider, source_key, source_page, bootstrap_manifest_hash FROM source_dataset_landings WHERE bootstrap_manifest_hash IS NOT NULL GROUP BY dataset_type, provider, source_key, source_page, bootstrap_manifest_hash HAVING COUNT(*) > 1) duplicate_bootstraps;
```

Tests must assert the final duplicate-bootstrap query returns one numeric row and does not classify different source keys from the same bundle as duplicates.

- [ ] **Step 4: Surface landing identity in trace output**

Update item and NPC landing trace stages to select the six aliases above. Do not add writes or fallback behavior. A missing governed identity stays visible as missing evidence and is handled by the integrity audit.

- [ ] **Step 5: Run all affected landing and audit tests**

Run:

```bash
node --test \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/import-source-dataset-landings.test.mjs \
  scripts/data/landing/audit-source-dataset-landings.test.mjs \
  scripts/data/audit/cross-db-referential-integrity.test.mjs \
  scripts/data/audit/record-lineage-trace.test.mjs
```

Expected: PASS; all connection behavior remains injected or query-plan-only.

- [ ] **Step 6: Commit the consumer checkpoint**

Stage only the six Task 3 files after status/staged-stat checks.

```bash
git add \
  scripts/data/landing/audit-source-dataset-landings.mjs \
  scripts/data/landing/audit-source-dataset-landings.test.mjs \
  scripts/data/audit/cross-db-referential-integrity.mjs \
  scripts/data/audit/cross-db-referential-integrity.test.mjs \
  scripts/data/audit/record-lineage-trace.mjs \
  scripts/data/audit/record-lineage-trace.test.mjs
git commit -m "fix(audit): trace canonical landing identity"
```

### Task 4: Prove The Phase Without A Database

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`

- [ ] **Step 1: Run the complete no-database phase suite**

Run:

```bash
node --test \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/import-source-dataset-landings.test.mjs \
  scripts/data/landing/audit-source-dataset-landings.test.mjs \
  scripts/data/audit/cross-db-referential-integrity.test.mjs \
  scripts/data/audit/record-lineage-trace.test.mjs \
  scripts/data/landing/source-dataset-landing-migration-contract.test.mjs
```

Expected: all tests pass with zero MySQL connection attempt.

- [ ] **Step 2: Run targeted forbidden-boundary scans**

Run:

```bash
rg -n "DELETE FROM source_dataset_landings" \
  back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql \
  scripts/data/landing/import-source-dataset-landings.mjs

rg -n "compat_export|bootstrap_manifest_hash|current_slot" \
  scripts/data/landing \
  scripts/data/audit/cross-db-referential-integrity.mjs \
  scripts/data/audit/record-lineage-trace.mjs
```

Expected: the first scan returns no V56 match and only the explicitly retained legacy cleanup statement in the importer; the second scan shows validation and current-row usage in every planned surface.

- [ ] **Step 3: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short
git diff --cached --stat
```

Expected: no whitespace errors; only this phase and the already-related V55/devlog continuation files are dirty; no unrelated path is staged.

- [ ] **Step 4: Update the active devlog**

Record:

- the exact commits and test counts;
- that V56 exists but was not executed;
- that formal schema apply, bootstrap, T1, T2, crawler, import, backfill, and cutover remain unrun;
- that the next plan is Phase 1B: maint/relation canonical group model, reconciliation, and ownership predicates;
- that the System Owner bootstrap decision remains independent and unresolved.

- [ ] **Step 5: Commit the phase closeout**

After re-reading `docs/devlog/current.md` and the active entry, stage the two devlog files explicitly and run the required status/staged-stat checks.

```bash
git add \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md
git commit -m "docs(devlog): record landing foundation checkpoint"
```

Do not mark the parent entry `ready-for-commit` or `closed`; the group canonical chain and formal authorization checkpoints remain active.

## Plan Repair Rule

If implementation discovers that the formal `source_dataset_landings` table differs from the schema authority, stop before changing V56. Capture a read-only `SHOW CREATE TABLE` result, repair this plan and its migration contract, self-review the affected schema/importer gates, then continue. Do not run DDL to make the database resemble the plan.

If a focused test exposes behavior outside these files, add only the smallest directly required consumer to this plan and record the scope change in the active devlog. Runtime/admin consumer migration belongs to Phase 2 and must not be pulled into this phase.

## Later Plans

The approved design still requires these independently executable plans:

1. **Phase 1B:** maint/relation canonical group tables, bootstrap parser/reconciliation, member resolution, exclusion rules, source-layer ownership predicates, and no-database/T0 contracts.
2. **Phase 2:** backend/admin read/write cutover, recipe expansion consumer, shadow parity, blocked-group preservation, and compatibility exporters.
3. **Phase 3:** capability 19 -> 21 registration, T1 verification, exact-bundle formal DDL/bootstrap authorization, T2 read-only smoke, per-input contract flip, and full gate. Every formal mutation in Phase 3 is a separate stop-and-authorize checkpoint.

## Self-Review Verdict

- **Status:** Execution-ready for the no-database Phase 1A scope.
- **Goal lock:** Closure is the six landing-history and feedback-loop contracts under Source Chain And Closure; runtime/admin cutover is explicitly excluded.
- **Source-chain lock:** The plan covers descriptor -> validation -> landing rotation -> existing audit/trace consumers and names the later maint/relation handoff.
- **Boundary lock:** V56 is created and parsed but not executed; crawler, import, backfill, bootstrap, T1, T2, restart, push, and merge remain outside this phase.
- **Evidence lock:** Tasks run the schema, importer, landing audit, cross-database query-plan, lineage trace, and migration parser suites, followed by forbidden-boundary scans and `git diff --check`.
- **Execution continuity:** Schema drift repairs the plan before DDL changes; directly affected consumers may be added only with a recorded scope change.
- **Ownership:** One serial implementer owns the shared contract; no parallel write split is safe.
- **Critical defects:** None after self-review.
- **Important defects:** None after correcting bootstrap replay identity, clean-schema migration ordering, nullable source-page uniqueness, deferred NPC registration, and landing-database defaults.
- **Residual risk:** V56 SQL is not executed against MySQL in this phase. Phase 1B must add an authorized disposable T0 schema smoke before the group chain can claim executable schema readiness; formal T2 execution remains a later exact-bundle authorization.
