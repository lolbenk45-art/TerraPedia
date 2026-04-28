# NPC Item Relation Complete Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, traceable data chain that links items and NPCs through shop, loot, reward, source-item, and projectile evidence, with unresolved data routed to crawler/backfill/audit outputs instead of silently becoming empty arrays.

**Architecture:** Treat `terria_v1_relation` as the canonical relation layer, sourced from crawler/generated bundles through landing and maint. Projection and local materialization become read models over those canonical facts, and backend/admin UI consume the same relation payloads instead of maintaining separate interpretations.

**Tech Stack:** Node.js ESM data scripts, `node:test`, MySQL/MariaDB via `mysql2`, Flyway SQL migrations, Spring Boot + MyBatis/JdbcTemplate, Maven tests, Nuxt/Vue 3 admin app, `pnpm run check`.

---

## Current Baseline

Verified on `2026-04-29` from read-only agent reviews and local git checks.

- Working tree: branch `feature/project-structure-cleanup`.
- Latest commit at planning time: `6be7f81 feat: complete projectile source backfill and admin display`.
- Untracked existing path: `output/`; keep it out of this task unless a later validation step explicitly needs it.
- Existing relation counts:
  - `terria_v1_maint.maint_item_sources`: `3187`
  - `terria_v1_relation.item_source_facts`: `3187`
  - `terria_v1_relation.item_npc_shop_relations`: `293`
  - `terria_v1_relation.item_npc_loot_relations`: `744`
  - `terria_v1_relation.npc_series_item_relations`: `145`
  - `terria_v1_relation.boss_item_reward_relations`: `64`
- Existing unresolved report:
  - `reports/relation/relation-unresolved-2026-04-28.json`: `17736`
  - `npc_source_unresolved`: `1514`
  - `relation-conflicts-2026-04-28.json`: `0`
- Existing local read model:
  - `terria_v1_local` has core `items`, `npcs`, `projectiles`, and `buffs`.
  - `terria_v1_local` does not currently hold canonical `item_npc_shop_relations`, `item_npc_loot_relations`, `npc_series_item_relations`, or `boss_item_reward_relations`.
- Existing backend/admin consumption:
  - NPC detail returns direct loot, derived loot, buffs, and shop entries.
  - Item detail has a generic item source list.
  - Projectile admin detail already shows source items and source NPCs from the prior milestone.

## Scope

This plan covers the NPC/item relation chain:

- NPC page crawler extraction for shop, loot/drop, combat projectile, and backfill evidence.
- Generated bundle -> landing -> maint ingestion.
- Maint source facts -> canonical relation tables and audit/candidate records.
- Projection JSON for both directions:
  - item -> source NPCs
  - NPC -> loot items, shop items, source items, projectiles
- Local materialization for core projection fields and legacy compatibility tables.
- Backend/admin/public read models.
- Admin UI relation blocks for NPC and item details.
- Dry-run, apply, SQL verification, and commit hygiene.

This plan does not replace the projectile source relation milestone. Bosses are still NPCs for projectile evidence when `combat.projectileId` exists, but boss reward/loot facts remain a separate item reward relation domain.

## Success Criteria

- NPC crawler evidence for shop, loot/drop, and `combat.projectileId` reaches maint without losing structured fields.
- `maint_item_sources` continues to match `item_source_facts` row-for-row after sync, except for planned new source rows that also appear in both layers.
- `item_npc_shop_relations` and `item_npc_loot_relations` remain formal resolved facts; deprecated candidate tables are not revived.
- Missing, ambiguous, polluted, or unresolved NPC/item relation evidence is written to `item_npc_relation_audits` and, when actionable by crawler/backfill, to `maint_backfill_candidates`.
- Projection contains bidirectional JSON:
  - `projection_items.source_npcs_json`
  - `projection_npcs.loot_items_json`
  - `projection_npcs.shop_items_json`
  - `projection_npcs.source_items_json`
  - existing `projection_projectiles.source_items_json`
  - existing `projection_projectiles.source_npcs_json`
- Local materialization writes core projection JSON to `terria_v1_local.items` and `terria_v1_local.npcs`, and writes relation compatibility tables for existing backend readers.
- Backend NPC detail exposes direct loot, projected loot, shop entries, source items, and projectiles in one stable payload.
- Item source APIs expose resolved NPC summaries for drop/shop/source relationships.
- Admin UI renders item/NPC relation blocks with clear empty states and JSON fallback only for malformed or not-yet-mapped raw data.
- Verification commands pass, or any blocker is recorded with command, exit status, and whether it is related to this task.

## Agent Ownership

### Agent A: Crawler, Generated, Landing, Maint

Write scope:

- `data/wiki-crawler/src/domains/npc-parser.mjs`
- `data/wiki-crawler/src/domains/npc-domain.mjs`
- `data/wiki-crawler/src/domains/npc-loot-parser.mjs`
- `data/wiki-crawler/src/domains/npc-shop-normalizer.mjs`
- `data/wiki-crawler/src/domains/backfill-candidate-domain.mjs`
- `data/wiki-crawler/tests/*.test.mjs` for NPC parser/domain/bundle behavior
- `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- `scripts/data/landing/source-dataset-locator.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-landing-to-maint.test.mjs`

Do not edit:

- relation schema or projection scripts owned by Agent B
- backend Java or admin Vue files owned by Agent C
- DB apply scripts beyond maint ingestion

### Agent B: Relation, Projection, Local Materialization

Write scope:

- `scripts/data/relation/relation-schema.mjs`
- `scripts/data/relation/relation-schema.test.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `scripts/data/relation/item-source-relation-processor.test.mjs`
- `scripts/data/relation/secondary-relation-processor.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-maint-to-relation.test.mjs`
- `scripts/data/relation/projection-schema.mjs`
- `scripts/data/relation/projection-schema.test.mjs`
- `scripts/data/relation/projection-sync.mjs`
- `scripts/data/relation/projection-sync.test.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- `scripts/data/relation/replacement-readiness-audit.mjs`
- `scripts/data/relation/replacement-readiness-audit.test.mjs`
- local Flyway migrations for new JSON columns if current local tables lack them

Do not edit:

- crawler parser internals owned by Agent A
- Java controller/UI presentation owned by Agent C

### Agent C: Backend, Admin UI, Public Read Model

Write scope:

- `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- `back/src/main/java/com/terraria/skills/controller/ItemSourceController.java`
- `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
- `back/src/main/java/com/terraria/skills/dto/*`
- `back/src/main/java/com/terraria/skills/entity/Item.java`
- `back/src/main/java/com/terraria/skills/entity/Npc.java`
- `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- `back/src/main/java/com/terraria/skills/service/impl/RelationCompatibilityServiceImpl.java`
- backend tests for NPC, item sources, public aggregate, boss, and compatibility checks
- `data-query-app/pages/entities/[type].vue`
- `data-query-app/components/ItemDetail.vue`
- focused frontend typecheck helpers if needed

Do not edit:

- data crawler and relation processors except for contract field names agreed in this plan

### Agent D: Validation, Backfill, Reporting

Write scope:

- `scripts/data/relation/relation-health-report.mjs`
- `scripts/data/relation/relation-health-report.test.mjs`
- `scripts/data/relation/replacement-readiness-audit.mjs`
- `reports/relation/*` generated outputs from dry-runs
- SQL verification notes under `docs/research/` if results need to be preserved

Do not edit:

- production crawler, relation, backend, or UI code unless a validation script itself needs a small fix
- any DB write target while another agent is running an apply step

## Data Contracts

### Maint Backfill Candidate

`maint_backfill_candidates` is the stable queue for evidence that needs crawler/import/backfill action. It replaces silent empty arrays and report-only gaps.

Required logical fields:

- `candidate_key`: stable hash of domain, entity type, entity key, missing field, and evidence text.
- `domain`: `npc_item_relation`, `npc_projectile_relation`, `item_source_relation`, or `boss_reward_relation`.
- `entity_type`: `npc`, `item`, `boss`, or `projectile`.
- `entity_internal_name`: internal name when available.
- `entity_source_id`: source/game id when available.
- `missing_field`: `shop`, `loot`, `drop`, `projectileId`, `sourceRef`, `itemRef`, or `npcRef`.
- `recommended_action`: `crawl_npc_page`, `crawl_item_page`, `crawl_boss_page`, `resolve_alias`, or `manual_review`.
- `evidence_json`: JSON array or object with source page, section, row text, and parser reason.
- `status`: `open`, `promoted`, `rejected`, or `stale`.
- `created_at` and `updated_at`.

### Item NPC Relation Audit

`item_npc_relation_audits` records why a raw fact did or did not become a formal relation.

Required logical fields:

- `audit_key`
- `relation_kind`: `shop`, `loot`, `reward`, `source_item`
- `source_fact_key`
- `item_internal_name`
- `item_name`
- `source_ref_name`
- `source_ref_normalized`
- `candidate_npc_internal_name`
- `audit_status`: `resolved`, `unresolved`, `ambiguous`, `polluted`, `promoted`, `rejected`
- `reason_code`: `npc_source_unresolved`, `npc_source_ambiguous`, `source_text_polluted`, `item_unresolved`, `unsupported_source_type`, or `resolved_relation`
- `evidence_json`
- trace columns matching the relation schema conventions

### Projection JSON Shapes

`projection_items.source_npcs_json`:

```json
[
  {
    "relationType": "drop",
    "npcId": 10,
    "npcSourceId": 4,
    "npcInternalName": "Zombie",
    "npcName": "Zombie",
    "npcNameZh": "Zombie",
    "npcImageUrl": "/assets/npcs/zombie.png",
    "chanceText": "2%",
    "quantityText": "1",
    "conditionText": "Expert Mode",
    "sourceFactKey": "item-source:drop:npc:zombie:shackle"
  }
]
```

`projection_npcs.loot_items_json`:

```json
[
  {
    "relationType": "loot",
    "itemId": 25,
    "itemSourceId": 216,
    "itemInternalName": "Shackle",
    "itemName": "Shackle",
    "itemNameZh": "Shackle",
    "itemImageUrl": "/assets/items/shackle.png",
    "chanceText": "2%",
    "quantityText": "1",
    "conditionText": "Expert Mode",
    "sourceFactKey": "item-source:drop:npc:zombie:shackle"
  }
]
```

`projection_npcs.shop_items_json`:

```json
[
  {
    "relationType": "shop",
    "itemId": 105,
    "itemSourceId": 282,
    "itemInternalName": "LesserHealingPotion",
    "itemName": "Lesser Healing Potion",
    "itemNameZh": "Lesser Healing Potion",
    "itemImageUrl": "/assets/items/lesser_healing_potion.png",
    "priceText": "3 silver",
    "conditionText": "Always",
    "sourceFactKey": "item-source:shop:npc:merchant:lesser-healing-potion"
  }
]
```

`projection_npcs.source_items_json`:

```json
[
  {
    "relationType": "summon",
    "itemId": 43,
    "itemSourceId": 560,
    "itemInternalName": "SuspiciousLookingEye",
    "itemName": "Suspicious Looking Eye",
    "itemNameZh": "Suspicious Looking Eye",
    "itemImageUrl": "/assets/items/suspicious_looking_eye.png",
    "conditionText": "Summons this boss",
    "sourceFactKey": "npc-source-item:boss:eye-of-cthulhu"
  }
]
```

Empty JSON arrays are valid only after a parser, relation processor, or audit has recorded that no evidence exists. Unknown data must become an audit or backfill candidate.

## Milestone M0: Baseline, Contracts, and Red Tests

Owner: coordinator with Agent D support.

Files:

- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/relation/projection-schema.test.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Create: `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`

- [ ] Run git and baseline checks.

```powershell
git status --short
git log -1 --oneline
git branch -vv
git worktree list
```

Expected:

- branch is not `main` or `master`
- unrelated `output/` remains untracked and unstaged
- latest commit is recorded in the run notes

- [ ] Record current DB baseline before writes.

```powershell
@'
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'127.0.0.1', port:3306, user:'root', password:'root'});
for (const sql of [
  "SELECT COUNT(*) AS c FROM terria_v1_maint.maint_item_sources",
  "SELECT COUNT(*) AS c FROM terria_v1_relation.item_source_facts",
  "SELECT COUNT(*) AS c FROM terria_v1_relation.item_npc_shop_relations",
  "SELECT COUNT(*) AS c FROM terria_v1_relation.item_npc_loot_relations",
  "SELECT COUNT(*) AS c FROM terria_v1_relation.npc_series_item_relations",
  "SELECT COUNT(*) AS c FROM terria_v1_relation.boss_item_reward_relations"
]) {
  const [rows] = await conn.query(sql);
  console.log(sql, rows[0].c);
}
await conn.end();
'@ | node --input-type=module
```

Expected:

- counts are printed
- if the DB is down, start the local stack before continuing

- [ ] Write red schema tests for audit and projection fields.

Expected test additions:

- `relation-schema.test.mjs` asserts a create statement for `item_npc_relation_audits`.
- `relation-schema.test.mjs` asserts deprecated `item_npc_shop_candidates` and `item_npc_loot_candidates` are not used as active output targets.
- `projection-schema.test.mjs` asserts `projection_items.source_npcs_json`.
- `projection-schema.test.mjs` asserts `projection_npcs.loot_items_json`, `projection_npcs.shop_items_json`, and `projection_npcs.source_items_json`.
- `sync-relation-to-local-compat-tables.test.mjs` asserts dry-run SQL for `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, and `npc_shop_conditions`.

- [ ] Run red tests.

```powershell
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

Expected:

- tests fail because the new schema fields and local relation sync script do not exist yet

## Milestone M1: NPC Crawler and Generated Bundle

Owner: Agent A.

Files:

- Modify: `data/wiki-crawler/src/domains/npc-parser.mjs`
- Modify: `data/wiki-crawler/src/domains/npc-domain.mjs`
- Create: `data/wiki-crawler/src/domains/npc-loot-parser.mjs`
- Create: `data/wiki-crawler/src/domains/npc-shop-normalizer.mjs`
- Create: `data/wiki-crawler/src/domains/backfill-candidate-domain.mjs`
- Create: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Modify tests under `data/wiki-crawler/tests/`

- [ ] Write red parser tests for NPC shop and loot evidence.

Add fixtures where:

- an NPC page has a shop table with item name, price, and condition
- an NPC page has a drop/loot table with item name, chance, quantity, and mode condition
- an NPC page has no shop or loot section but has enough page metadata to create an open backfill candidate
- an NPC page has `idprojectile` or `id projectile`, and `combat.projectileId` survives standardized output

Run:

```powershell
node --test data/wiki-crawler/tests/npc-parser.test.mjs data/wiki-crawler/tests/build-npc-standardized-bridge.test.mjs data/wiki-crawler/tests/run-npc-standardized-bridge.test.mjs
```

Expected:

- new tests fail on missing shop/loot/backfill fields or missing bundle output

- [ ] Implement `npc-shop-normalizer.mjs`.

Required exported function:

```js
export function normalizeNpcShopRows(rows, context = {}) {
  return rows.map((row, index) => ({
    relationType: 'shop',
    itemName: row.itemName ?? row.item ?? null,
    priceText: row.priceText ?? row.price ?? null,
    conditionText: row.conditionText ?? row.condition ?? null,
    npcInternalName: context.npcInternalName ?? null,
    npcName: context.npcName ?? null,
    sourceSection: row.sourceSection ?? 'shop',
    sourceRowIndex: index,
    raw: row
  })).filter((row) => row.itemName);
}
```

- [ ] Implement `npc-loot-parser.mjs`.

Required exported function:

```js
export function normalizeNpcLootRows(rows, context = {}) {
  return rows.map((row, index) => ({
    relationType: 'loot',
    itemName: row.itemName ?? row.item ?? null,
    chanceText: row.chanceText ?? row.chance ?? null,
    quantityText: row.quantityText ?? row.quantity ?? null,
    conditionText: row.conditionText ?? row.condition ?? null,
    npcInternalName: context.npcInternalName ?? null,
    npcName: context.npcName ?? null,
    sourceSection: row.sourceSection ?? 'drops',
    sourceRowIndex: index,
    raw: row
  })).filter((row) => row.itemName);
}
```

- [ ] Implement `backfill-candidate-domain.mjs`.

Required behavior:

- build stable `candidateKey`
- emit `domain='npc_item_relation'` for missing shop/loot/drop evidence
- emit `domain='npc_projectile_relation'` for missing combat projectile evidence when the page has combat sections but no projectile id
- attach source URL, parser section, and row text in `evidenceJson`

- [ ] Wire parser output into standardized NPC records.

Required shape in generated NPC records:

```json
{
  "wikiCrawler": {
    "shop": [],
    "loot": [],
    "combat": {
      "projectileId": 24
    },
    "backfillCandidates": []
  }
}
```

- [ ] Build `npc_item_relations_bundle_raw`.

`scripts/data/fetch/build-npc-item-relations-bundle.mjs` must produce:

```json
{
  "schemaVersion": 1,
  "source": "wiki-crawler:npc",
  "records": [
    {
      "recordKey": "npc-item:merchant:shop:lesser-healing-potion",
      "relationType": "shop",
      "npcInternalName": "Merchant",
      "npcName": "Merchant",
      "itemName": "Lesser Healing Potion",
      "priceText": "3 silver",
      "conditionText": "Always",
      "sourceUrl": "https://terraria.wiki.gg/wiki/Merchant",
      "raw": {}
    }
  ],
  "backfillCandidates": []
}
```

- [ ] Run crawler tests green.

```powershell
node --test data/wiki-crawler/tests/npc-parser.test.mjs data/wiki-crawler/tests/build-npc-standardized-bridge.test.mjs data/wiki-crawler/tests/run-npc-standardized-bridge.test.mjs
```

Expected:

- all selected crawler tests pass

## Milestone M2: Landing and Maint Ingestion

Owner: Agent A, with Agent D reviewing dry-run reports.

Files:

- Modify: `scripts/data/landing/source-dataset-locator.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] Write red maint tests for generated NPC item bundles.

Required test cases:

- `source-dataset-locator.mjs` returns `npc_item_relations_bundle_raw` when the generated file exists.
- `sync-landing-to-maint.mjs` accepts `payload.records` from the generated NPC item bundle.
- shop records become `maint_item_sources` rows with `source_type='shop'` and `source_ref_type='npc'`.
- loot records become `maint_item_sources` rows with `source_type='drop'` and `source_ref_type='npc'`.
- `wikiCrawler.combat.projectileId` remains in `maint_npcs.raw_json`.
- `backfillCandidates` become `maint_backfill_candidates` rows instead of disappearing.

Run:

```powershell
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected:

- tests fail on missing dataset type, missing payload shape support, or missing candidate handling

- [ ] Extend dataset locator.

Add stable dataset keys:

- `npc_item_relations_bundle_raw`
- `boss_loot_bundle_raw`
- `backfill_candidates_raw`

Each key must resolve from generated outputs before falling back to older raw paths.

- [ ] Extend maint ingestion.

Required mapping for `npc_item_relations_bundle_raw.records`:

- `recordKey` -> maint source key
- `itemName` -> item name fields
- `relationType='shop'` -> `source_type='shop'`
- `relationType='loot'` -> `source_type='drop'`
- `npcInternalName` or `npcName` -> `source_ref_name`
- `source_ref_type='npc'`
- chance, price, quantity, condition, and source URL preserved in `raw_json`

- [ ] Add or extend maint candidate table handling.

If `maint_backfill_candidates` does not exist in the maint schema helper, create it with the fields from the data contract section. If it already exists, add only missing columns and preserve existing rows.

- [ ] Run maint tests green.

```powershell
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected:

- tests pass

- [ ] Run maint dry-run for NPC scope.

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs
```

Expected:

- summary includes NPC standardized records
- summary includes `npc_item_relations_bundle_raw` when the generated file exists
- summary includes `maint_backfill_candidates` planned inserts or upserts

## Milestone M3: Canonical Relation Layer

Owner: Agent B.

Files:

- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] Implement red tests for audits and formal relation fields.

Required assertions:

- resolved shop facts produce `item_npc_shop_relations`
- resolved loot facts produce `item_npc_loot_relations`
- unresolved NPC refs produce `item_npc_relation_audits` with `audit_status='unresolved'`
- ambiguous refs produce `audit_status='ambiguous'`
- polluted refs produce `audit_status='polluted'`
- formal relation rows include `source_fact_key`, `item_internal_name`, `item_name`, `npc_internal_name`, `npc_name`, `review_status`, and source evidence JSON
- candidate tables marked deprecated are not written by `sync-maint-to-relation`

Run:

```powershell
node --test scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected:

- tests fail until audits and field propagation are implemented

- [ ] Add `item_npc_relation_audits` to relation schema.

Required table columns:

```sql
`audit_key` VARCHAR(255) NOT NULL,
`relation_kind` VARCHAR(32) NOT NULL,
`source_fact_key` VARCHAR(255),
`item_internal_name` VARCHAR(255),
`item_name` VARCHAR(255),
`source_ref_name` VARCHAR(255),
`source_ref_normalized` VARCHAR(255),
`candidate_npc_internal_name` VARCHAR(255),
`audit_status` VARCHAR(32) NOT NULL,
`reason_code` VARCHAR(64) NOT NULL,
`evidence_json` LONGTEXT,
`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
PRIMARY KEY (`audit_key`)
```

- [ ] Keep formal relations as canonical output.

Rules:

- `item_npc_shop_relations` receives only resolved shop facts.
- `item_npc_loot_relations` receives only resolved loot/drop facts.
- unresolved/ambiguous/polluted facts go to `item_npc_relation_audits`.
- deprecated `item_npc_shop_candidates` and `item_npc_loot_candidates` are not inserted.
- if a human review queue is required later, add `item_npc_relation_candidates`; do not reuse deprecated names.

- [ ] Extend processor output.

Required returned object fields:

```js
{
  itemSourceFacts: [],
  itemSourceDetails: [],
  itemNpcShopRelations: [],
  itemNpcLootRelations: [],
  itemNpcRelationAudits: [],
  unresolvedIssues: [],
  conflictIssues: []
}
```

- [ ] Extend sync apply order.

Required apply order:

1. schema ensure
2. `item_source_facts`
3. `item_source_details`
4. formal relation tables
5. `item_npc_relation_audits`
6. projection payload build
7. report writes

- [ ] Run relation processor tests green.

```powershell
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected:

- all selected relation tests pass

## Milestone M4: Projection and Local Materialization

Owner: Agent B.

Files:

- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Modify: `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- Create: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.test.mjs`
- Create Flyway migration for local item/NPC JSON fields if needed

- [ ] Write red projection tests.

Required fixture:

- one NPC sells two items
- the same NPC drops one item
- one item is dropped by two NPCs
- one NPC has one source/summon item
- one projectile has source NPCs and source items from the prior projectile chain

Required assertions:

- `projection_items.source_npcs_json` contains both drop/shop summaries grouped by item
- `projection_npcs.loot_items_json` contains drop items
- `projection_npcs.shop_items_json` contains shop items
- `projection_npcs.source_items_json` contains source/summon/banner/catch items where evidence exists
- projectile source JSON remains unchanged by item/NPC projection work

Run:

```powershell
node --test scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected:

- tests fail until new JSON fields and aggregation are implemented

- [ ] Extend projection schema.

Add:

- `projection_items.source_npcs_json LONGTEXT`
- `projection_npcs.loot_items_json LONGTEXT`
- `projection_npcs.shop_items_json LONGTEXT`
- `projection_npcs.source_items_json LONGTEXT`

- [ ] Extend `buildProjectionPayload()`.

Inputs consumed:

- `itemNpcShopRelations`
- `itemNpcLootRelations`
- `npcSeriesItemRelations`
- `bossItemRewardRelations`
- existing projectile source relations

Output rules:

- sort arrays by display name, then internal name, then `sourceFactKey`
- dedupe by relation type, item internal name, NPC internal name, and `sourceFactKey`
- preserve chance, quantity, price, condition, source fact key, and image URL
- default to `[]` only when no relation rows and no audit requires crawler/backfill action

- [ ] Extend local core materialization tests.

Required assertions:

- `sync-projection-to-local-core-tables.mjs` includes new item and NPC JSON columns in `columnsToSync` when local columns exist.
- insert SQL selects the new JSON columns from projection tables.
- missing local columns are reported in dry-run and do not crash `apply=false`.

- [ ] Create relation-to-local compatibility sync.

`sync-relation-to-local-compat-tables.mjs` must:

- support `--apply=false`
- support `--apply=true`
- accept `--local-database`
- accept `--relation-database`
- truncate and rebuild only the compatibility relation tables it owns after dry-run approval
- write `item_acquisition_sources` from `item_source_facts`
- write `npc_loot_entries` from `item_npc_loot_relations`
- write `npc_shop_entries` from `item_npc_shop_relations`
- write `npc_shop_conditions` from shop relation condition JSON when conditions exist
- produce row counts and sample rows in dry-run output

- [ ] Extend readiness audit.

Required checks:

- `item_source_facts` count equals `maint_item_sources`
- formal shop relation orphan count is `0`
- formal loot relation orphan count is `0`
- shop relation item and NPC resolution missing counts are `0`
- loot relation item and NPC resolution missing counts are `0`
- `projection_items.source_npcs_json` non-empty count is greater than `0`
- `projection_npcs.loot_items_json` non-empty count is greater than `0`
- `projection_npcs.shop_items_json` non-empty count is greater than `0`
- existing projectile source JSON checks remain present

- [ ] Run projection/local tests green.

```powershell
node --test scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-projection-to-local-core-tables.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs scripts/data/relation/replacement-readiness-audit.test.mjs
```

Expected:

- all selected tests pass

## Milestone M5: Backend Relation Read Models

Owner: Agent C.

Files:

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/ItemSourceController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- Modify: `back/src/main/java/com/terraria/skills/entity/Item.java`
- Modify: `back/src/main/java/com/terraria/skills/entity/Npc.java`
- Modify: DTO and service files as needed for the payloads below
- Modify backend tests under `back/src/test/java/com/terraria/skills/`

- [ ] Write red backend tests for NPC detail.

Required assertions in `AdminNpcControllerTest`:

- detail returns `lootEntries`
- detail returns `derivedLootEntries`
- detail returns `shopEntries`
- detail returns `sourceItems`
- detail returns `projectiles`
- list returns `shopEntryCount`
- list returns `projectileCount`
- empty relation arrays are present as `[]`, not omitted

Run:

```powershell
cd back
mvn "-Dtest=AdminNpcControllerTest" test
```

Expected:

- tests fail until new fields and counts are added

- [ ] Write red backend tests for item source resolution.

Required assertions:

- `GET /items/{id}/sources` returns `sourceNpc` when `source_ref_type='npc'`
- `sourceNpc` contains `id`, `gameId`, `internalName`, `name`, `nameZh`, and `imageUrl`
- shop source and drop source are distinguishable by `sourceType`

Run:

```powershell
cd back
mvn "-Dtest=ItemSourceControllerTest" test
```

Expected:

- tests fail until resolved NPC summaries are implemented

- [ ] Write red backend tests for public NPC aggregate.

Required assertions:

- aggregate can return both direct loot and derived/projected loot
- aggregate includes `shopEntries`
- aggregate includes `projectiles`
- aggregate includes `sourceItems`
- module status differentiates empty verified data from missing data

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcAggregateControllerTest" test
```

Expected:

- tests fail until public aggregate fields are implemented

- [ ] Extend NPC detail payload.

Required shape:

```json
{
  "loot": {
    "direct": [],
    "projected": []
  },
  "lootEntries": [],
  "derivedLootEntries": [],
  "shopEntries": [],
  "sourceItems": [],
  "projectiles": []
}
```

Compatibility rule:

- keep existing `lootEntries` and `derivedLootEntries`
- add the nested `loot` object for the new admin UI and future public clients

- [ ] Extend item source payload.

Required shape for NPC source rows:

```json
{
  "sourceType": "drop",
  "sourceRefType": "npc",
  "sourceRefName": "Zombie",
  "sourceNpc": {
    "id": 10,
    "gameId": 3,
    "internalName": "Zombie",
    "name": "Zombie",
    "nameZh": "Zombie",
    "imageUrl": "/assets/npcs/zombie.png"
  }
}
```

- [ ] Extend boss read model without conflating domains.

Rules:

- boss reward/loot continues to read `boss_item_reward_relations` and compatible local loot rows
- boss projectile source uses the NPC projectile relation chain because bosses are NPCs in the source data
- Admin boss detail may show derived drop projection when available, but it must label it separately from curated boss rewards

- [ ] Extend relation compatibility checks.

Required checks:

- `item_acquisition_sources` row count from local compatibility sync
- `npc_loot_entries` row count from local compatibility sync
- `npc_shop_entries` row count from local compatibility sync
- projectile `source_items_json/source_npcs_json` non-empty count
- item/NPC projection JSON non-empty counts

- [ ] Run backend tests green.

```powershell
cd back
mvn "-Dtest=AdminNpcControllerTest,PublicNpcAggregateControllerTest,ItemSourceControllerTest,AdminProjectileControllerTest,RelationCompatibilityServiceImplTest" test
```

Expected:

- all selected backend tests pass

## Milestone M6: Admin UI Relation Display

Owner: Agent C.

Files:

- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/components/ItemDetail.vue`
- Add focused typecheck helpers only if needed under `data-query-app/types/` or `data-query-app/tests/`

- [ ] Write or update UI type expectations before template changes.

Required fields:

- NPC detail supports `loot.direct`, `loot.projected`, `shopEntries`, `sourceItems`, and `projectiles`.
- item detail supports grouped source rows by `drop`, `shop`, `worldgen`, `mining`, `boss`, and unresolved source types.
- projectile detail keeps existing source item/NPC rendering.

Run:

```powershell
cd data-query-app
pnpm run check
```

Expected:

- check fails if the new fields are referenced without types or helper guards

- [ ] Add NPC detail relation blocks.

Required UI blocks:

- direct loot
- projected/raw source loot
- shop items
- source/summon/banner/catch items
- projectiles fired by this NPC

Rendering rules:

- arrays render compact item/NPC/projectile summaries with image, name, relation type, and condition/chance/price text
- empty verified arrays show a clear empty state
- raw JSON fallback is shown only when the parsed array is empty but the corresponding JSON string has content
- no instructional text about how the feature works appears in the UI

- [ ] Add NPC list counts.

Required counts:

- direct loot count
- projected loot count
- shop entry count
- projectile count

- [ ] Group item source display.

Required groups:

- dropped by NPC
- sold by NPC
- boss reward
- world generation or mining
- other source facts
- unresolved or raw fallback

NPC source rows must render resolved NPC cards when `sourceNpc` exists.

- [ ] Run admin typecheck green.

```powershell
cd data-query-app
pnpm run check
```

Expected:

- typecheck passes

## Milestone M7: Backfill, Dry-Run, Apply, and SQL Verification

Owner: Agent D coordinates. Agents A/B/C are available only for fixes in their owned files.

Write sequencing:

- Do not run two DB apply scripts in parallel.
- Do not run crawler/maint apply while relation apply is running.
- Dry-runs may run in parallel only when they target separate databases or read-only paths.

- [ ] Start local stack.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

Expected:

- MySQL is reachable
- backend Flyway migrations are applied

- [ ] Generate or refresh NPC item relation bundle.

```powershell
node scripts/data/fetch/build-npc-item-relations-bundle.mjs --output=data/generated/npc-item-relations.bundle.json
```

Expected:

- output contains `records`
- output contains `backfillCandidates`
- generated file path matches `source-dataset-locator.mjs`

- [ ] Maint dry-run.

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=npcs
```

Expected:

- planned NPC maint changes are printed
- planned `maint_item_sources` rows from NPC relation bundle are printed
- planned `maint_backfill_candidates` rows are printed

- [ ] Maint apply only after dry-run review.

```powershell
node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=npcs
```

Expected:

- apply completes
- updated maint counts are printed or queryable

- [ ] Relation dry-run.

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- dry-run reports item source fact count
- dry-run reports shop relation count
- dry-run reports loot relation count
- dry-run reports audit count
- dry-run writes report files under `reports/relation/`

- [ ] Review relation reports.

Open or inspect:

```powershell
Get-ChildItem reports\relation -Filter "relation-audit-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-ChildItem reports\relation -Filter "relation-unresolved-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-ChildItem reports\relation -Filter "relation-conflicts-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

Expected:

- conflicts count is `0`
- unresolved NPC source rows are represented as audit/candidate records
- resolved shop and loot counts do not drop below baseline unless the report explains each removed fact

- [ ] Relation apply.

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --create-database=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- apply succeeds
- latest run status is `succeeded`

- [ ] Projection/local core dry-run.

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

Expected:

- item, NPC, and projectile domains are included
- new JSON columns are listed when local schema has them
- missing local columns are reported clearly

- [ ] Projection/local core apply.

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,projectiles
```

Expected:

- apply succeeds
- local item/NPC/projectile JSON fields are queryable

- [ ] Local compatibility relation dry-run.

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- planned row counts are printed for `item_acquisition_sources`, `npc_loot_entries`, `npc_shop_entries`, and `npc_shop_conditions`

- [ ] Local compatibility relation apply.

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- apply succeeds
- backend legacy readers see refreshed rows

- [ ] SQL verification.

```sql
SELECT source_type, source_ref_type, COUNT(*)
FROM terria_v1_maint.maint_item_sources
GROUP BY source_type, source_ref_type;

SELECT source_type, source_ref_type, review_status, COUNT(*)
FROM terria_v1_relation.item_source_facts
GROUP BY source_type, source_ref_type, review_status;

SELECT review_status, COUNT(*)
FROM terria_v1_relation.item_npc_shop_relations
GROUP BY review_status;

SELECT review_status, COUNT(*)
FROM terria_v1_relation.item_npc_loot_relations
GROUP BY review_status;

SELECT audit_status, reason_code, COUNT(*)
FROM terria_v1_relation.item_npc_relation_audits
GROUP BY audit_status, reason_code;

SELECT COUNT(*)
FROM terria_v1_relation.item_npc_shop_relations r
LEFT JOIN terria_v1_relation.item_source_facts f
  ON f.record_key = r.source_fact_key
WHERE f.record_key IS NULL;

SELECT COUNT(*)
FROM terria_v1_relation.item_npc_loot_relations r
LEFT JOIN terria_v1_relation.item_source_facts f
  ON f.record_key = r.source_fact_key
WHERE f.record_key IS NULL;

SELECT COUNT(*)
FROM terria_v1_relation.projection_items
WHERE source_npcs_json <> '[]';

SELECT COUNT(*)
FROM terria_v1_relation.projection_npcs
WHERE loot_items_json <> '[]'
   OR shop_items_json <> '[]'
   OR source_items_json <> '[]';

SELECT id, internal_name, source_npcs_json
FROM terria_v1_local.items
WHERE source_npcs_json <> '[]'
LIMIT 20;

SELECT id, internal_name, loot_items_json, shop_items_json, source_items_json
FROM terria_v1_local.npcs
WHERE loot_items_json <> '[]'
   OR shop_items_json <> '[]'
   OR source_items_json <> '[]'
LIMIT 20;
```

Expected:

- shop relation orphan count is `0`
- loot relation orphan count is `0`
- projection JSON non-empty counts are greater than `0`
- local JSON sample queries return rows after apply

- [ ] Run readiness audit.

```powershell
node scripts/data/relation/replacement-readiness-audit.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
```

Expected:

- report includes item/NPC relation checks
- report includes existing projectile source checks
- any failing check has table, field, count, and sample keys

## Milestone M8: Full Verification and Commit

Owner: coordinator.

- [ ] Run crawler and maint tests.

```powershell
node --test data/wiki-crawler/tests/npc-parser.test.mjs data/wiki-crawler/tests/build-npc-standardized-bridge.test.mjs data/wiki-crawler/tests/run-npc-standardized-bridge.test.mjs
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected:

- tests pass

- [ ] Run relation tests.

```powershell
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/secondary-relation-processor.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-projection-to-local-core-tables.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs scripts/data/relation/replacement-readiness-audit.test.mjs
```

Expected:

- tests pass

- [ ] Run backend tests.

```powershell
cd back
mvn "-Dtest=AdminNpcControllerTest,PublicNpcAggregateControllerTest,ItemSourceControllerTest,AdminProjectileControllerTest,RelationCompatibilityServiceImplTest" test
```

Expected:

- tests pass

- [ ] Run admin UI check.

```powershell
cd data-query-app
pnpm run check
```

Expected:

- check passes

- [ ] Run final git scope checks.

```powershell
git status --short
git diff --cached --stat
```

Expected:

- only files from this plan are modified or staged
- generated reports are included only if they are useful handoff evidence
- unrelated `output/` remains unstaged

- [ ] Commit after staged scope review.

```powershell
git add docs/superpowers/plans/2026-04-29-npc-item-relation-complete-chain.md
git add data/wiki-crawler/src/domains/npc-parser.mjs data/wiki-crawler/src/domains/npc-domain.mjs data/wiki-crawler/src/domains/npc-loot-parser.mjs data/wiki-crawler/src/domains/npc-shop-normalizer.mjs data/wiki-crawler/src/domains/backfill-candidate-domain.mjs
git add data/wiki-crawler/tests/npc-parser.test.mjs data/wiki-crawler/tests/build-npc-standardized-bridge.test.mjs data/wiki-crawler/tests/run-npc-standardized-bridge.test.mjs
git add scripts/data/fetch/build-npc-item-relations-bundle.mjs scripts/data/landing/source-dataset-locator.mjs scripts/data/maint/sync-landing-to-maint.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
git add scripts/data/relation/relation-schema.mjs scripts/data/relation/relation-schema.test.mjs scripts/data/relation/item-source-relation-processor.mjs scripts/data/relation/item-source-relation-processor.test.mjs scripts/data/relation/secondary-relation-processor.mjs scripts/data/relation/sync-maint-to-relation.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
git add scripts/data/relation/projection-schema.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-projection-to-local-core-tables.mjs scripts/data/relation/sync-projection-to-local-core-tables.test.mjs scripts/data/relation/sync-relation-to-local-compat-tables.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
git add scripts/data/relation/replacement-readiness-audit.mjs scripts/data/relation/replacement-readiness-audit.test.mjs scripts/data/relation/relation-health-report.mjs scripts/data/relation/relation-health-report.test.mjs
git add back/src/main/java/com/terraria/skills/controller/AdminNpcController.java back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java back/src/main/java/com/terraria/skills/controller/AdminBossController.java back/src/main/java/com/terraria/skills/controller/ItemSourceController.java back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java
git add back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java back/src/main/java/com/terraria/skills/service/impl/RelationCompatibilityServiceImpl.java back/src/main/java/com/terraria/skills/entity/Item.java back/src/main/java/com/terraria/skills/entity/Npc.java
git add back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java back/src/test/java/com/terraria/skills/controller/ItemSourceControllerTest.java back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java back/src/test/java/com/terraria/skills/service/RelationCompatibilityServiceImplTest.java
git add 'data-query-app/pages/entities/[type].vue' data-query-app/components/ItemDetail.vue
git diff --cached --stat
git commit -m "feat: complete npc item relation chain"
```

Expected:

- commit succeeds
- commit message describes the completed behavior

## Multi-Agent Execution Order

Use parallel work only where write boundaries are disjoint.

1. M0 is coordinator-led and serial because it defines contracts.
2. M1 and M3 may start in parallel after M0 red tests exist:
   - Agent A owns crawler/maint tests and implementation.
   - Agent B owns relation schema/processor tests and implementation.
3. M2 depends on M1 parser/bundle output.
4. M4 depends on M3 relation payload shape.
5. M5 can begin with red backend tests after M4 JSON contract is written, but implementation should wait for final field names.
6. M6 begins after M5 payload fields are stable.
7. M7 is serial for DB writes.
8. M8 is serial for full verification and commit.

## Non-Negotiable Guards

- Do not turn unresolved facts into silent empty arrays.
- Do not revive deprecated `item_npc_shop_candidates` or `item_npc_loot_candidates`.
- Do not treat boss reward relations as projectile relations.
- Do not run two apply scripts against the same DB at the same time.
- Do not claim completion without fresh command output.
- Do not stage unrelated `output/` content.
- Do not use `git add .`.

## Boss and Projectile Clarification

Bosses are NPCs in the source domain. A boss can have projectile evidence if the crawler extracts `wikiCrawler.combat.projectileId` or equivalent structured combat data from its NPC page. That evidence belongs in `npc_projectile_relations` and then in `projection_projectiles.source_npcs_json`.

Boss item rewards are a different relation path. They belong in `boss_item_reward_relations`, optionally in NPC/item source projections, and in boss/admin reward displays. They should not be used to infer projectile usage.

## Decision Addendum

These choices are fixed for implementation:

- DB columns use `snake_case`; generated JSON, projection JSON object keys, and backend API payloads use `camelCase`.
- Generated NPC bundle record keys are `recordKey`, `relationType`, `npcInternalName`, `npcName`, `itemName`, `priceText`, `chanceText`, `quantityText`, `conditionText`, `sourceUrl`, `sourceSection`, `sourceRowIndex`, and `raw`.
- `relationType='shop'` remains shop. Crawler loot maps to maint and relation `source_type='drop'`. Projection uses `drop` from the item perspective and `loot` from the NPC perspective.
- Projection JSON columns are `projection_items.source_npcs_json`, `projection_npcs.loot_items_json`, `projection_npcs.shop_items_json`, and `projection_npcs.source_items_json`.
- Projection JSON object keys are `relationType`, `itemId`, `itemSourceId`, `itemInternalName`, `itemName`, `itemNameZh`, `itemImageUrl`, `npcId`, `npcSourceId`, `npcInternalName`, `npcName`, `npcNameZh`, `npcImageUrl`, `chanceText`, `quantityText`, `priceText`, `conditionText`, and `sourceFactKey`.
- Backend NPC detail payload fields are `loot`, `loot.direct`, `loot.projected`, `lootEntries`, `derivedLootEntries`, `shopEntries`, `sourceItems`, `projectiles`, `lootItemsJson`, `shopItemsJson`, and `sourceItemsJson`.
- Backend NPC list count fields are `lootEntryCount`, `derivedLootEntryCount`, `shopEntryCount`, and `projectileCount`.
- Backend item source payload uses `sourceType`, `sourceRefType`, `sourceRefName`, and `sourceNpc`. `sourceNpc` contains exactly `id`, `gameId`, `internalName`, `name`, `nameZh`, and `imageUrl`.
- Local entity fields are `Item.sourceNpcsJson`, `Npc.lootItemsJson`, `Npc.shopItemsJson`, and `Npc.sourceItemsJson`.
- `maint_backfill_candidates` is owned by maint sync. Relation sync must not mutate the maint queue; it writes `item_npc_relation_audits` and report/export candidate payloads only.
- `maint_backfill_candidates` minimal DB fields are `candidate_key`, `domain`, `entity_type`, `entity_internal_name`, `entity_source_id`, `missing_field`, `recommended_action`, `evidence_json`, `status`, `created_at`, and `updated_at`.
- Generated candidate JSON keys are `candidateKey`, `domain`, `entityType`, `entityInternalName`, `entitySourceId`, `missingField`, `recommendedAction`, `evidenceJson`, and `status`.
- Local compatibility relation tables are rebuilt by standalone `sync-relation-to-local-compat-tables.mjs`; do not fold this into `sync-projection-to-local-core-tables.mjs`.
- Existing projectile admin payload fields stay unchanged: `sourceItemsJson`, `sourceNpcsJson`, `sourceItems`, and `sourceNpcs`.
