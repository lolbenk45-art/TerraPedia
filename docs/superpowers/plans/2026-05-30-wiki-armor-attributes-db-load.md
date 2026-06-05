# Wiki Armor Attributes Database Load Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely load wiki-sourced armor-piece attributes from `盔甲属性表` into the local TerraPedia databases so item detail APIs can return per-piece fields such as `神圣面具` defense `24` and item-owned equipment bonuses.

**Architecture:** The committed implementation already parses wiki API page content and projects armor attribute rows. This plan closes the remaining database-load path: register the new landing dataset, fetch the wiki source, import only the armor attribute landing row, sync `maint`, sync `relation/projection`, smoke the public API, then restart/verify the local stack if runtime services need fresh data.

**Tech Stack:** Node data scripts, MySQL local databases (`terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`), Spring Boot public item API, Nuxt item detail UI.

---

## Scope Lock

In scope:

- Local database load only unless the operator explicitly changes the target database.
- Source fetch: `scripts/data/fetch/fetch-wiki-armor-attributes.mjs`.
- Landing dataset: `armor_attributes_raw`.
- Maint table: `terria_v1_maint.maint_armor_attribute_rows`.
- Relation tables: `terria_v1_relation.relation_armor_attribute_rows`, `terria_v1_relation.relation_equipment_effect_attributes`.
- Projection tables: `terria_v1_relation.projection_item_armor_attributes`, `terria_v1_relation.projection_equipment_effect_attributes`.
- Public smoke: `/public/items/{id}/armor-attributes` and `/public/items/{id}/equipment-effects`.

Out of scope:

- Production database writes.
- Re-crawling item pages.
- Replacing armor set data.
- Full public page redesign.
- Manual item mapping such as `神圣面具 -> HallowedMask`.

## Pre-Flight Facts

- Current implementation commit: `a72acb3 feat: add wiki armor attribute data chain` on branch `feat/wiki-armor-attributes-chain-2026-05-30`.
- Verified live wiki smoke fetched `230` rows from `盔甲属性表`.
- Verified sample row: `神圣面具`, `sectionCode=hardmode`, `slotGroup=head`, `defenseValue=24`, raw cells include `meleeDamage=10%`, `meleeCritChance=10%`, `classSpecific=10%`.
- No DB writes have been run yet for this chain.
- Known implementation gap before DB load: landing layer still needs `armor_attributes_raw` registration in `scripts/data/landing/source-dataset-landing-schema.mjs` and `scripts/data/landing/source-dataset-locator.mjs`.

## Data Flow

```text
terraria.wiki.gg/zh api.php?action=parse&page=盔甲属性表
  -> data/generated/wiki-armor-attributes.latest.json
  -> source_dataset_landings dataset_type='armor_attributes_raw'
  -> terria_v1_maint.maint_armor_attribute_rows
  -> terria_v1_relation.relation_armor_attribute_rows
  -> terria_v1_relation.projection_item_armor_attributes
  -> terria_v1_relation.projection_equipment_effect_attributes
  -> /public/items/{id}/armor-attributes
  -> /public/items/{id}/equipment-effects
```

## Task 1: Register The Landing Dataset

**Files:**

- Modify: `scripts/data/landing/source-dataset-landing-schema.mjs`
- Modify: `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.test.mjs`
- Modify: `scripts/data/landing/import-source-dataset-landings.mjs`
- Modify: `scripts/data/landing/import-source-dataset-landings.test.mjs`

- [ ] **Step 1: Add failing schema test**

In `scripts/data/landing/source-dataset-landing-schema.test.mjs`, add `armor_attributes_raw` to the expected `LANDING_DATASET_TYPES` array and assert it validates:

```js
assert.equal(validateLandingDatasetType('armor_attributes_raw'), true);
```

Run:

```bash
node --test scripts/data/landing/source-dataset-landing-schema.test.mjs
```

Expected: fail because `armor_attributes_raw` is not registered yet.

- [ ] **Step 2: Implement schema registration**

In `scripts/data/landing/source-dataset-landing-schema.mjs`, add:

```js
'armor_attributes_raw',
```

after `armor_sets_raw`.

Run:

```bash
node --test scripts/data/landing/source-dataset-landing-schema.test.mjs
```

Expected: pass.

- [ ] **Step 3: Add failing locator test**

In `scripts/data/landing/source-dataset-locator.test.mjs`, write a fixture file:

```js
await writeJson(path.join(repoRoot, 'data', 'generated', 'wiki-armor-attributes.latest.json'), {
  source: 'terraria.wiki.gg/zh/wiki/盔甲属性表',
  sourceApi: 'https://terraria.wiki.gg/zh/api.php',
  sourcePageTitle: '盔甲属性表',
  sourceRevisionTimestamp: '2026-05-30T00:00:00Z',
  generatedAt: '2026-05-30T00:00:00Z',
  total: 1,
  records: [{
    itemNameZh: '神圣面具',
    itemPageTitle: '神圣面具',
    slotGroup: 'head',
    defenseValue: 24,
    rawCells: { meleeDamage: '10%', meleeCritChance: '10%', classSpecific: '10%' },
  }],
});
```

Then assert:

```js
const armorEntry = actual.find((entry) => entry.datasetType === 'armor_attributes_raw');
assert.equal(armorEntry.provider, 'terraria.wiki.gg');
assert.equal(armorEntry.sourceKind, 'page_table');
assert.equal(armorEntry.sourceKey, 'wiki.page.armor_attributes');
assert.equal(armorEntry.sourcePage, '盔甲属性表');
assert.equal(armorEntry.parseStatus, 'ok');
assert.equal(typeof armorEntry.contentHash, 'string');
assert.equal(armorEntry.contentHash.length, 64);
```

Run:

```bash
node --test scripts/data/landing/source-dataset-locator.test.mjs
```

Expected: fail because locator does not emit `armor_attributes_raw`.

- [ ] **Step 4: Implement locator registration**

In `scripts/data/landing/source-dataset-locator.mjs`, add a `pushFileDescriptor` block:

```js
await pushFileDescriptor(
  'armor_attributes_raw',
  path.join(repoRoot, 'data', 'generated', 'wiki-armor-attributes.latest.json'),
  (filePath, payload) => buildFileDescriptor({
    datasetType: 'armor_attributes_raw',
    filePath,
    payload,
    provider: 'terraria.wiki.gg',
    sourceKind: 'page_table',
    sourceKey: 'wiki.page.armor_attributes',
    sourcePage: payload.sourcePageTitle ?? '盔甲属性表',
    sourceRevisionTimestamp: payload.sourceRevisionTimestamp,
    fetchedAt: payload.fetchedAt ?? payload.generatedAt,
    parsedAt: payload.generatedAt,
    parseStatus: Array.isArray(payload.records) ? 'ok' : 'error',
    repoRoot,
    sharedDataRoot,
  }),
);
```

Run:

```bash
node --test scripts/data/landing/source-dataset-locator.test.mjs
```

Expected: pass.

- [ ] **Step 5: Add single-current landing behavior**

Add `armor_attributes_raw` to `SINGLE_CURRENT_DATASET_TYPES` in `scripts/data/landing/import-source-dataset-landings.mjs`, beside `buffs_raw`, because the current table should have one active armor attribute table snapshot.

Add a test in `scripts/data/landing/import-source-dataset-landings.test.mjs` equivalent to the existing `buffs_raw` single-current replacement test, using `datasetType: 'armor_attributes_raw'`.

Run:

```bash
node --test scripts/data/landing/import-source-dataset-landings.test.mjs --test-name-pattern='armor attributes|landing'
```

Expected: pass for the new focused test. If unrelated tests fail because of missing optional DB dependencies, record that separately and run the focused test only.

- [ ] **Step 6: Commit landing registration**

Run:

```bash
git status --short
git diff --check
git add scripts/data/landing/source-dataset-landing-schema.mjs scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/source-dataset-locator.mjs scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.mjs scripts/data/landing/import-source-dataset-landings.test.mjs
git commit -m "feat: register armor attributes landing dataset"
```

## Task 2: Pre-Write Readiness Checks

**Files:**

- No code edits expected.

- [ ] **Step 1: Confirm target DB names**

Use local defaults unless explicitly overridden:

```text
local DB:    terria_v1_local
maint DB:    terria_v1_maint
relation DB: terria_v1_relation
```

Stop if the operator requests production or an unknown database without an explicit confirmation.

- [ ] **Step 2: Confirm local stack DB configuration**

Run:

```bash
node -e "const fs=require('fs'); const p='scripts/dev/config/local-stack.config.json'; const c=JSON.parse(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(c.database,null,2));"
```

Expected: prints host, port, username, password, and database. Verify it points to the intended local MySQL.

- [ ] **Step 3: Capture baseline counts**

Run read-only MySQL queries:

```sql
SELECT COUNT(*) AS total FROM terria_v1_local.source_dataset_landings WHERE dataset_type='armor_attributes_raw' AND is_current=1;
SELECT COUNT(*) AS total FROM terria_v1_maint.maint_armor_attribute_rows WHERE deleted=0;
SELECT COUNT(*) AS total FROM terria_v1_relation.relation_armor_attribute_rows WHERE deleted=0;
SELECT COUNT(*) AS total FROM terria_v1_relation.projection_item_armor_attributes WHERE deleted=0;
SELECT COUNT(*) AS total FROM terria_v1_relation.projection_equipment_effect_attributes WHERE owner_kind='item' AND source_kind='armor_attribute_cell' AND deleted=0;
```

Expected before first load: counts may be `0`. Save the output in the task notes.

## Task 3: Fetch Wiki Source Snapshot

**Files:**

- Writes generated runtime files only:
  - `data/generated/wiki-armor-attributes.latest.json`
  - `data/generated/domain-source-armor-attributes-progress.latest.json`

- [ ] **Step 1: Fetch through wiki API**

Run:

```bash
node scripts/data/fetch/fetch-wiki-armor-attributes.mjs \
  --output-dir data/generated \
  --progress-path data/generated/domain-source-armor-attributes-progress.latest.json
```

Expected:

```text
Fetched 230 wiki armor attribute rows from 盔甲属性表
```

The exact count can change if the wiki page changes; do not proceed if it is far below `200`.

- [ ] **Step 2: Smoke the generated JSON**

Run:

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('data/generated/wiki-armor-attributes.latest.json','utf8')); const row=data.records.find(r=>r.itemNameZh==='神圣面具'); console.log(JSON.stringify({total:data.total, page:data.sourcePageTitle, found:!!row, row: row && {sectionCode:row.sectionCode, slotGroup:row.slotGroup, defenseValue:row.defenseValue, rawCells:row.rawCells}}, null, 2)); if (!row || row.defenseValue!==24) process.exit(1);"
```

Expected:

- `found: true`
- `defenseValue: 24`
- raw cells include `meleeDamage`, `meleeCritChance`, and `classSpecific`.

## Task 4: Landing Import

**Files / Tables:**

- Writes: `terria_v1_local.source_dataset_landings`

- [ ] **Step 1: Dry run landing import**

Run:

```bash
node scripts/data/landing/import-source-dataset-landings.mjs \
  --apply=false \
  --datasets=armor_attributes_raw \
  --database=terria_v1_local \
  --output=reports/source-dataset-landings-armor-attributes-dry-run.json
```

Expected:

- `datasets.requested` contains `armor_attributes_raw`.
- `datasets.located` is `1`.
- `rows.planned` or equivalent located count is non-zero.
- `schema.applied` is false.

- [ ] **Step 2: Apply landing import**

Run:

```bash
node scripts/data/landing/import-source-dataset-landings.mjs \
  --apply=true \
  --datasets=armor_attributes_raw \
  --database=terria_v1_local \
  --output=reports/source-dataset-landings-armor-attributes-apply.json
```

Expected:

- one current `armor_attributes_raw` row in `source_dataset_landings`.
- prior current row retired if this is a replacement run.

- [ ] **Step 3: Verify landing count**

Run:

```sql
SELECT id, dataset_type, provider, source_key, source_page, source_revision_timestamp, is_current
FROM terria_v1_local.source_dataset_landings
WHERE dataset_type='armor_attributes_raw'
ORDER BY id DESC
LIMIT 5;
```

Expected: latest row has `is_current=1`, `provider='terraria.wiki.gg'`, `source_page='盔甲属性表'`.

## Task 5: Maint Sync

**Files / Tables:**

- Writes: `terria_v1_maint.maint_armor_attribute_rows`

- [ ] **Step 1: Dry run maint sync**

Run:

```bash
node scripts/data/maint/sync-landing-to-maint.mjs \
  --apply=false \
  --scopes=armor_attributes \
  --database=terria_v1_maint \
  --output=reports/maint-sync-armor-attributes-dry-run.json
```

Expected:

- summary includes scope `armor_attributes`.
- extracted row count is near the wiki snapshot total.
- no DB writes.

- [ ] **Step 2: Apply maint sync**

Run:

```bash
node scripts/data/maint/sync-landing-to-maint.mjs \
  --apply=true \
  --scopes=armor_attributes \
  --database=terria_v1_maint \
  --output=reports/maint-sync-armor-attributes-apply.json
```

Expected:

- `maint_armor_attribute_rows` is created if missing.
- active row count is near `230`.

- [ ] **Step 3: Verify maint sample**

Run:

```sql
SELECT item_name_zh, item_page_title, slot_group, section_code, defense_value, raw_cells_json
FROM terria_v1_maint.maint_armor_attribute_rows
WHERE deleted=0 AND item_name_zh='神圣面具'
ORDER BY id DESC
LIMIT 1;
```

Expected:

- `slot_group='head'`
- `section_code='hardmode'`
- `defense_value=24`
- `raw_cells_json` contains `meleeDamage`, `meleeCritChance`, `classSpecific`.

## Task 6: Relation And Projection Sync

**Files / Tables:**

- Writes:
  - `terria_v1_relation.relation_armor_attribute_rows`
  - `terria_v1_relation.relation_equipment_effect_attributes`
  - `terria_v1_relation.projection_item_armor_attributes`
  - `terria_v1_relation.projection_equipment_effect_attributes`

- [ ] **Step 1: Dry run relation sync**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs \
  --apply=false \
  --create-database=true \
  --maint-database=terria_v1_maint \
  --local-database=terria_v1_local \
  --relation-database=terria_v1_relation \
  --scopes=armor_attribute
```

Expected:

- report is written under `reports/relation/`.
- summary shows armor attribute rows and item-owned equipment effect rows.
- unresolved rows, if any, are visible in issues/audit output.

- [ ] **Step 2: Apply relation sync**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs \
  --apply=true \
  --create-database=true \
  --maint-database=terria_v1_maint \
  --local-database=terria_v1_local \
  --relation-database=terria_v1_relation \
  --scopes=armor_attribute
```

Expected:

- relation and projection tables receive armor attribute data.
- unresolved rows do not generate equipment effects.

- [ ] **Step 3: Verify relation/projection counts**

Run:

```sql
SELECT COUNT(*) AS total FROM terria_v1_relation.relation_armor_attribute_rows WHERE deleted=0;
SELECT COUNT(*) AS total FROM terria_v1_relation.projection_item_armor_attributes WHERE deleted=0;
SELECT COUNT(*) AS total FROM terria_v1_relation.projection_equipment_effect_attributes WHERE owner_kind='item' AND source_kind='armor_attribute_cell' AND deleted=0;
SELECT review_status, COUNT(*) AS total FROM terria_v1_relation.relation_armor_attribute_rows WHERE deleted=0 GROUP BY review_status;
```

Expected:

- relation/projection armor row count is near the fetched count, minus unresolved identity rows if any.
- item-owned equipment effect count is greater than armor row count because one armor row can produce multiple effects.

- [ ] **Step 4: Verify `神圣面具` projection**

Run:

```sql
SELECT id, item_id, item_internal_name, item_name_zh, slot_group, section_code, defense_value
FROM terria_v1_relation.projection_item_armor_attributes
WHERE deleted=0 AND item_name_zh='神圣面具'
ORDER BY id DESC
LIMIT 1;

SELECT owner_id, item_internal_name, stat_key, stat_label_zh, class_scope, value_decimal, unit, raw_text, parse_status
FROM terria_v1_relation.projection_equipment_effect_attributes
WHERE deleted=0
  AND owner_kind='item'
  AND source_kind='armor_attribute_cell'
  AND item_internal_name='HallowedMask'
ORDER BY stat_key, class_scope;
```

Expected:

- armor row has `defense_value=24`.
- effect rows include at least:
  - `damage_bonus / melee / 10 / percent`
  - `crit_chance / all / 10 / percent`
  - `melee_speed / melee / 10 / percent`

## Task 7: Backend And UI Runtime Smoke

**Files / Services:**

- May require local backend/frontend restart if services are already running.

- [ ] **Step 1: Find local item id for `神圣面具`**

Run:

```sql
SELECT id, internal_name, name_zh
FROM terria_v1_local.items
WHERE deleted=0 AND (name_zh='神圣面具' OR internal_name='HallowedMask')
LIMIT 5;
```

Record the `id`.

- [ ] **Step 2: Restart local stack if needed**

If backend was already running before the DB load, restart the local stack:

```bash
scripts/dev/stop-local-stack.ps1
scripts/dev/start-local-stack.ps1
scripts/dev/verify-local-stack.ps1
```

If the shell cannot run PowerShell scripts, use the repo's existing local-stack procedure and record the exact command used.

- [ ] **Step 3: API smoke**

Replace `<ITEM_ID>` with the local item id:

```bash
curl -s "http://localhost:8080/public/items/<ITEM_ID>/armor-attributes" | jq '.data[0] | {itemId,itemInternalName,itemNameZh,slotGroup,sectionCode,defenseValue}'
curl -s "http://localhost:8080/public/items/<ITEM_ID>/equipment-effects" | jq '.data[] | select(.sourceKind=="armor_attribute_cell") | {statKey,statLabelZh,classScope,valueDecimal,unit,rawText}'
```

Expected:

- armor API returns `defenseValue: 24`.
- equipment effects include melee damage, crit chance, and melee speed rows.

- [ ] **Step 4: UI smoke**

Open:

```text
http://localhost:5176/items/<ITEM_ID>
```

Expected:

- item detail shows `装备属性`.
- core `防御` uses `24` from armor attributes when available.
- equipment attribute chips show concrete values such as `10%`, not prose-only text.

## Task 8: Post-Load Verification And Commit

**Files:**

- Generated runtime files and reports should usually remain untracked.
- Code changes from Task 1 should be committed.

- [ ] **Step 1: Rerun focused tests**

Run:

```bash
node --test scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.test.mjs
node --test scripts/data/lib/wiki-item-utils.test.mjs scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs scripts/data/workflow/run-wiki-sync.test.mjs scripts/data/maint/maint-schema.test.mjs scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs
node --test --test-name-pattern='armor attribute' scripts/data/maint/sync-landing-to-maint.test.mjs
node --test --test-name-pattern='item armor attribute|armor attribute effects' scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
cd back && mvn -Dtest=PublicItemRelationControllerTest,PublicItemServiceImplTest,CrawlerMonitorServiceImplTest test
cd ../front-nuxt && pnpm exec nuxt typecheck
```

Expected: all pass. A Node deprecation warning during Nuxt typecheck is acceptable only if exit code is `0`.

- [ ] **Step 2: Check git scope**

Run:

```bash
git status --short
git diff --check
git diff --cached --stat
```

Expected:

- only Task 1 code/test changes staged for commit.
- generated `data/generated/*.json` and `reports/*.json` are not staged unless explicitly requested.

- [ ] **Step 3: Commit code-only landing registration**

Run:

```bash
git add scripts/data/landing/source-dataset-landing-schema.mjs scripts/data/landing/source-dataset-landing-schema.test.mjs scripts/data/landing/source-dataset-locator.mjs scripts/data/landing/source-dataset-locator.test.mjs scripts/data/landing/import-source-dataset-landings.mjs scripts/data/landing/import-source-dataset-landings.test.mjs
git commit -m "feat: register armor attribute landing load"
```

## Rollback Plan

If a bad load occurs in local DB:

1. Stop the app stack if it is serving stale or incorrect rows.
2. Retire the current landing row:

```sql
UPDATE terria_v1_local.source_dataset_landings
SET is_current=0
WHERE dataset_type='armor_attributes_raw' AND is_current=1;
```

3. Mark armor attribute rows deleted:

```sql
UPDATE terria_v1_maint.maint_armor_attribute_rows SET deleted=1 WHERE deleted=0;
UPDATE terria_v1_relation.relation_armor_attribute_rows SET deleted=1 WHERE deleted=0;
UPDATE terria_v1_relation.projection_item_armor_attributes SET deleted=1 WHERE deleted=0;
UPDATE terria_v1_relation.projection_equipment_effect_attributes
SET deleted=1
WHERE owner_kind='item' AND source_kind='armor_attribute_cell' AND deleted=0;
```

4. Restart backend and rerun the API smoke to confirm armor attribute endpoints return empty arrays for the sample item.

## Plan Audit

**Status:** Execution-ready after acknowledging one required code repair: landing registration.

**Closure definition:** Local DB contains current wiki armor attribute rows, `神圣面具` has projected `defenseValue=24`, and public item APIs return item-owned armor/equipment attribute rows.

**Blocking plan defects:** None after Task 1 is included.

**Residual risk:** Relation identity resolution may leave some rows unresolved if `maint_items` names do not match wiki row titles. Follow-up trigger: `review_status='unresolved'` count is non-zero after Task 6.
