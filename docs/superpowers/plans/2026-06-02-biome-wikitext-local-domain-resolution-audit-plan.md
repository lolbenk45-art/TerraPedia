# Biome Wikitext Local Domain Resolution Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only evidence report that checks the 42 biome wikitext unresolved rows against TerraPedia local domain data, including items, NPCs, armor sets, boss loot treasure-bag rows, and exact/ambiguous local DB matches.

**Architecture:** Reuse `reports/biome-wikitext-unresolved-2026-06-02.json` as the input. Add a separate read-only audit script that connects to `terria_v1_local`, checks each unresolved row against domain-specific DB surfaces, and emits a recommendation category without creating aliases or writing DB rows. This report informs the next user decision; it is not an import plan.

**Tech Stack:** Node.js ESM scripts, `node:test`, lazy `mysql2/promise` resolution through `data-query-app/package.json`, JSON reports, TerraPedia local DB `terria_v1_local`.

---

## Current Facts

- Working branch: `plan/biome-wikitext-unresolved-2026-06-02`
- Base commit: `7cddfb8`
- Existing unresolved input report: `reports/biome-wikitext-unresolved-2026-06-02.json`
- Input totals:
  - total unresolved: 42
  - item missing: 9
  - NPC missing: 19
  - NPC ambiguous: 14
- Local DB checked manually:
  - `items`: 6159 rows
  - `npcs`: 762 rows
  - armor set tables exist: `armor_sets`, `armor_set_items`
  - boss loot table exists: `npc_loot_entries`
- Manual evidence already found:
  - `Ninja armor` maps to `ArmorSetBonus.Ninja` with `NinjaHood|NinjaShirt|NinjaPants`
  - `Snow armor` maps to `ArmorSetBonus.Snow` with multiple Eskimo/Pink Eskimo variants
  - `Wall of Flesh` and `Deerclops` have `npc_loot_entries.drop_source_kind='treasure_bag'`

## Hard Boundaries

- Do not write database records.
- Do not run commands containing `--apply=true`.
- Do not run crawler, fetch, import, backfill, or load scripts.
- Do not create alias config.
- Do not modify `biome-wikitext-linkage-dry-run.mjs`.
- Do not change backend/API/UI behavior.
- Do not decide final mappings; emit evidence and recommendation categories only.

## Success Criteria

- A deterministic local-domain audit script exists with focused tests.
- The script reads the unresolved report and performs read-only DB queries only.
- The generated report contains exactly 42 rows and preserves the input row indexes.
- Each output row includes:
  - original unresolved evidence
  - item exact/like counts for item rows
  - NPC exact/like counts for NPC rows
  - armor set candidates for item collection rows
  - boss loot candidates for `Treasure Bag` rows when source names a boss
  - recommendation category
  - `needsUserDecision: true`
- The report identifies domain-specific next actions without writing:
  - `evidence_armor_set_single_candidate`
  - `evidence_armor_set_variant_needs_decision`
  - `evidence_boss_treasure_bag_projection`
  - `ambiguous_npc_variant_needs_decision`
  - `missing_local_entity_needs_backfill`
  - `unresolved_local_domain_gap`
- Tests and source scan prove there is no SQL write verb, no network/process module, no crawler/fetch/import/backfill/load script path, and no apply path.
- The real DB loader is tested with a fake connection that captures SQL and proves every script query starts with `SELECT`.
- DB execution is guarded to `terria_v1_local`; any other `TERRAPEDIA_DB_NAME` fails unless a later user-approved plan changes that boundary.
- Final handoff summarizes all 42 rows by recommendation category and lists concrete user decision questions.

## Files

- Create: `scripts/data/audit/biome-wikitext-local-domain-resolution-audit.mjs`
- Create: `scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs`
- Output report, local/ignored: `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json`
- Existing input: `reports/biome-wikitext-unresolved-2026-06-02.json`

## Execution Status

- Status: executed read-only on 2026-06-02.
- Multi-agent data-chain review: no data-chain safety findings.
- Multi-agent implementation review: important gaps found and repaired:
  - fake DB test now covers NPC queries as well as item, armor-set, and boss-loot queries
  - script SQL now schema-qualifies local tables as `terria_v1_local`
  - report validator now checks top-level schema, `summary.byRecommendation`, input index order, original row fields, and evidence array shapes
- Dependency note: this isolated worktree did not have `data-query-app/node_modules`; the audit run used `NODE_PATH=/home/lolben/TerraPedia/data-query-app/node_modules` to reuse the already-installed local dependency. No install command was run.
- DB preflight, read-only: `armor_sets`, `armor_set_items`, `items`, `npcs`, and `npc_loot_entries` exist in `terria_v1_local`.
- Generated report: `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json`
- Generated report summary:
  - total: 42
  - `missing_local_entity_needs_backfill`: 24
  - `ambiguous_npc_variant_needs_decision`: 14
  - `evidence_armor_set_variant_needs_decision`: 2
  - `evidence_boss_treasure_bag_projection`: 2
- Validation run:
  - `node --test scripts/data/audit/biome-wikitext-unresolved-report.test.mjs scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs`
  - result: 19/19 pass
- Runtime report validation:
  - exactly 42 rows
  - `inputIndex` preserved as 1..42
  - every row has `evidenceOnly: true`
  - every row has `needsUserDecision: true`
  - no DB writes, no crawler/fetch/import/backfill/load/apply command was run

## Task 0: Pre-Execution Multi-Agent Review Gate

**Files:**
- Review only; no writes by reviewers.

- [ ] **Step 1: Data-chain reviewer**

Ask one read-only agent to review this plan for data-chain safety:

- no DB writes
- no crawler/fetch/import/backfill/apply path
- local DB lookup scope is clear
- armor set and boss loot are treated as domain evidence, not direct item-biome writes
- final mapping decisions remain blocked on the user

- [ ] **Step 2: Implementation reviewer**

Ask one read-only agent to review executability:

- TDD tasks are concrete
- DB query helpers can be tested with injected fake query functions
- CLI contract is explicit
- output schema is stable
- validation commands are sufficient

- [ ] **Step 3: Repair loop**

If either reviewer finds critical or important defects:

1. Stop implementation.
2. Patch this plan.
3. Re-run the affected review.
4. Continue only when no critical or important defects remain.

## Task 1: Add Local Domain Audit Tests

**Files:**
- Create: `scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs`

- [ ] **Step 1: Write failing tests**

Create the test file:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditBiomeWikitextLocalDomainResolution,
  buildConnectionConfig,
  classifyDomainRecommendation,
  createMysqlEvidenceLoader,
  parseArgs,
  validateLocalDomainAuditReport,
  writeLocalDomainAuditReport
} from './biome-wikitext-local-domain-resolution-audit.mjs';

function unresolvedReportFixture() {
  return {
    entity: 'biome_wikitext_unresolved_report',
    generatedAt: '2026-06-02T04:00:00.000Z',
    sourceReportPath: '/tmp/source.json',
    sourceGeneratedAt: '2026-06-02T03:51:10.835Z',
    summary: { total: 4, item: { missing: 3, ambiguous: 0 }, npc: { missing: 0, ambiguous: 1 }, byReviewCategory: {} },
    rows: [
      { index: 1, rowKey: 'forest:item:missing:ninja_armor:1', biomeCode: 'forest', pageTitle: 'Forest', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From the King Slime', name: 'Ninja armor', note: null, candidateMatches: [], reviewCategory: 'item_collection_or_set', needsUserDecision: true },
      { index: 2, rowKey: 'underworld:item:missing:treasure_bag:2', biomeCode: 'underworld', pageTitle: 'The Underworld', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From Wall of Flesh', name: 'Treasure Bag', note: '(drops the Demon Heart in Expert Mode)', candidateMatches: [], reviewCategory: 'generic_item_name_needs_context', needsUserDecision: true },
      { index: 3, rowKey: 'snow:item:missing:snow_armor:3', biomeCode: 'snow', pageTitle: 'Snow biome', matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From Frozen Zombies', name: 'Snow armor', note: '(1/30 chance for each piece)', candidateMatches: [], reviewCategory: 'item_collection_or_set', needsUserDecision: true },
      { index: 4, rowKey: 'forest:npc:ambiguous:zombie:4', biomeCode: 'forest', pageTitle: 'Forest', matchType: 'npc', matchStatus: 'ambiguous', section: 'Characters', source: 'During the night', name: 'Zombie', note: null, candidateMatches: [{ entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' }, { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }], reviewCategory: 'ambiguous_variant_group_needs_user_decision', needsUserDecision: true }
    ]
  };
}

function fakeDbEvidence(row) {
  if (row.name === 'Ninja armor') {
    return {
      itemExact: [],
      itemLike: [],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [{ id: 96, sourceKey: 'ArmorSetBonus.Ninja', textKey: 'ArmorSetBonus.Ninja', setCount: 1, uniqueItemCount: 3, items: ['NinjaHood', 'NinjaShirt', 'NinjaPants'] }],
      bossLootCandidates: []
    };
  }
  if (row.name === 'Snow armor') {
    return {
      itemExact: [],
      itemLike: [],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [{ id: 111, sourceKey: 'ArmorSetBonus.Snow', textKey: 'ArmorSetBonus.Snow', setCount: 8, uniqueItemCount: 6, items: ['EskimoHood', 'EskimoCoat', 'EskimoPants', 'PinkEskimoHood'] }],
      bossLootCandidates: []
    };
  }
  if (row.name === 'Treasure Bag') {
    return {
      itemExact: [],
      itemLike: [{ id: 3318, internalName: 'BossBag14', name: 'Treasure Bag' }],
      npcExact: [],
      npcLike: [],
      armorSetCandidates: [],
      bossLootCandidates: [{ bossInternalName: 'WallofFlesh', dropSourceKind: 'treasure_bag', lootRows: 10, sampleItems: ['DemonHeart', 'Pwnhammer'] }]
    };
  }
  return {
    itemExact: [],
    itemLike: [],
    npcExact: [{ id: 3, internalName: 'Zombie', name: 'Zombie' }, { id: 430, internalName: 'BigZombie', name: 'Zombie' }],
    npcLike: [],
    armorSetCandidates: [],
    bossLootCandidates: []
  };
}

test('auditBiomeWikitextLocalDomainResolution preserves 42-style row evidence and classifies domain recommendations', async () => {
  const report = await auditBiomeWikitextLocalDomainResolution({
    unresolvedReport: unresolvedReportFixture(),
    loadEvidenceForRow: async (row) => fakeDbEvidence(row)
  });

  assert.equal(report.entity, 'biome_wikitext_local_domain_resolution_audit');
  assert.equal(report.summary.total, 4);
  assert.deepEqual(report.rows.map((row) => row.inputIndex), [1, 2, 3, 4]);
  assert.deepEqual(report.rows.map((row) => row.recommendation), [
    'evidence_armor_set_single_candidate',
    'evidence_boss_treasure_bag_projection',
    'evidence_armor_set_variant_needs_decision',
    'ambiguous_npc_variant_needs_decision'
  ]);
  assert.equal(report.rows[3].original.section, 'Characters');
  assert.equal(report.rows[3].original.candidateMatches.length, 2);
  assert.equal(report.rows[0].armorSetCandidates[0].items.length, 3);
  assert.equal(report.rows[1].bossLootCandidates[0].dropSourceKind, 'treasure_bag');
  assert.equal(validateLocalDomainAuditReport(report).valid, true);
});

test('classifyDomainRecommendation selects domain-specific next actions without deciding final mappings', () => {
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Ninja armor' }, evidence: { armorSetCandidates: [{ setCount: 1 }], bossLootCandidates: [] } }), 'evidence_armor_set_single_candidate');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Snow armor' }, evidence: { armorSetCandidates: [{ setCount: 8 }], bossLootCandidates: [] } }), 'evidence_armor_set_variant_needs_decision');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'item', name: 'Treasure Bag' }, evidence: { armorSetCandidates: [], bossLootCandidates: [{ lootRows: 10 }] } }), 'evidence_boss_treasure_bag_projection');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'npc', matchStatus: 'ambiguous', name: 'Zombie' }, evidence: { npcExact: [{}, {}] } }), 'ambiguous_npc_variant_needs_decision');
  assert.equal(classifyDomainRecommendation({ original: { matchType: 'npc', matchStatus: 'missing', name: 'Cloud Slime' }, evidence: { npcExact: [], npcLike: [] } }), 'missing_local_entity_needs_backfill');
});

test('parseArgs requires input report and rejects unknown options', () => {
  assert.throws(() => parseArgs([]), /--input is required/);
  assert.throws(() => parseArgs(['--input=a.json', '--bad=true']), /Unknown option: --bad/);
  assert.deepEqual(parseArgs(['--input=a.json', '--output=b.json']), { input: 'a.json', output: 'b.json' });
});

test('buildConnectionConfig uses local DB defaults and refuses non-local DB names', () => {
  assert.deepEqual(buildConnectionConfig({
    TERRAPEDIA_DB_SOCKET: '/run/mysqld/mysqld.sock',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root'
  }), {
    socketPath: '/run/mysqld/mysqld.sock',
    user: 'root',
    password: 'root',
    database: 'terria_v1_local'
  });
  assert.deepEqual(buildConnectionConfig({
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '13306',
    TERRAPEDIA_DB_USERNAME: 'root',
    TERRAPEDIA_DB_PASSWORD: 'root'
  }), {
    host: '127.0.0.1',
    port: 13306,
    user: 'root',
    password: 'root',
    database: 'terria_v1_local'
  });
  assert.throws(() => buildConnectionConfig({ TERRAPEDIA_DB_NAME: 'prod' }), /Refusing non-local database/);
});

test('createMysqlEvidenceLoader only issues SELECT queries and returns normalized evidence', async () => {
  const captured = [];
  const connection = {
    async execute(sql, params) {
      captured.push({ sql, params });
      assert.match(sql.trim(), /^SELECT\b/i);
      if (sql.includes('FROM items')) return [[{ id: 1, internal_name: 'NinjaHood', name: 'Ninja Hood', name_zh: '忍者兜帽' }]];
      if (sql.includes('FROM npcs')) return [[{ id: 3, internal_name: 'Zombie', name: 'Zombie', name_zh: '僵尸' }]];
      if (sql.includes('FROM armor_sets')) return [[{ id: 96, source_key: 'ArmorSetBonus.Ninja', text_key: 'ArmorSetBonus.Ninja', set_count: 1, unique_item_count: 3, items: 'NinjaHood|NinjaShirt|NinjaPants' }]];
      if (sql.includes('FROM npc_loot_entries')) return [[{ boss_internal_name: 'WallofFlesh', drop_source_kind: 'treasure_bag', loot_rows: 10, sample_items: 'DemonHeart|Pwnhammer' }]];
      return [[]];
    }
  };
  const loader = createMysqlEvidenceLoader({ connection });

  const evidence = await loader({
    matchType: 'item',
    matchStatus: 'missing',
    name: 'Ninja armor',
    source: 'From Wall of Flesh',
    reviewCategory: 'item_collection_or_set'
  });

  assert.ok(captured.length >= 4);
  assert.equal(evidence.itemExact.length, 1);
  assert.equal(evidence.armorSetCandidates[0].items.length, 3);
  assert.equal(evidence.bossLootCandidates[0].dropSourceKind, 'treasure_bag');
});

test('validateLocalDomainAuditReport rejects missing original evidence and invalid recommendations', async () => {
  const report = await auditBiomeWikitextLocalDomainResolution({
    unresolvedReport: unresolvedReportFixture(),
    loadEvidenceForRow: async (row) => fakeDbEvidence(row)
  });
  delete report.rows[3].original.candidateMatches;
  report.rows[0].recommendation = 'made_up';

  const result = validateLocalDomainAuditReport(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /missing original.candidateMatches/);
  assert.match(result.issues.join('\n'), /unsupported recommendation/);
});

test('writeLocalDomainAuditReport writes JSON using injected read-only evidence loader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-local-domain-audit-'));
  const inputPath = path.join(dir, 'unresolved.json');
  const outputPath = path.join(dir, 'audit.json');
  fs.writeFileSync(inputPath, `${JSON.stringify(unresolvedReportFixture())}\n`, 'utf8');

  const result = await writeLocalDomainAuditReport({
    inputPath,
    outputPath,
    loadEvidenceForRow: async (row) => fakeDbEvidence(row)
  });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.summary.total, 4);
  assert.equal(output.rows[2].recommendation, 'evidence_armor_set_variant_needs_decision');
});

test('script source has no SQL write, network/process module, crawler/fetch/import/backfill/load script, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-local-domain-resolution-audit.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\\b(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER)\\b|CREATE\\s+TABLE|--apply|node:child_process|node:https|node:http|fetch\\(|scripts\\/data\\/(crawler|fetch|import|backfill|load)/i);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs
```

Expected: FAIL because the implementation file does not exist.

## Task 2: Add Local Domain Audit Script

**Files:**
- Create: `scripts/data/audit/biome-wikitext-local-domain-resolution-audit.mjs`

- [ ] **Step 1: Implement exported pure functions and CLI**

Implement:

- `parseArgs(argv)`
- `buildConnectionConfig(env)`
- `auditBiomeWikitextLocalDomainResolution({ unresolvedReport, loadEvidenceForRow })`
- `classifyDomainRecommendation({ original, evidence })`
- `validateLocalDomainAuditReport(report)`
- `writeLocalDomainAuditReport({ inputPath, outputPath, loadEvidenceForRow })`
- `createMysqlEvidenceLoader({ connection })`
- `resolveMysql()`

CLI contract:

- `--input=<path>` is required.
- `--output=<path>` defaults to `reports/biome-wikitext-local-domain-resolution-audit-YYYY-MM-DD.json`.
- Unknown options fail.
- `resolveMysql()` lazy-loads `mysql2/promise` through `createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))` so tests with injected loaders do not require mysql2.
- DB config supports:
  - `TERRAPEDIA_DB_SOCKET`
  - `TERRAPEDIA_DB_HOST`
  - `TERRAPEDIA_DB_PORT`
  - `TERRAPEDIA_DB_NAME`
  - `TERRAPEDIA_DB_USERNAME`
  - `TERRAPEDIA_DB_PASSWORD`
- Default DB name is `terria_v1_local`.
- Non-`terria_v1_local` DB names are refused in this plan.
- The CLI only runs `SELECT` queries.

Output row contract:

- `inputIndex`
- `original` object preserving the full unresolved row, including `section` and `candidateMatches`
- `itemExactMatches`
- `itemLikeMatches`
- `npcExactMatches`
- `npcLikeMatches`
- `armorSetCandidates`
- `bossLootCandidates`
- `recommendation`, one of the six allowed categories
- `evidenceOnly: true`
- `needsUserDecision`

- [ ] **Step 2: Implement read-only SQL evidence loader**

The evidence loader must query:

- `items` by exact and limited LIKE for item rows.
- `npcs` by exact and limited LIKE for NPC rows.
- `armor_sets` joined to `armor_set_items` for item rows whose name contains `armor` or `set`.
- `npc_loot_entries` joined to `npcs` and `items` for `Treasure Bag` rows where `source` contains a known boss display name or internal name.

Allowed SQL statements must start with `SELECT`.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs
```

Expected: PASS.

## Task 3: Preflight Existing Reports and DB

**Files:**
- No writes.

- [ ] **Step 1: Verify input report exists and has 42 rows**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const p = 'reports/biome-wikitext-unresolved-2026-06-02.json';
const r = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log(JSON.stringify(r.summary, null, 2));
if (r.summary?.total !== 42 || r.rows?.length !== 42) throw new Error('expected 42 unresolved rows');
NODE
```

Expected: summary total and row length are 42.

- [ ] **Step 2: Verify DB target and required tables**

Run:

```bash
mysql --protocol=SOCKET --socket=/run/mysqld/mysqld.sock -uroot -proot terria_v1_local -e "
SELECT DATABASE() AS db_name;
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('items','npcs','armor_sets','armor_set_items','npc_loot_entries') ORDER BY table_name;
"
```

Expected: database is `terria_v1_local` and all listed tables exist.

- [ ] **Step 3: Verify mysql2 lazy resolution path**

Run:

```bash
node - <<'NODE'
const { createRequire } = require('node:module');
const path = require('node:path');
const requireFromDataQueryApp = createRequire(path.resolve('data-query-app/package.json'));
console.log(requireFromDataQueryApp.resolve('mysql2/promise'));
NODE
```

Expected: prints a resolved `mysql2/promise` path. If it fails, install `data-query-app` dependencies before continuing.

## Task 4: Generate Local Domain Resolution Audit Report

**Files:**
- Output: `reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json`

- [ ] **Step 1: Run the audit**

Run:

```bash
TERRAPEDIA_DB_SOCKET=/run/mysqld/mysqld.sock TERRAPEDIA_DB_USERNAME=root TERRAPEDIA_DB_PASSWORD=root \
node scripts/data/audit/biome-wikitext-local-domain-resolution-audit.mjs \
  --input=reports/biome-wikitext-unresolved-2026-06-02.json \
  --output=reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json
```

Expected:

- `summary.total` is 42.
- No DB writes occur.
- Output report exists under `reports/`.

- [ ] **Step 2: Validate generated report contract**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json', 'utf8'));
const issues = [];
if (r.entity !== 'biome_wikitext_local_domain_resolution_audit') issues.push('wrong entity');
if (r.summary?.total !== 42) issues.push(`expected total 42 got ${r.summary?.total}`);
if (r.rows?.length !== 42) issues.push(`expected rows 42 got ${r.rows?.length}`);
const allowed = new Set(['evidence_armor_set_single_candidate', 'evidence_armor_set_variant_needs_decision', 'evidence_boss_treasure_bag_projection', 'ambiguous_npc_variant_needs_decision', 'missing_local_entity_needs_backfill', 'unresolved_local_domain_gap']);
const seen = new Set();
for (const row of r.rows ?? []) {
  if (seen.has(row.inputIndex)) issues.push(`duplicate inputIndex ${row.inputIndex}`);
  seen.add(row.inputIndex);
  if (!row.original?.section) issues.push(`row ${row.inputIndex} missing original.section`);
  if (!Array.isArray(row.original?.candidateMatches)) issues.push(`row ${row.inputIndex} missing original.candidateMatches`);
  for (const field of ['itemExactMatches', 'itemLikeMatches', 'npcExactMatches', 'npcLikeMatches', 'armorSetCandidates', 'bossLootCandidates']) {
    if (!Array.isArray(row[field])) issues.push(`row ${row.inputIndex} ${field} is not an array`);
  }
  if (row.evidenceOnly !== true) issues.push(`row ${row.inputIndex} not evidenceOnly`);
  if (row.needsUserDecision !== true) issues.push(`row ${row.inputIndex} not marked for user decision`);
  if (!row.recommendation) issues.push(`row ${row.inputIndex} missing recommendation`);
  if (!allowed.has(row.recommendation)) issues.push(`row ${row.inputIndex} unsupported recommendation ${row.recommendation}`);
}
for (let index = 1; index <= 42; index += 1) {
  if (!seen.has(index)) issues.push(`missing inputIndex ${index}`);
}
console.log(JSON.stringify(r.summary, null, 2));
if (issues.length) throw new Error(issues.join('\n'));
NODE
```

Expected: command exits 0.

## Task 5: Final Handoff Questions

**Files:**
- No writes.

- [ ] **Step 1: Summarize recommendation groups**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('reports/biome-wikitext-local-domain-resolution-audit-2026-06-02.json', 'utf8'));
const groups = new Map();
for (const row of r.rows) {
  const bucket = groups.get(row.recommendation) ?? [];
  bucket.push(`${row.inputIndex}:${row.original?.name ?? 'unknown'}`);
  groups.set(row.recommendation, bucket);
}
for (const [recommendation, rows] of groups) {
  console.log(`\n${recommendation} (${rows.length})`);
  console.log(rows.join(', '));
}
NODE
```

Expected: every one of the 42 rows appears in exactly one group.

- [ ] **Step 2: Ask user for policy decisions**

Present the evidence-backed choices:

- Armor set evidence: choose whether to create a later armor-set relation plan vs expand to specific items.
- Armor set variant evidence: choose base variant only vs all variants vs keep unresolved.
- Boss treasure bag evidence: choose boss-loot projection only vs no biome relation.
- Ambiguous NPC variants: choose canonical/main entity mapping vs keep ambiguous.
- Missing local entities: choose local data backfill vs keep unresolved.

## Validation Commands

```bash
node --test scripts/data/audit/biome-wikitext-unresolved-report.test.mjs scripts/data/audit/biome-wikitext-local-domain-resolution-audit.test.mjs
node --test scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs
```

No service restart is required. No DB write command is allowed in this plan.
