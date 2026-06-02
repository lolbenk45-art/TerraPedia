# Biome Wikitext Resolved Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import only the uniquely resolved biome wikitext relations from `reports/biome-wikitext-linkage-dry-run-2026-06-02.json` into local DB tables without writing ambiguous or missing matches.

**Architecture:** Keep the Wiki crawler/linkage step separate from DB mutation. A new import script reads the existing dry-run report, validates `resolvedOnly`, resolves current DB IDs by `biomes.code`, `items.internal_name`, and `npcs.internal_name`, then writes only deterministic rows in `--apply` mode. Item relations use existing tables; NPC-to-biome rows get a small dedicated `npc_biomes` table so NPC spawn/appearance data is not forced into `biome_resources`.

**Tech Stack:** Node.js ESM scripts, MySQL via existing project dependency pattern, Flyway SQL migration, `node:test`, TerraPedia local database `terria_v1_local`.

---

## Scope

In scope:

- Source report: `reports/biome-wikitext-linkage-dry-run-2026-06-02.json`.
- Candidate set: `resolvedOnly.itemBiomeCandidates` and `resolvedOnly.npcBiomeCandidates` only.
- DB target: `terria_v1_local` by default.
- Item targets:
  - `biome_resources`
  - `item_biomes`
  - `item_acquisition_sources`
- NPC target:
  - new table `npc_biomes`
- Import safety:
  - default `--dry-run`
  - explicit `--apply` required for writes
  - refuse non-`terria_v1_local` unless `--allow-non-primary-db=true`

Out of scope:

- Ambiguous and missing report entries.
- New crawler work.
- Full corpus biome crawl.
- UI/API changes.
- Alias, set expansion, or NPC variant grouping rules.

## Data Mapping

### Item Candidates

Input row:

```json
{
  "biomeCode": "forest",
  "itemInternalName": "TatteredCloth",
  "itemName": "Tattered Cloth",
  "relationType": "drop",
  "source": "From Goblin Scouts",
  "note": null,
  "sourcePage": "Forest"
}
```

Lookup:

- `biomes.id` by `biomes.code = biomeCode`
- `items.id` by `items.internal_name = itemInternalName`

Write rules:

- `biome_resources`
  - `biome_id`
  - `item_id`
  - `resource_name_raw = itemName`
  - `resource_type = relationType`
  - `notes = source + optional note`
  - `sort_order = candidate index + 1`
- `item_biomes`
  - `item_id`
  - `biome_id`
  - `relation_type = relationType`
  - `notes = source + optional note`
  - `sort_order = candidate index + 1`
- `item_acquisition_sources`
  - `item_id`
  - `source_type = relationType`
  - `source_ref_type = 'biome_wikitext'`
  - `source_ref_name = source`
  - `biome_id`
  - `notes = note`
  - `source_provider = 'terraria.wiki.gg'`
  - `source_page = sourcePage`
  - `sort_order = candidate index + 1`

### NPC Candidates

Input row:

```json
{
  "biomeCode": "forest",
  "npcInternalName": "GreenSlime",
  "npcName": "Green Slime",
  "source": "During the day",
  "note": null,
  "sourcePage": "Forest"
}
```

Lookup:

- `biomes.id` by `biomes.code = biomeCode`
- `npcs.id` by `npcs.internal_name = npcInternalName`

Write rules:

- `npc_biomes`
  - `npc_id`
  - `biome_id`
  - `relation_type = 'appears_in'`
  - `spawn_context = source`
  - `notes = note`
  - `source_provider = 'terraria.wiki.gg'`
  - `source_page = sourcePage`
  - `sort_order = candidate index + 1`

## Task 1: Add NPC Biome Migration

**Files:**
- Create: `back/src/main/resources/db/migration/V48__create_npc_biomes.sql`

- [ ] **Step 1: Create migration**

```sql
CREATE TABLE IF NOT EXISTS `npc_biomes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `npc_id` BIGINT NOT NULL,
  `biome_id` BIGINT NOT NULL,
  `relation_type` VARCHAR(32) NOT NULL DEFAULT 'appears_in',
  `spawn_context` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_npc_biomes_relation` (`npc_id`, `biome_id`, `relation_type`, `spawn_context`),
  INDEX `idx_npc_biomes_npc_id` (`npc_id`),
  INDEX `idx_npc_biomes_biome_id` (`biome_id`),
  INDEX `idx_npc_biomes_source_page` (`source_page`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Verify migration syntax is loadable**

Run:

```bash
rg -n "CREATE TABLE IF NOT EXISTS `npc_biomes`|uk_npc_biomes_relation" back/src/main/resources/db/migration/V48__create_npc_biomes.sql
```

Expected: both patterns are found.

## Task 2: Add Import Script Tests

**Files:**
- Create: `scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs`

- [ ] **Step 1: Write tests for plan building**

Create tests that import these functions from `scripts/data/import/import-biome-wikitext-resolved-to-db.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBiomeWikitextResolvedImportPlan,
  buildItemInsertRows,
  buildNpcInsertRows,
  assertPrimaryDb
} from './import-biome-wikitext-resolved-to-db.mjs';

test('buildBiomeWikitextResolvedImportPlan uses only resolvedOnly candidates', () => {
  const report = {
    resolvedOnly: {
      itemBiomeCandidates: [
        { biomeCode: 'forest', itemInternalName: 'TatteredCloth', itemName: 'Tattered Cloth', relationType: 'drop', source: 'From Goblin Scouts', note: null, sourcePage: 'Forest' }
      ],
      npcBiomeCandidates: [
        { biomeCode: 'forest', npcInternalName: 'GreenSlime', npcName: 'Green Slime', source: 'During the day', note: null, sourcePage: 'Forest' }
      ]
    },
    results: [
      { entries: [{ matchStatus: 'ambiguous', name: 'Zombie' }] }
    ]
  };

  const plan = buildBiomeWikitextResolvedImportPlan({ report });

  assert.equal(plan.summary.itemCandidates.input, 1);
  assert.equal(plan.summary.npcCandidates.input, 1);
  assert.equal(plan.itemCandidates[0].itemInternalName, 'TatteredCloth');
  assert.equal(plan.npcCandidates[0].npcInternalName, 'GreenSlime');
});

test('buildItemInsertRows resolves biome and item IDs and skips unresolved rows', () => {
  const plan = buildBiomeWikitextResolvedImportPlan({
    report: {
      resolvedOnly: {
        itemBiomeCandidates: [
          { biomeCode: 'forest', itemInternalName: 'TatteredCloth', itemName: 'Tattered Cloth', relationType: 'drop', source: 'From Goblin Scouts', note: null, sourcePage: 'Forest' },
          { biomeCode: 'forest', itemInternalName: 'MissingItem', itemName: 'Missing Item', relationType: 'drop', source: 'From Missing', note: null, sourcePage: 'Forest' }
        ],
        npcBiomeCandidates: []
      }
    }
  });
  const rows = buildItemInsertRows({
    candidates: plan.itemCandidates,
    biomeByCode: new Map([['forest', 10]]),
    itemByInternalName: new Map([['tatteredcloth', 20]])
  });

  assert.equal(rows.valid.length, 1);
  assert.equal(rows.skipped.length, 1);
  assert.equal(rows.valid[0].biomeId, 10);
  assert.equal(rows.valid[0].itemId, 20);
});

test('buildNpcInsertRows resolves biome and npc IDs and skips unresolved rows', () => {
  const plan = buildBiomeWikitextResolvedImportPlan({
    report: {
      resolvedOnly: {
        itemBiomeCandidates: [],
        npcBiomeCandidates: [
          { biomeCode: 'forest', npcInternalName: 'GreenSlime', npcName: 'Green Slime', source: 'During the day', note: null, sourcePage: 'Forest' },
          { biomeCode: 'forest', npcInternalName: 'MissingNpc', npcName: 'Missing NPC', source: 'During the day', note: null, sourcePage: 'Forest' }
        ]
      }
    }
  });
  const rows = buildNpcInsertRows({
    candidates: plan.npcCandidates,
    biomeByCode: new Map([['forest', 10]]),
    npcByInternalName: new Map([['greenslime', 30]])
  });

  assert.equal(rows.valid.length, 1);
  assert.equal(rows.skipped.length, 1);
  assert.equal(rows.valid[0].npcId, 30);
});

test('assertPrimaryDb refuses non-primary database unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_local', false));
  assert.throws(() => assertPrimaryDb('terria_v1_maint', false), /Refusing to write to non-primary database/);
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs
```

Expected: FAIL because `import-biome-wikitext-resolved-to-db.mjs` does not exist yet.

## Task 3: Implement Read-Only Plan Builder

**Files:**
- Create: `scripts/data/import/import-biome-wikitext-resolved-to-db.mjs`

- [ ] **Step 1: Add exported helpers**

Implement:

```js
export function buildBiomeWikitextResolvedImportPlan({ report }) {
  const itemCandidates = Array.isArray(report?.resolvedOnly?.itemBiomeCandidates)
    ? report.resolvedOnly.itemBiomeCandidates
    : [];
  const npcCandidates = Array.isArray(report?.resolvedOnly?.npcBiomeCandidates)
    ? report.resolvedOnly.npcBiomeCandidates
    : [];
  return {
    generatedAt: new Date().toISOString(),
    itemCandidates,
    npcCandidates,
    summary: {
      itemCandidates: { input: itemCandidates.length, valid: 0, skipped: 0 },
      npcCandidates: { input: npcCandidates.length, valid: 0, skipped: 0 }
    }
  };
}
```

Implement `buildItemInsertRows`, `buildNpcInsertRows`, `assertPrimaryDb`, `normalizeKey`, and `joinNotes`.

- [ ] **Step 2: Run tests**

Run:

```bash
node --test scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs
```

Expected: PASS.

## Task 4: Implement DB Lookup And Dry-Run CLI

**Files:**
- Modify: `scripts/data/import/import-biome-wikitext-resolved-to-db.mjs`

- [ ] **Step 1: Add CLI arguments**

Support:

```text
--report=reports/biome-wikitext-linkage-dry-run-2026-06-02.json
--output-report=reports/biome-wikitext-resolved-import-plan-2026-06-02.json
--apply=false
--allow-non-primary-db=false
```

Default behavior must be dry-run.

- [ ] **Step 2: Add DB lookups**

Use the same MySQL dependency style as `scripts/data/import/import-biomes-to-db.mjs`.

Queries:

```sql
SELECT id, code FROM biomes WHERE deleted = 0;
SELECT id, internal_name FROM items WHERE deleted = 0 AND status = 1;
SELECT id, internal_name FROM npcs WHERE status = 1;
```

- [ ] **Step 3: Dry-run output**

The dry-run report must include:

```json
{
  "entity": "biome_wikitext_resolved_import_plan",
  "mode": "dry-run",
  "summary": {
    "itemCandidates": { "input": 224, "valid": 224, "skipped": 0 },
    "npcCandidates": { "input": 75, "valid": 75, "skipped": 0 }
  },
  "skipped": {
    "items": [],
    "npcs": []
  }
}
```

- [ ] **Step 4: Run dry-run**

Run:

```bash
node scripts/data/import/import-biome-wikitext-resolved-to-db.mjs \
  --report=reports/biome-wikitext-linkage-dry-run-2026-06-02.json \
  --output-report=reports/biome-wikitext-resolved-import-plan-2026-06-02.json
```

Expected:

- Exit code 0.
- No DB writes.
- Output report exists.
- Valid counts equal resolved-only counts unless current DB is missing rows.

## Task 5: Implement Apply Writes

**Files:**
- Modify: `scripts/data/import/import-biome-wikitext-resolved-to-db.mjs`

- [ ] **Step 1: Add transaction**

In `--apply=true` mode:

```js
await conn.beginTransaction();
try {
  await upsertItemRows(conn, itemRows.valid);
  await upsertNpcRows(conn, npcRows.valid);
  await conn.commit();
} catch (error) {
  await conn.rollback();
  throw error;
}
```

- [ ] **Step 2: Add item upserts**

Use parameterized SQL.

`biome_resources`:

```sql
INSERT INTO biome_resources (biome_id, item_id, resource_name_raw, resource_type, notes, sort_order)
VALUES (?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), updated_at = NOW()
```

Because `biome_resources` currently has no unique key, first query by `(biome_id, item_id, resource_name_raw, resource_type)` and update existing row if found; otherwise insert.

`item_biomes`:

```sql
INSERT INTO item_biomes (item_id, biome_id, relation_type, notes, sort_order)
VALUES (?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), updated_at = NOW()
```

`item_acquisition_sources`:

Query existing by `(item_id, source_type, source_ref_type, source_ref_name, biome_id, source_page)` and update if found; otherwise insert.

- [ ] **Step 3: Add npc upserts**

`npc_biomes`:

```sql
INSERT INTO npc_biomes (npc_id, biome_id, relation_type, spawn_context, notes, source_provider, source_page, sort_order, status, deleted)
VALUES (?, ?, 'appears_in', ?, ?, 'terraria.wiki.gg', ?, ?, 1, 0)
ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), status = 1, deleted = 0, updated_at = NOW()
```

- [ ] **Step 4: Add apply smoke command**

Run only after dry-run shows expected valid/skipped counts:

```bash
node scripts/data/import/import-biome-wikitext-resolved-to-db.mjs \
  --report=reports/biome-wikitext-linkage-dry-run-2026-06-02.json \
  --output-report=reports/biome-wikitext-resolved-import-apply-2026-06-02.json \
  --apply=true
```

Expected:

- Exit code 0.
- Apply report includes created/updated counts.
- No ambiguous/missing rows are written.

## Task 6: Add Post-Apply Verification

**Files:**
- Create or modify: `scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs`
- Use direct SQL manually after apply.

- [ ] **Step 1: Run count checks**

```sql
SELECT COUNT(*) AS total
FROM item_biomes ib
JOIN biomes b ON b.id = ib.biome_id
WHERE b.code IN ('forest', 'desert', 'jungle', 'underworld', 'snow')
  AND ib.relation_type IN ('drop', 'resource', 'fishing', 'for_sale');
```

Expected: at least `224` unless existing duplicates collapse rows.

```sql
SELECT COUNT(*) AS total
FROM npc_biomes nb
JOIN biomes b ON b.id = nb.biome_id
WHERE b.code IN ('forest', 'desert', 'jungle', 'underworld', 'snow')
  AND nb.relation_type = 'appears_in';
```

Expected: `75`.

- [ ] **Step 2: Run sample checks**

```sql
SELECT b.code, i.internal_name, br.resource_type, br.notes
FROM biome_resources br
JOIN biomes b ON b.id = br.biome_id
JOIN items i ON i.id = br.item_id
WHERE b.code = 'forest' AND i.internal_name IN ('TatteredCloth', 'SlimeStaff');
```

Expected: rows for `TatteredCloth` and `SlimeStaff`.

```sql
SELECT b.code, n.internal_name, nb.spawn_context
FROM npc_biomes nb
JOIN biomes b ON b.id = nb.biome_id
JOIN npcs n ON n.id = nb.npc_id
WHERE b.code = 'forest' AND n.internal_name IN ('GreenSlime', 'KingSlime');
```

Expected: rows for `GreenSlime` and `KingSlime`.

## Final Validation

Run:

```bash
node --test scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs
node --test scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs
node scripts/data/import/import-biome-wikitext-resolved-to-db.mjs --report=reports/biome-wikitext-linkage-dry-run-2026-06-02.json --output-report=reports/biome-wikitext-resolved-import-plan-2026-06-02.json
```

Expected:

- Tests pass.
- Dry-run report exists.
- Dry-run report counts match `resolvedOnly` or explicitly lists skipped DB lookup misses.
- No DB writes occur without `--apply=true`.

## Plan Audit

**Verdict:** Execution-ready after confirming the local DB has the `V48__create_npc_biomes.sql` migration applied before `--apply=true`.

**Main goal:** Import only deterministic biome wikitext relations from the existing report.

**Closure definition:** `resolvedOnly` item and NPC candidate counts are represented in DB target tables, with skipped rows explicitly reported and no ambiguous/missing rows written.

**Blocking defects:** None in the plan.

**Important constraints:**

- Do not run `--apply=true` until dry-run counts are reviewed.
- Do not write ambiguous/missing entries.
- Do not run crawler commands as part of this import.
- Do not modify audio asset files or unrelated dirty worktree files.

**Residual risk:**

- Existing `biomes` may not contain `underworld` if the DB was loaded from an older 7-biome standardized file. Dry-run must report this as skipped before apply.
- `biome_resources` has no unique key, so the script must query before insert to avoid duplicates.
- UI/API consumers will not show `npc_biomes` until a later frontend/backend consumption task adds it.
