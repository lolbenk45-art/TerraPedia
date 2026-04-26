# Maint Item Relation Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated `terria_v1_relation` processing database and scripts that derive auditable item relations from `terria_v1_maint` without writing to `terria_v1_local` or mutating existing maint snapshot tables.

**Architecture:** Add a new `scripts/data/relation/` pipeline with small modules for schema, trace utilities, category derivation, recipe canonicalization, item source/NPC candidate extraction, buff/biome/projectile audits, persistence, and report output. The pipeline reads `terria_v1_maint`, optionally compares read-only against `terria_v1_local`, writes only to `terria_v1_relation` when `--apply=true`, and always emits JSON/Markdown audit reports.

**Tech Stack:** Node.js ESM, mysql2/promise, Node test runner, MySQL 8-compatible SQL, PowerShell execution

---

## File Structure

### Create

- `scripts/data/relation/relation-schema.mjs`
  - Builds SQL for the isolated relation database tables.
  - Exports `RELATION_TABLE_NAMES`, `RELATION_DATABASE_NAME`, and `buildRelationSchemaSql()`.

- `scripts/data/relation/relation-schema.test.mjs`
  - Verifies every required table is present and core trace/status columns exist.

- `scripts/data/relation/relation-trace.mjs`
  - Provides deterministic `record_key` hashing, source trace normalization, status constants, confidence helpers, and item identity helpers.

- `scripts/data/relation/relation-trace.test.mjs`
  - Verifies hashing stability, source trace shape, and item identity resolution behavior.

- `scripts/data/relation/category-relation-processor.mjs`
  - Converts `maint_categories + maint_item_categories` rows into `category_nodes` and `item_category_assignments`.

- `scripts/data/relation/category-relation-processor.test.mjs`
  - Verifies group node marking, multi-category assignments, primary assignment selection, and unmatched item handling.

- `scripts/data/relation/recipe-relation-processor.mjs`
  - Merges `maint_item_recipes`, `maint_item_page_recipes`, and `maint_recipe_page_recipes` into canonical recipe heads, ingredients, and stations.

- `scripts/data/relation/recipe-relation-processor.test.mjs`
  - Verifies canonical recipe keys, version-scope preservation, ingredient/station unresolved behavior, and duplicate source trace preservation.

- `scripts/data/relation/item-source-relation-processor.mjs`
  - Converts `maint_item_sources` into source facts/details and splits NPC shop/loot candidates only after entity resolution.

- `scripts/data/relation/item-source-relation-processor.test.mjs`
  - Verifies `source_ref_type='npc'` is not trusted without matching, text pollution handling, drop/shop split, quantity/chance extraction from raw JSON, and low-confidence reason output.

- `scripts/data/relation/secondary-relation-processor.mjs`
  - Produces buff relations, biome relations, image coverage metrics, and projectile audit rows for first-stage processing.

- `scripts/data/relation/secondary-relation-processor.test.mjs`
  - Verifies buff comparison with local source items, biome comparison with local item biomes, image coverage output, and projectile audit non-final behavior.

- `scripts/data/relation/relation-report.mjs`
  - Writes JSON and Markdown reports under `reports/relation/`.

- `scripts/data/relation/relation-report.test.mjs`
  - Verifies report paths, Markdown section presence, domain counts, unresolved/conflict counts, and sample evidence formatting.

- `scripts/data/relation/sync-maint-to-relation.mjs`
  - Main CLI entrypoint. Reads maint/local, derives relation rows, writes to `terria_v1_relation` only when `--apply=true`, and always writes reports.

- `scripts/data/relation/sync-maint-to-relation.test.mjs`
  - Verifies args parsing, dry-run no writes, database target isolation, summary aggregation, and writer call ordering.

### Modify

- `docs/superpowers/specs/2026-04-23-maint-item-relation-domain-design.md`
  - Add a short implementation status link after plan execution begins.

- `docs/superpowers/plans/2026-04-23-maint-item-relation-domain.md`
  - Track task progress with checkboxes.

### Do Not Modify In This Plan

- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/maint-schema.mjs`
- `back/`
- `front/`
- `data-query-app/`
- `terria_v1_local` data
- `terria_v1_maint` data, except read-only SELECTs

---

## Task 1: Add Relation Schema Module

**Files:**
- Create: `scripts/data/relation/relation-schema.mjs`
- Create: `scripts/data/relation/relation-schema.test.mjs`

- [ ] **Step 1: Write failing schema table-name test**

Create `scripts/data/relation/relation-schema.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RELATION_DATABASE_NAME,
  RELATION_TABLE_NAMES,
  buildRelationSchemaSql,
} from './relation-schema.mjs';

test('relation schema targets isolated processing database', () => {
  assert.equal(RELATION_DATABASE_NAME, 'terria_v1_relation');
});

test('relation schema declares all first-stage tables', () => {
  assert.deepEqual(RELATION_TABLE_NAMES, [
    'relation_runs',
    'relation_run_reports',
    'category_nodes',
    'item_category_assignments',
    'item_recipe_heads',
    'item_recipe_ingredients',
    'item_recipe_stations',
    'item_source_facts',
    'item_source_details',
    'item_npc_shop_candidates',
    'item_npc_loot_candidates',
    'item_buff_relations',
    'item_biome_relations',
    'item_projectile_audits',
  ]);
});

test('relation schema SQL includes trace, status, and confidence columns', () => {
  const sql = buildRelationSchemaSql();
  for (const tableName of RELATION_TABLE_NAMES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS \\\`${tableName}\\\``));
  }
  assert.match(sql, /`source_maint_table` VARCHAR\(128\)/);
  assert.match(sql, /`source_maint_record_key` CHAR\(64\)/);
  assert.match(sql, /`landing_source_id` BIGINT/);
  assert.match(sql, /`confidence` DECIMAL\(5,4\)/);
  assert.match(sql, /`review_status` VARCHAR\(64\)/);
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run:

```powershell
node --test scripts/data/relation/relation-schema.test.mjs
```

Expected:

```text
FAIL
Cannot find module
```

- [ ] **Step 3: Create schema module**

Create `scripts/data/relation/relation-schema.mjs` with:

```js
export const RELATION_DATABASE_NAME = 'terria_v1_relation';

export const RELATION_TABLE_NAMES = [
  'relation_runs',
  'relation_run_reports',
  'category_nodes',
  'item_category_assignments',
  'item_recipe_heads',
  'item_recipe_ingredients',
  'item_recipe_stations',
  'item_source_facts',
  'item_source_details',
  'item_npc_shop_candidates',
  'item_npc_loot_candidates',
  'item_buff_relations',
  'item_biome_relations',
  'item_projectile_audits',
];

const TRACE_COLUMNS = `
  \`source_maint_table\` VARCHAR(128) DEFAULT NULL,
  \`source_maint_record_key\` CHAR(64) DEFAULT NULL,
  \`source_maint_id\` BIGINT DEFAULT NULL,
  \`landing_source_id\` BIGINT DEFAULT NULL,
  \`landing_source_key\` VARCHAR(255) DEFAULT NULL,
  \`landing_content_hash\` CHAR(64) DEFAULT NULL,
  \`source_provider\` VARCHAR(128) DEFAULT NULL,
  \`source_page\` VARCHAR(255) DEFAULT NULL,
  \`source_revision_timestamp\` DATETIME DEFAULT NULL
`;

const AUDIT_COLUMNS = `
  \`confidence\` DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  \`reason\` VARCHAR(255) DEFAULT NULL,
  \`review_status\` VARCHAR(64) NOT NULL DEFAULT 'accepted',
  \`raw_json\` LONGTEXT DEFAULT NULL,
  \`status\` INT NOT NULL DEFAULT 1,
  \`deleted\` TINYINT NOT NULL DEFAULT 0,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
`;

export function buildRelationSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS \`relation_runs\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`run_key\` CHAR(64) NOT NULL,
  \`apply_mode\` TINYINT(1) NOT NULL DEFAULT 0,
  \`maint_database\` VARCHAR(128) NOT NULL,
  \`local_database\` VARCHAR(128) DEFAULT NULL,
  \`relation_database\` VARCHAR(128) NOT NULL,
  \`scopes_json\` LONGTEXT NOT NULL,
  \`summary_json\` LONGTEXT DEFAULT NULL,
  \`started_at\` DATETIME NOT NULL,
  \`finished_at\` DATETIME DEFAULT NULL,
  \`status\` VARCHAR(64) NOT NULL DEFAULT 'running',
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_relation_runs_run_key\` (\`run_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`relation_run_reports\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`run_key\` CHAR(64) NOT NULL,
  \`report_kind\` VARCHAR(64) NOT NULL,
  \`report_path\` VARCHAR(1000) NOT NULL,
  \`report_format\` VARCHAR(32) NOT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_relation_run_reports_run_key\` (\`run_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`category_nodes\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`node_key\` VARCHAR(1000) NOT NULL,
  \`parent_node_key\` VARCHAR(1000) DEFAULT NULL,
  \`top_level\` VARCHAR(255) DEFAULT NULL,
  \`section_title\` VARCHAR(255) DEFAULT NULL,
  \`group_name\` VARCHAR(255) DEFAULT NULL,
  \`node_name\` VARCHAR(255) NOT NULL,
  \`path_text\` VARCHAR(1000) NOT NULL,
  \`depth\` INT NOT NULL DEFAULT 0,
  \`is_group_node\` TINYINT(1) NOT NULL DEFAULT 0,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_category_nodes_record_key\` (\`record_key\`),
  KEY \`idx_category_nodes_node_key\` (\`node_key\`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_category_assignments\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`item_source_id\` INT DEFAULT NULL,
  \`item_internal_name\` VARCHAR(255) NOT NULL,
  \`item_name\` VARCHAR(255) DEFAULT NULL,
  \`category_node_key\` VARCHAR(1000) NOT NULL,
  \`category_path_text\` VARCHAR(1000) NOT NULL,
  \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0,
  \`assignment_reason\` VARCHAR(255) NOT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_category_assignments_record_key\` (\`record_key\`),
  KEY \`idx_item_category_assignments_item\` (\`item_internal_name\`),
  KEY \`idx_item_category_assignments_node\` (\`category_node_key\`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_recipe_heads\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`recipe_key\` CHAR(64) NOT NULL,
  \`result_item_source_id\` INT DEFAULT NULL,
  \`result_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`result_name\` VARCHAR(255) DEFAULT NULL,
  \`result_quantity\` INT DEFAULT NULL,
  \`version_scope\` VARCHAR(255) DEFAULT NULL,
  \`source_count\` INT NOT NULL DEFAULT 1,
  \`sources_json\` LONGTEXT NOT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_recipe_heads_record_key\` (\`record_key\`),
  KEY \`idx_item_recipe_heads_recipe_key\` (\`recipe_key\`),
  KEY \`idx_item_recipe_heads_result\` (\`result_internal_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_recipe_ingredients\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`recipe_key\` CHAR(64) NOT NULL,
  \`ingredient_item_source_id\` INT DEFAULT NULL,
  \`ingredient_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`ingredient_name_raw\` VARCHAR(255) DEFAULT NULL,
  \`ingredient_group_type\` VARCHAR(64) DEFAULT NULL,
  \`quantity_min\` INT DEFAULT NULL,
  \`quantity_max\` INT DEFAULT NULL,
  \`quantity_text\` VARCHAR(64) DEFAULT NULL,
  \`sort_order\` INT NOT NULL DEFAULT 0,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_recipe_ingredients_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_recipe_stations\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`recipe_key\` CHAR(64) NOT NULL,
  \`station_item_source_id\` INT DEFAULT NULL,
  \`station_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`station_name_raw\` VARCHAR(255) DEFAULT NULL,
  \`is_alternative\` TINYINT(1) NOT NULL DEFAULT 0,
  \`sort_order\` INT NOT NULL DEFAULT 0,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_recipe_stations_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_source_facts\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`item_source_id\` INT DEFAULT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`item_name\` VARCHAR(255) DEFAULT NULL,
  \`source_type\` VARCHAR(64) DEFAULT NULL,
  \`source_ref_type\` VARCHAR(64) DEFAULT NULL,
  \`source_ref_name\` VARCHAR(255) DEFAULT NULL,
  \`source_ref_normalized\` VARCHAR(255) DEFAULT NULL,
  \`biome_code\` VARCHAR(64) DEFAULT NULL,
  \`sort_order\` INT NOT NULL DEFAULT 0,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_source_facts_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_source_details\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`source_fact_key\` CHAR(64) NOT NULL,
  \`quantity_min\` INT DEFAULT NULL,
  \`quantity_max\` INT DEFAULT NULL,
  \`quantity_text\` VARCHAR(255) DEFAULT NULL,
  \`chance_value\` DECIMAL(10,6) DEFAULT NULL,
  \`chance_text\` VARCHAR(255) DEFAULT NULL,
  \`source_ref_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`source_ref_resolution\` VARCHAR(64) DEFAULT NULL,
  \`notes\` TEXT DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_source_details_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_npc_shop_candidates\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`source_fact_key\` CHAR(64) NOT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`npc_source_id\` INT DEFAULT NULL,
  \`npc_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`npc_name\` VARCHAR(255) DEFAULT NULL,
  \`price_text\` VARCHAR(255) DEFAULT NULL,
  \`conditions\` TEXT DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_npc_shop_candidates_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_npc_loot_candidates\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`source_fact_key\` CHAR(64) NOT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`npc_source_id\` INT DEFAULT NULL,
  \`npc_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`npc_name\` VARCHAR(255) DEFAULT NULL,
  \`quantity_min\` INT DEFAULT NULL,
  \`quantity_max\` INT DEFAULT NULL,
  \`quantity_text\` VARCHAR(255) DEFAULT NULL,
  \`chance_value\` DECIMAL(10,6) DEFAULT NULL,
  \`chance_text\` VARCHAR(255) DEFAULT NULL,
  \`conditions\` TEXT DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_npc_loot_candidates_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_buff_relations\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`item_source_id\` INT DEFAULT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`buff_source_id\` INT DEFAULT NULL,
  \`buff_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`relation_type\` VARCHAR(64) NOT NULL,
  \`duration_ticks\` INT DEFAULT NULL,
  \`chance_value\` DECIMAL(10,6) DEFAULT NULL,
  \`chance_text\` VARCHAR(255) DEFAULT NULL,
  \`conditions\` TEXT DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_buff_relations_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_biome_relations\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`item_source_id\` INT DEFAULT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`biome_code\` VARCHAR(64) DEFAULT NULL,
  \`relation_type\` VARCHAR(64) DEFAULT NULL,
  \`local_match_status\` VARCHAR(64) DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_biome_relations_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`item_projectile_audits\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`record_key\` CHAR(64) NOT NULL,
  \`item_source_id\` INT DEFAULT NULL,
  \`item_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`projectile_source_id\` INT DEFAULT NULL,
  \`projectile_internal_name\` VARCHAR(255) DEFAULT NULL,
  \`audit_status\` VARCHAR(64) NOT NULL,
  \`available_fields_json\` LONGTEXT DEFAULT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_item_projectile_audits_record_key\` (\`record_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
}
```

- [ ] **Step 4: Run schema test**

Run:

```powershell
node --test scripts/data/relation/relation-schema.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 5: Run syntax check**

Run:

```powershell
node --check scripts/data/relation/relation-schema.mjs
```

Expected:

```text
No output
```

### Commit

```powershell
git add scripts/data/relation/relation-schema.mjs scripts/data/relation/relation-schema.test.mjs
git commit -m "feat: add relation processing schema"
```

---

## Task 2: Add Trace And Identity Utilities

**Files:**
- Create: `scripts/data/relation/relation-trace.mjs`
- Create: `scripts/data/relation/relation-trace.test.mjs`

- [ ] **Step 1: Write failing trace utility tests**

Create `scripts/data/relation/relation-trace.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRecordKey,
  normalizeText,
  normalizeTrace,
  resolveItemIdentity,
  confidence,
} from './relation-trace.mjs';

test('createRecordKey is deterministic for JSON values', () => {
  const left = createRecordKey({ table: 'x', value: ['A', 1] });
  const right = createRecordKey({ table: 'x', value: ['A', 1] });
  assert.equal(left, right);
  assert.equal(left.length, 64);
});

test('normalizeTrace extracts maint and landing trace fields', () => {
  const trace = normalizeTrace('maint_item_sources', {
    id: 9,
    record_key: 'a'.repeat(64),
    landing_source_id: 51,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'b'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Acorn',
    source_revision_timestamp: '2026-03-20T17:40:48Z',
  });
  assert.equal(trace.sourceMaintTable, 'maint_item_sources');
  assert.equal(trace.sourceMaintRecordKey, 'a'.repeat(64));
  assert.equal(trace.landingSourceId, 51);
  assert.equal(trace.sourcePage, 'Acorn');
});

test('resolveItemIdentity requires source and internal-name consistency when both exist', () => {
  const result = resolveItemIdentity(
    { source_id: 1, internal_name: 'Acorn' },
    new Map([[1, { source_id: 1, internal_name: 'Acorn' }]]),
    new Map([['Acorn', { source_id: 1, internal_name: 'Acorn' }]])
  );
  assert.equal(result.status, 'resolved');
  assert.equal(result.itemInternalName, 'Acorn');
});

test('resolveItemIdentity downgrades to internal-name with issue reason when source id is missing', () => {
  const result = resolveItemIdentity(
    { source_id: null, internal_name: 'Acorn' },
    new Map(),
    new Map([['Acorn', { source_id: 1, internal_name: 'Acorn' }]])
  );
  assert.equal(result.status, 'candidate_low_confidence');
  assert.equal(result.reason, 'source_id_missing_internal_name_match');
  assert.equal(result.confidence, confidence.low);
});

test('normalizeText returns null for blank input', () => {
  assert.equal(normalizeText('  '), null);
  assert.equal(normalizeText(' Acorn '), 'Acorn');
});
```

- [ ] **Step 2: Create trace utility module**

Create `scripts/data/relation/relation-trace.mjs`:

```js
import crypto from 'node:crypto';

export const confidence = Object.freeze({
  high: 1.0,
  medium: 0.75,
  low: 0.4,
  none: 0.0,
});

export function createRecordKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

export function normalizeTrace(sourceMaintTable, row) {
  return {
    sourceMaintTable,
    sourceMaintRecordKey: row.record_key ?? null,
    sourceMaintId: row.id == null ? null : Number(row.id),
    landingSourceId: row.landing_source_id == null ? null : Number(row.landing_source_id),
    landingSourceKey: row.landing_source_key ?? null,
    landingContentHash: row.landing_content_hash ?? null,
    sourceProvider: row.source_provider ?? null,
    sourcePage: row.source_page ?? null,
    sourceRevisionTimestamp: row.source_revision_timestamp ?? null,
  };
}

export function resolveItemIdentity(candidate, bySourceId, byInternalName) {
  const sourceId = candidate.source_id == null ? null : Number(candidate.source_id);
  const internalName = normalizeText(candidate.internal_name);
  const sourceMatch = sourceId == null ? null : bySourceId.get(sourceId);
  const internalMatch = internalName == null ? null : byInternalName.get(internalName);

  if (sourceMatch && internalMatch && sourceMatch.internal_name === internalMatch.internal_name) {
    return {
      status: 'resolved',
      itemSourceId: sourceMatch.source_id,
      itemInternalName: sourceMatch.internal_name,
      reason: 'source_id_internal_name_match',
      confidence: confidence.high,
    };
  }

  if (sourceMatch && !internalName) {
    return {
      status: 'candidate_low_confidence',
      itemSourceId: sourceMatch.source_id,
      itemInternalName: sourceMatch.internal_name,
      reason: 'internal_name_missing_source_id_match',
      confidence: confidence.medium,
    };
  }

  if (!sourceMatch && internalMatch) {
    return {
      status: 'candidate_low_confidence',
      itemSourceId: internalMatch.source_id,
      itemInternalName: internalMatch.internal_name,
      reason: sourceId == null ? 'source_id_missing_internal_name_match' : 'source_id_mismatch_internal_name_match',
      confidence: confidence.low,
    };
  }

  return {
    status: 'unresolved',
    itemSourceId: sourceId,
    itemInternalName: internalName,
    reason: 'item_identity_unresolved',
    confidence: confidence.none,
  };
}
```

- [ ] **Step 3: Run trace tests**

Run:

```powershell
node --test scripts/data/relation/relation-trace.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/relation-trace.mjs scripts/data/relation/relation-trace.test.mjs
git commit -m "feat: add relation trace utilities"
```

---

## Task 3: Implement Category Relation Processor

**Files:**
- Create: `scripts/data/relation/category-relation-processor.mjs`
- Create: `scripts/data/relation/category-relation-processor.test.mjs`

- [ ] **Step 1: Write category processor tests**

Create tests with a fixture containing:

- one `maint_categories` row
- two matched `maint_item_categories` rows for `LesserHealingPotion`
- one unmatched `Unknown Draft` row

Assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategoryRelations } from './category-relation-processor.mjs';

test('buildCategoryRelations emits nodes, assignments, and unmatched diagnostics', () => {
  const categoryRow = {
    id: 1,
    record_key: 'c'.repeat(64),
    landing_source_id: 10,
    landing_source_key: 'wiki.categories',
    landing_content_hash: '1'.repeat(64),
    source_provider: 'terraria.wiki.gg',
    source_page: 'Template:Master Template Consumables',
  };
  const itemRows = [
    {
      id: 101,
      record_key: 'a'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Potions',
      group_name: 'Health',
      item_internal_name: 'LesserHealingPotion',
      item_english_name: 'Lesser Healing Potion',
      item_name: 'Lesser Healing',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables',
    },
    {
      id: 102,
      record_key: 'b'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Utility',
      group_name: 'Basics',
      item_internal_name: 'LesserHealingPotion',
      item_english_name: 'Lesser Healing Potion',
      item_name: 'Lesser Healing',
      parent_item_name: null,
      depth: 0,
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables',
    },
    {
      id: 103,
      record_key: 'd'.repeat(64),
      top_level: 'Consumables',
      template_title: 'Template:Master Template Consumables',
      section_title: 'Potions',
      group_name: 'Unknown',
      item_internal_name: null,
      item_name: 'Unknown Draft',
      is_group_node: 0,
      landing_source_id: 10,
      landing_source_key: 'wiki.categories',
      landing_content_hash: '1'.repeat(64),
      source_provider: 'terraria.wiki.gg',
      source_page: 'Template:Master Template Consumables',
    },
  ];
  const actual = buildCategoryRelations({ categoryRows: [categoryRow], itemCategoryRows: itemRows });
  assert.ok(actual.categoryNodes.length >= 4);
  assert.equal(actual.itemCategoryAssignments.length, 2);
  assert.equal(actual.summary.unmatchedItems, 1);
  assert.equal(actual.summary.primaryAssignments, 1);
  assert.equal(actual.summary.secondaryAssignments, 1);
  assert.ok(actual.itemCategoryAssignments.some((row) => row.isPrimary === true));
  assert.ok(actual.itemCategoryAssignments.some((row) => row.categoryPathText === 'Consumables > Potions > Health > Lesser Healing'));
});
```

- [ ] **Step 2: Implement processor**

Implement `buildCategoryRelations({ categoryRows, itemCategoryRows })` by:

- building path segments from `top_level`, `section_title`, `group_name`, `item_name`
- generating node keys with lower-case underscore normalization
- generating assignment keys from `item_internal_name + category_node_key`
- sorting item assignments by non-group first, deepest path first, then path text
- marking first assignment per item as `isPrimary=true`
- returning `{ categoryNodes, itemCategoryAssignments, issues, summary }`

Use `createRecordKey()` and `normalizeTrace()` from `relation-trace.mjs`.

- [ ] **Step 3: Run tests**

```powershell
node --test scripts/data/relation/category-relation-processor.test.mjs scripts/data/relation/relation-trace.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/category-relation-processor.mjs scripts/data/relation/category-relation-processor.test.mjs
git commit -m "feat: derive relation category assignments"
```

---

## Task 4: Implement Recipe Relation Processor

**Files:**
- Create: `scripts/data/relation/recipe-relation-processor.mjs`
- Create: `scripts/data/relation/recipe-relation-processor.test.mjs`

- [ ] **Step 1: Write recipe canonicalization tests**

Create tests using a duplicated `Abeemination` recipe from two maint recipe sources.

Assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeRelations } from './recipe-relation-processor.mjs';

test('buildRecipeRelations merges recipe sources into canonical rows', () => {
  const baseRecipe = {
    id: 1,
    record_key: 'r'.repeat(64),
    result_internal_name: 'Abeemination',
    result_name: 'Abeemination',
    result_quantity: 1,
    version_scope: 'Desktop version',
    ingredients_json: JSON.stringify([
      { ingredientInternalName: 'HoneyBlock', ingredientNameRaw: 'Honey Block', quantityMin: 5, quantityMax: 5, quantityText: '5', sortOrder: 0 },
      { ingredientInternalName: null, ingredientNameRaw: 'Unknown Material', quantityMin: 1, quantityMax: 1, quantityText: '1', sortOrder: 1 },
    ]),
    stations_json: JSON.stringify([
      { stationInternalName: 'DemonAltarIcon', stationNameRaw: 'Demon Altar', isAlternative: false, sortOrder: 0 },
    ]),
    landing_source_id: 51,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'f'.repeat(64),
    source_provider: 'wiki_gg',
    source_page: 'Abeemination',
  };
  const actual = buildRecipeRelations({
    itemRecipes: [baseRecipe],
    itemPageRecipes: [{ ...baseRecipe, id: 2, record_key: 'p'.repeat(64), source_context_page: 'Abeemination' }],
    recipePageRecipes: [],
    itemIndex: new Map([
      ['Abeemination', { source_id: 1133, internal_name: 'Abeemination' }],
      ['HoneyBlock', { source_id: 1125, internal_name: 'HoneyBlock' }],
    ]),
  });
  assert.equal(actual.recipeHeads.length, 1);
  assert.equal(actual.recipeIngredients.length, 2);
  assert.equal(actual.recipeStations.length, 1);
  assert.equal(actual.recipeHeads[0].sourceCount, 2);
  assert.equal(actual.recipeIngredients.find((row) => row.ingredientNameRaw === 'Unknown Material').reviewStatus, 'unresolved');
});
```

- [ ] **Step 2: Implement recipe processor**

Implement:

- `parseJsonArray(value)` returning `[]` for invalid or non-array JSON
- `normalizeRecipeInput(row, sourceTable)` producing a common structure
- `buildRecipeKey(recipe)` using result, ingredients, stations, and version scope
- `buildRecipeRelations({ itemRecipes, itemPageRecipes, recipePageRecipes, itemIndex })`

Required outputs:

- `recipeHeads`
- `recipeIngredients`
- `recipeStations`
- `issues`
- `summary`

Unresolved ingredient/station rules:

- keep raw name
- keep null internal/source id
- set `reviewStatus='unresolved'`
- set `confidence=0`
- set reason to `ingredient_item_unresolved` or `station_item_unresolved`

- [ ] **Step 3: Run recipe tests**

```powershell
node --test scripts/data/relation/recipe-relation-processor.test.mjs scripts/data/relation/relation-trace.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/recipe-relation-processor.mjs scripts/data/relation/recipe-relation-processor.test.mjs
git commit -m "feat: derive canonical relation recipes"
```

---

## Task 5: Implement Item Source And NPC Candidate Processor

**Files:**
- Create: `scripts/data/relation/item-source-relation-processor.mjs`
- Create: `scripts/data/relation/item-source-relation-processor.test.mjs`

- [ ] **Step 1: Write item source tests**

Use `Acorn`-style source rows:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItemSourceRelations } from './item-source-relation-processor.mjs';

test('buildItemSourceRelations splits resolved shop and unresolved drops', () => {
  const acornRows = [
    {
      id: 1,
      record_key: '1'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_name: 'Dryad',
      biome_code: 'crimson',
      sort_order: 0,
      raw_json: JSON.stringify({ sourceRefName: 'Dryad', sourceProvider: 'wiki_gg' }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn',
    },
    {
      id: 2,
      record_key: '2'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'drop',
      source_ref_type: 'npc',
      source_ref_name: 'Ash tree',
      biome_code: 'crimson',
      sort_order: 1,
      raw_json: JSON.stringify({ sourceRefName: 'Ash tree', quantityMin: 1, quantityMax: 2, chanceValue: 0.141429, chanceText: '14.1429%', sourceRefResolution: 'no_match' }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn',
    },
    {
      id: 3,
      record_key: '3'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      source_type: 'shop',
      source_ref_type: 'npc',
      source_ref_name: 'Dryad for',
      biome_code: 'crimson',
      sort_order: 2,
      raw_json: JSON.stringify({ sourceRefName: 'Dryad for', notes: 'purchased from the Dryad for 10 CC each' }),
      landing_source_id: 51,
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'f'.repeat(64),
      source_provider: 'wiki_gg',
      source_page: 'Acorn',
    },
  ];
  const actual = buildItemSourceRelations({
    itemSourceRows: acornRows,
    npcIndex: new Map([['Dryad', { source_id: 20, internal_name: 'Dryad', name: 'Dryad' }]]),
  });
  assert.equal(actual.sourceFacts.length, 3);
  assert.equal(actual.sourceDetails.length, 3);
  assert.equal(actual.npcShopCandidates.length, 1);
  assert.equal(actual.npcLootCandidates.length, 0);
  assert.equal(actual.issues.filter((issue) => issue.reason === 'npc_source_unresolved').length, 1);
  assert.equal(actual.issues.filter((issue) => issue.reason === 'source_ref_text_polluted').length, 1);
  assert.equal(actual.sourceDetails.find((row) => row.sourceRefName === 'Ash tree').chanceText, '14.1429%');
});
```

- [ ] **Step 2: Implement item source processor**

Implement:

- `parseRawJson(row)`
- `normalizeSourceRefName(value)`
- `isPollutedSourceRefName(value)` returning true for suffix patterns like ` for`
- `resolveNpcRef(row, npcIndex)`
- `buildItemSourceRelations({ itemSourceRows, npcIndex })`

Rules:

- Always create `item_source_facts`
- Always create `item_source_details`
- Create `item_npc_shop_candidates` only for resolved NPC shop rows
- Create `item_npc_loot_candidates` only for resolved NPC drop rows
- Emit unresolved issues for `source_ref_type='npc'` rows that do not resolve
- Emit pollution issues for dirty text such as `Dryad for`

- [ ] **Step 3: Run tests**

```powershell
node --test scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/relation-trace.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/item-source-relation-processor.mjs scripts/data/relation/item-source-relation-processor.test.mjs
git commit -m "feat: derive item source npc candidates"
```

---

## Task 6: Implement Secondary Relation Processor

**Files:**
- Create: `scripts/data/relation/secondary-relation-processor.mjs`
- Create: `scripts/data/relation/secondary-relation-processor.test.mjs`

- [ ] **Step 1: Write secondary relation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecondaryRelations } from './secondary-relation-processor.mjs';

test('buildSecondaryRelations emits biome relations and projectile audits without final projectile facts', () => {
  const actual = buildSecondaryRelations({
    itemBiomeRows: [{
      id: 1,
      record_key: 'b'.repeat(64),
      item_internal_name: 'Acorn',
      item_name: 'Acorn',
      biome_code: 'crimson',
      relation_type: 'found_in',
      raw_json: '{}',
    }],
    localItemBiomes: [],
    localBuffSourceItems: [{ buff_source_id: 1, buff_internal_name: 'Honey', source_item_internal_name: 'BottledHoney', buff_time: 900 }],
    maintProjectileRows: [{ source_id: 1, internal_name: 'ProjectileA', raw_json: '{}' }],
    maintItemRows: [{ source_id: 10, internal_name: 'ItemA', raw_json: JSON.stringify({ shoot: 1 }) }],
    itemImageRows: [{ item_internal_name: 'Acorn', is_primary: 1 }],
  });
  assert.equal(actual.itemBiomeRelations.length, 1);
  assert.equal(actual.itemBiomeRelations[0].localMatchStatus, 'missing_in_local');
  assert.equal(actual.itemBuffRelations.length, 1);
  assert.equal(actual.itemProjectileAudits.length, 1);
  assert.equal(actual.itemProjectileAudits[0].auditStatus, 'not_promoted_first_stage');
  assert.equal(actual.summary.imageCoverageRows, 1);
});
```

- [ ] **Step 2: Implement secondary processor**

Implement `buildSecondaryRelations()` with:

- biome rows from `maint_item_biomes`
- local biome cross-check by `item_internal_name + biome_code`
- buff rows from local cross-check only, marked `reviewStatus='candidate_low_confidence'`
- projectile audit rows only, never canonical relation rows
- image coverage summary only

- [ ] **Step 3: Run tests**

```powershell
node --test scripts/data/relation/secondary-relation-processor.test.mjs scripts/data/relation/relation-trace.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/secondary-relation-processor.mjs scripts/data/relation/secondary-relation-processor.test.mjs
git commit -m "feat: add secondary relation audits"
```

---

## Task 7: Add Report Writer

**Files:**
- Create: `scripts/data/relation/relation-report.mjs`
- Create: `scripts/data/relation/relation-report.test.mjs`

- [ ] **Step 1: Write report tests**

Test:

- JSON report is written
- Markdown report is written
- Markdown contains domain sections: `Recipe`, `NPC Source`, `Buff`, `Biome`, `Category`, `Projectile`
- unresolved samples include reason and trace fields

- [ ] **Step 2: Implement report writer**

Export:

```js
export function buildRelationAuditMarkdown(summary) {}
export async function writeRelationReports({ repoRoot, dateTag, summary, issues, conflicts }) {}
```

Report paths:

- `reports/relation/relation-audit-YYYY-MM-DD.json`
- `reports/relation/relation-audit-YYYY-MM-DD.md`
- `reports/relation/relation-conflicts-YYYY-MM-DD.json`
- `reports/relation/relation-unresolved-YYYY-MM-DD.json`

- [ ] **Step 3: Run tests**

```powershell
node --test scripts/data/relation/relation-report.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/relation-report.mjs scripts/data/relation/relation-report.test.mjs
git commit -m "feat: add relation audit reports"
```

---

## Task 8: Add Main Sync CLI And Persistence

**Files:**
- Create: `scripts/data/relation/sync-maint-to-relation.mjs`
- Create: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] **Step 1: Write CLI parsing tests**

Expected parsing:

```js
parseArgs(['--apply=true', '--maint-database=terria_v1_maint', '--relation-database=terria_v1_relation', '--scopes=category,recipe,npc,buff,biome,projectile'])
```

Result:

```js
{
  apply: true,
  maintDatabase: 'terria_v1_maint',
  localDatabase: 'terria_v1_local',
  relationDatabase: 'terria_v1_relation',
  scopes: ['category', 'recipe', 'npc', 'buff', 'biome', 'projectile'],
  createDatabase: false,
}
```

- [ ] **Step 2: Write dry-run isolation test**

Use fake dependencies:

- `queryMaint(sql)`
- `queryLocal(sql)`
- `executeRelation(sql, params)`
- `writeReports(summary)`

Assert:

- dry-run calls maint/local reads
- dry-run does not call relation writes
- summary has `apply=false`

- [ ] **Step 3: Implement CLI**

Support:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
```

Rules:

- `--apply=false` never creates database and never writes relation rows
- `--apply=true --create-database=true` may run `CREATE DATABASE IF NOT EXISTS`
- default relation database is `terria_v1_relation`
- default maint database is `terria_v1_maint`
- default local database is `terria_v1_local`
- local connection is read-only by convention; no local write functions are implemented

- [ ] **Step 4: Implement persistence functions**

Add:

- `upsertRows(connection, tableName, rows, columns)`
- `insertRun(connection, run)`
- `finishRun(connection, runKey, summary)`
- `insertReportRows(connection, reportRows)`

Use `INSERT ... ON DUPLICATE KEY UPDATE` for result tables.

- [ ] **Step 5: Run tests**

```powershell
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected:

```text
PASS
```

### Commit

```powershell
git add scripts/data/relation/sync-maint-to-relation.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
git commit -m "feat: add maint relation sync cli"
```

---

## Task 9: Integration Dry Run And Database Apply

**Files:**
- Verify: `scripts/data/relation/*.mjs`
- Generated: `reports/relation/relation-audit-YYYY-MM-DD.json`
- Generated: `reports/relation/relation-audit-YYYY-MM-DD.md`
- Generated: `reports/relation/relation-conflicts-YYYY-MM-DD.json`
- Generated: `reports/relation/relation-unresolved-YYYY-MM-DD.json`

- [ ] **Step 1: Run all relation tests**

```powershell
node --test scripts/data/relation/*.test.mjs
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run syntax checks**

```powershell
Get-ChildItem scripts/data/relation -Filter *.mjs | ForEach-Object { node --check $_.FullName }
```

Expected:

```text
No output
```

- [ ] **Step 3: Run dry-run against current maint/local**

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
```

Expected:

```text
Apply: false
Maint database: terria_v1_maint
Relation database: terria_v1_relation
Reports: reports/relation/...
Relation writes: 0
```

- [ ] **Step 4: Review dry-run reports**

Check:

- all required domains have counts
- unresolved examples include trace
- `Dryad for` appears as polluted source text issue
- projectile domain is audit-only
- no local write summary exists

- [ ] **Step 5: Apply to isolated relation database**

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile
```

Expected:

```text
Apply: true
Created database: terria_v1_relation
Wrote relation tables
Reports: reports/relation/...
```

- [ ] **Step 6: Verify isolated DB counts**

Run:

```powershell
@'
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'127.0.0.1', port:3306, user:'root', password:'root', database:'terria_v1_relation'});
  for (const table of ['relation_runs','category_nodes','item_category_assignments','item_recipe_heads','item_source_facts','item_source_details','item_npc_shop_candidates','item_npc_loot_candidates','item_biome_relations','item_projectile_audits']) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM ${table}`);
    console.log(`${table}\t${rows[0].c}`);
  }
  await conn.end();
})();
'@ | node -
```

Expected:

```text
relation_runs > 0
item_source_facts > 0
item_recipe_heads > 0
```

### Commit

```powershell
git add scripts/data/relation reports/relation
git commit -m "feat: generate isolated item relation database"
```

---

## Task 10: Final Documentation And Safety Review

**Files:**
- Modify: `docs/superpowers/specs/2026-04-23-maint-item-relation-domain-design.md`
- Modify: `docs/superpowers/plans/2026-04-23-maint-item-relation-domain.md`
- Create: `project-plan/TerraPedia_M16_R1_独立关系处理库执行记录_2026-04-23.md`

- [ ] **Step 1: Update design implementation status**

Add:

```markdown
## Implementation Status

- Plan: `docs/superpowers/plans/2026-04-23-maint-item-relation-domain.md`
- Target processing database: `terria_v1_relation`
- Write policy: no writes to `terria_v1_local` or `terria_v1_maint`
```

- [ ] **Step 2: Write project-plan execution record**

Create:

```markdown
# TerraPedia M16-R1 独立关系处理库执行记录
日期：2026-04-23

## 目标

以 `terria_v1_maint` 为唯一上游事实入口，新建 `terria_v1_relation` 保存处理后的 item 关系结果。

## 已执行验证

- `node --test scripts/data/relation/*.test.mjs`
- `node scripts/data/relation/sync-maint-to-relation.mjs --apply=false ...`
- `node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true ...`

## 写入边界

- 未写 `terria_v1_local`
- 未改 `terria_v1_maint`
- 仅写 `terria_v1_relation`

## 报告

- `reports/relation/relation-audit-2026-04-23.json`
- `reports/relation/relation-audit-2026-04-23.md`
- `reports/relation/relation-conflicts-2026-04-23.json`
- `reports/relation/relation-unresolved-2026-04-23.json`

## 风险

- projectile 本轮仍为 audit-only
- `maint_items` 与 `local.items` 数量差异仍阻断任何 local 覆盖
- `source_ref_name` 污染样本需要人工复核
```

- [ ] **Step 3: Check git status and diff scope**

```powershell
git status --short
git diff --stat
```

Expected:

```text
Only relation scripts, relation tests, reports, and docs are changed.
```

### Commit

```powershell
git add docs/superpowers/specs/2026-04-23-maint-item-relation-domain-design.md docs/superpowers/plans/2026-04-23-maint-item-relation-domain.md project-plan/TerraPedia_M16_R1_独立关系处理库执行记录_2026-04-23.md
git commit -m "docs: record isolated relation processing plan"
```

---

## Self-Review

### Spec Coverage

- Isolated database requirement is covered by Tasks 1, 8, 9, and 10.
- No writes to `local` or `maint` is covered by Tasks 8 and 9.
- Category, recipe, NPC source, buff, biome, projectile domains are covered by Tasks 3 through 6.
- JSON/Markdown reporting is covered by Task 7.
- Dry-run and apply validation are covered by Task 9.

### Placeholder Scan

The plan avoids unresolved placeholder wording. Every task has exact file paths, expected commands, and validation outputs.

### Type Consistency

The plan consistently uses:

- `record_key`
- `source_maint_record_key`
- `landing_source_id`
- `confidence`
- `review_status`
- `terria_v1_relation`
- `item_recipe_heads`
- `item_source_facts`
- `item_npc_shop_candidates`
- `item_npc_loot_candidates`
