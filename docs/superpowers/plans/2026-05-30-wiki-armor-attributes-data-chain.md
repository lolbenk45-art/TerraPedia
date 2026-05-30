# Wiki Armor Attributes Data Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class data chain for the Terraria Wiki `盔甲属性表` page so each armor piece has wiki-sourced structured defense and equipment bonus fields without hand-written item mappings.

**Architecture:** Add a new wiki source fetcher for `https://terraria.wiki.gg/zh/wiki/盔甲属性表` through the MediaWiki API. The API is only the transport for the page content (`api.php?action=parse` HTML or `?action=raw` wiki source); wiki.gg does not provide ready-made structured armor stat JSON. The TerraPedia fetcher/parser must preserve each row's item link/title, display text, table section, slot group, numeric cells, and raw cells. Land those rows in maint, normalize them in relation by automatically joining to existing `maint_items`, project row-level armor attributes plus item-owned equipment effect rows, then expose the data through public item APIs and item detail UI. Existing armor-set effect parsing remains as fallback; armor attribute table rows win when they produce the same item/stat/class/value.

**Tech Stack:** Node wiki fetch scripts/tests, TerraPedia maint/relation/projection MySQL schemas, Spring Boot public item API, Nuxt public item detail UI.

---

## Scope Lock

In scope:

- New source snapshot: `data/generated/wiki-armor-attributes.latest.json`.
- New monitor-visible progress: `data/generated/domain-source-armor-attributes-progress.latest.json`.
- New fetch script and parser for the wiki `盔甲属性表` page.
- New maint table: `maint_armor_attribute_rows`.
- New relation table: `relation_armor_attribute_rows`.
- New projection table: `projection_item_armor_attributes`.
- Existing `relation_equipment_effect_attributes` and `projection_equipment_effect_attributes` receive item-owned effect rows from armor attribute cells.
- Public item detail can show base defense from the item shell and wiki-sourced equipment bonuses from structured effect rows.
- No fixed dictionary such as `神圣面具 -> HallowedMask`. Alignment uses wiki row identity plus existing `maint_items` fields and records unresolved rows for review.

Out of scope for this plan:

- Replacing `wiki-armor-sets.latest.json`.
- Re-crawling every item page.
- Building a full standalone `/armor-attributes` comparison page.
- Automatic production DB writes. All applies stay manual after dry-run verification.
- Hand-maintained mapping tables for individual armor pieces.

## Source Chain

Authoritative source:

```text
terraria.wiki.gg MediaWiki API page content for zh page "盔甲属性表"
  verified endpoint: https://terraria.wiki.gg/zh/api.php?action=parse&page=盔甲属性表&prop=revid|displaytitle|text&format=json
  fallback endpoint: https://terraria.wiki.gg/zh/wiki/盔甲属性表?action=raw
  -> scripts/data/fetch/fetch-wiki-armor-attributes.mjs
  -> data/generated/wiki-armor-attributes.latest.json
  -> landing source row with dataset_type='armor_attributes_raw'
  -> maint_armor_attribute_rows
  -> relation_armor_attribute_rows + relation_equipment_effect_attributes
  -> projection_item_armor_attributes + projection_equipment_effect_attributes
  -> /public/items/{id}/armor-attributes and /public/items/{id}/equipment-effects
  -> front-nuxt item detail
```

Source verification on 2026-05-30:

- `api.php?action=parse&page=盔甲属性表&prop=revid|displaytitle|text&format=json` returned `pageid=29005`, `revid=199734`, HTML length `274632`, and contained both `<table` and `神圣面具`.
- `wiki/盔甲属性表?action=raw` returned wiki table source beginning with `Pre-Hardmode Helmets`.
- Therefore the plan relies on wiki API/page content availability, but structured numeric fields are produced by TerraPedia parser code, not by a pre-structured wiki API response.

Identity rule:

- Primary source identity is the wiki row item link/title from the table cell.
- Maint/relation alignment attempts, in order:
  - exact normalized Chinese display/title against `maint_items.name_zh`
  - exact normalized English page title against `maint_items.english_name`
  - exact normalized internal-like title against `maint_items.internal_name`
  - raw JSON aliases from `maint_items.raw_json`, including `name`, `nameZh`, `internalName`
- Failed alignment creates a relation row with `review_status='unresolved'`; it does not create equipment effects.

## File Structure

Create:

- `scripts/data/fetch/fetch-wiki-armor-attributes.mjs`
  - Fetches the wiki page through API, parses HTML tables, writes generated snapshot and progress.
- `scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs`
  - Parser and progress contract tests.

Modify:

- `scripts/data/workflow/run-wiki-sync.mjs`
  - Adds `armor_attributes` entity config for bounded source refresh.
- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
  - Registers `domain-source-armor-attributes` task.
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
  - Verifies monitor task path, output path, and progress shape.
- `scripts/data/maint/maint-schema.mjs`
  - Adds `maint_armor_attribute_rows`.
- `scripts/data/maint/maint-schema.test.mjs`
  - Verifies the table exists and includes identity/stat columns.
- `scripts/data/maint/sync-landing-to-maint.mjs`
  - Adds dataset type `armor_attributes_raw`.
- `scripts/data/maint/sync-landing-to-maint.test.mjs`
  - Verifies landing payload expansion.
- `scripts/data/relation/relation-schema.mjs`
  - Adds `relation_armor_attribute_rows`; keeps using `relation_equipment_effect_attributes` for normalized effects.
- `scripts/data/relation/projection-schema.mjs`
  - Adds `projection_item_armor_attributes`.
- `scripts/data/relation/sync-maint-to-relation.mjs`
  - Reads `maint_armor_attribute_rows`, resolves items, creates row projection data, emits item-owned effects, dedupes against armor-set fallback effects.
- `scripts/data/relation/sync-maint-to-relation.test.mjs`
  - Adds Hallowed Mask table-row regression and unresolved-row regression.
- `scripts/data/relation/projection-sync.mjs`
  - Projects `relation_armor_attribute_rows` into `projection_item_armor_attributes`.
- `scripts/data/relation/projection-sync.test.mjs`
  - Verifies row-level projection and item-owned equipment effect preservation.
- `back/src/main/java/com/terraria/skills/dto/PublicItemArmorAttributeDTO.java`
  - DTO for row-level armor attribute source data.
- `back/src/main/java/com/terraria/skills/service/PublicItemService.java`
  - Adds `getPublicItemArmorAttributes(Long id)`.
- `back/src/main/java/com/terraria/skills/service/impl/PublicItemServiceImpl.java`
  - Adds query for `projection_item_armor_attributes`.
- `back/src/main/java/com/terraria/skills/controller/PublicItemController.java`
  - Adds `/public/items/{id}/armor-attributes`.
- `back/src/test/java/com/terraria/skills/service/impl/PublicItemServiceImplTest.java`
  - Adds service test for armor attributes.
- `back/src/test/java/com/terraria/skills/controller/PublicItemControllerTest.java`
  - Adds controller test.
- `front-nuxt/types/public-api.ts`
  - Adds `PublicItemArmorAttribute` and bundle field.
- `front-nuxt/composables/usePublicItemDetail.ts`
  - Fetches `/public/items/{id}/armor-attributes`.
- `front-nuxt/pages/items/[id].vue`
  - Displays source-backed armor attribute metadata when present.
- `front-nuxt/scripts/check-public-pages.mjs`
  - Adds public API contract markers.

## Task 1: Wiki Armor Attribute Fetcher And Progress Contract

**Files:**

- Create: `scripts/data/fetch/fetch-wiki-armor-attributes.mjs`
- Create: `scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs`
- Modify: `scripts/data/workflow/run-wiki-sync.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [ ] **Step 1: Write the parser fixture test**

Add a fixture that includes the `困难模式` section and a Hallowed Mask row. The fixture must include a wiki link/title and separate stat cells:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWikiArmorAttributeRows } from './fetch-wiki-armor-attributes.mjs';

test('parseWikiArmorAttributeRows extracts linked item identity and structured stat cells', () => {
  const html = `
    <h2>困难模式</h2>
    <h3>头盔</h3>
    <table><tbody>
      <tr>
        <th>物品</th><th>伤害</th><th>暴击率</th><th>职业专属</th><th>防御</th><th>其他奖励</th>
      </tr>
      <tr>
        <td><a href="/zh/wiki/神圣面具" title="神圣面具">神圣面具</a></td>
        <td>+10% 近战伤害</td>
        <td>+10% 暴击率</td>
        <td>+10% 近战速度</td>
        <td>24</td>
        <td></td>
      </tr>
    </tbody></table>`;

  const actual = parseWikiArmorAttributeRows({
    html,
    sourceRevisionTimestamp: '2026-05-30T00:00:00Z'
  });

  assert.deepEqual(actual.map((row) => ({
    sectionCode: row.sectionCode,
    slotGroup: row.slotGroup,
    itemPageTitle: row.itemPageTitle,
    itemNameZh: row.itemNameZh,
    defenseValue: row.defenseValue,
    rawCells: row.rawCells
  })), [{
    sectionCode: 'hardmode',
    slotGroup: 'head',
    itemPageTitle: '神圣面具',
    itemNameZh: '神圣面具',
    defenseValue: 24,
    rawCells: {
      damage: '+10% 近战伤害',
      critChance: '+10% 暴击率',
      classSpecific: '+10% 近战速度',
      otherBonus: ''
    }
  }]);
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs
```

Expected: fail because the new fetcher module does not exist.

- [ ] **Step 3: Implement the fetcher with monitor-visible progress**

Create `scripts/data/fetch/fetch-wiki-armor-attributes.mjs` with:

```js
const DEFAULT_PAGE_TITLE = '盔甲属性表';
const ACTION_ID = 'domain-source-armor-attributes';
const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'domain-source-armor-attributes-progress.latest.json');
const DEFAULT_OUTPUT_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-armor-attributes.latest.json');
```

The output JSON shape must be:

```json
{
  "source": "terraria.wiki.gg/zh/wiki/盔甲属性表",
  "sourceApi": "https://terraria.wiki.gg/zh/api.php",
  "sourcePageTitle": "盔甲属性表",
  "sourceRevisionTimestamp": "2026-05-30T00:00:00Z",
  "generatedAt": "2026-05-30T00:00:00Z",
  "total": 1,
  "records": [
    {
      "sectionCode": "hardmode",
      "slotGroup": "head",
      "itemPageTitle": "神圣面具",
      "itemHref": "/zh/wiki/神圣面具",
      "itemNameZh": "神圣面具",
      "defenseValue": 24,
      "rawCells": {
        "damage": "+10% 近战伤害",
        "critChance": "+10% 暴击率",
        "classSpecific": "+10% 近战速度",
        "otherBonus": ""
      },
      "sourceRevisionTimestamp": "2026-05-30T00:00:00Z"
    }
  ]
}
```

Progress payload must include:

```js
buildActionProgressPayload({
  actionId: 'domain-source-armor-attributes',
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  overallCurrent: current,
  overallTotal: total,
  generatedAt,
  lastHeartbeatAt: generatedAt,
  childStatusPath: progressPath
})
```

- [ ] **Step 4: Add progress tests**

In `fetch-wiki-armor-attributes.test.mjs`, add assertions that the source contains:

```js
assert.match(source, /ACTION_ID = 'domain-source-armor-attributes'/);
assert.match(source, /domain-source-armor-attributes-progress\.latest\.json/);
assert.match(source, /wiki-armor-attributes\.latest\.json/);
assert.match(source, /lastHeartbeatAt/);
assert.match(source, /childStatusPath/);
```

- [ ] **Step 5: Register `armor_attributes` in wiki sync**

In `scripts/data/workflow/run-wiki-sync.mjs`, add:

```js
armor_attributes: {
  entityFamily: 'armor_attributes',
  sourceKind: 'page',
  sourceKeys: ['wiki.page.armor_attributes'],
  titles: ['盔甲属性表'],
  scriptPath: path.join(repoRoot, 'scripts', 'data', 'fetch', 'fetch-wiki-armor-attributes.mjs'),
  scriptArgs: () => [],
  latestJsonPath: path.join(generatedRoot, 'wiki-armor-attributes.latest.json'),
  estimatedRequests: 1
}
```

Do not add `armor_attributes` to the default entity list until its maint/relation chain is implemented.

- [ ] **Step 6: Register crawler monitor task**

In `CrawlerMonitorServiceImpl`, add:

```java
private static final Path DOMAIN_SOURCE_ARMOR_ATTRIBUTES_PROGRESS_FILE =
    Path.of("data", "generated", "domain-source-armor-attributes-progress.latest.json");
```

Then add a `buildDomainSourceSnapshotTask` entry:

```java
tasks.add(buildDomainSourceSnapshotTask(
    repoRoot,
    "domain-source-armor-attributes",
    "Domain source: Armor attributes",
    DOMAIN_SOURCE_ARMOR_ATTRIBUTES_PROGRESS_FILE,
    "data/generated/wiki-armor-attributes.latest.json",
    domainSourceArmorAttributesProgress
));
```

- [ ] **Step 7: Run narrow tests and verify GREEN**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs
cd back && mvn -Dtest=CrawlerMonitorServiceImplTest test
```

Expected: parser/progress tests pass and crawler monitor recognizes `domain-source-armor-attributes`.

## Task 2: Maint Landing For Armor Attribute Rows

**Files:**

- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/maint-schema.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] **Step 1: Write failing maint schema test**

Add these expectations:

```js
assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_armor_attribute_rows`/);
assert.match(sql, /`item_page_title` VARCHAR\(255\)/);
assert.match(sql, /`defense_value` INT DEFAULT NULL/);
assert.match(sql, /`raw_cells_json` LONGTEXT NOT NULL/);
assert.match(sql, /uk_maint_armor_attribute_rows_record_key/);
```

Run:

```bash
node --test scripts/data/maint/maint-schema.test.mjs
```

Expected: fail because the table does not exist.

- [ ] **Step 2: Add `maint_armor_attribute_rows` schema**

Add:

```sql
CREATE TABLE IF NOT EXISTS `maint_armor_attribute_rows` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) NOT NULL,
  `section_code` VARCHAR(64) DEFAULT NULL,
  `slot_group` VARCHAR(64) DEFAULT NULL,
  `sort_order` INT DEFAULT NULL,
  `item_page_title` VARCHAR(255) DEFAULT NULL,
  `item_href` VARCHAR(500) DEFAULT NULL,
  `item_name_zh` VARCHAR(255) DEFAULT NULL,
  `defense_value` INT DEFAULT NULL,
  `raw_cells_json` LONGTEXT NOT NULL,
  `source_provider` VARCHAR(128) NOT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `landing_source_id` BIGINT NOT NULL,
  `landing_source_key` VARCHAR(255) NOT NULL,
  `landing_source_page` VARCHAR(255) DEFAULT NULL,
  `landing_content_hash` CHAR(64) NOT NULL,
  `landing_fetched_at` DATETIME DEFAULT NULL,
  `landing_parsed_at` DATETIME DEFAULT NULL,
  `raw_json` LONGTEXT NOT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_maint_armor_attribute_rows_record_key` (`record_key`),
  KEY `idx_maint_armor_attribute_rows_item_title` (`item_page_title`),
  KEY `idx_maint_armor_attribute_rows_item_name_zh` (`item_name_zh`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: Write failing landing expansion test**

Add:

```js
test('extractMaintEntitiesFromLandingRow expands armor_attributes_raw into maint armor attribute rows', async () => {
  const landingRow = {
    id: 91,
    dataset_type: 'armor_attributes_raw',
    provider: 'terraria.wiki.gg',
    source_page: '盔甲属性表',
    source_key: 'wiki.page.armor_attributes',
    source_revision_timestamp: '2026-05-30T00:00:00Z',
    content_hash: '7'.repeat(64),
    fetched_at: '2026-05-30T00:00:00Z',
    parsed_at: '2026-05-30T00:00:00Z',
    payload_json: JSON.stringify({
      sourceRevisionTimestamp: '2026-05-30T00:00:00Z',
      records: [{
        sectionCode: 'hardmode',
        slotGroup: 'head',
        itemPageTitle: '神圣面具',
        itemHref: '/zh/wiki/神圣面具',
        itemNameZh: '神圣面具',
        defenseValue: 24,
        rawCells: {
          damage: '+10% 近战伤害',
          critChance: '+10% 暴击率',
          classSpecific: '+10% 近战速度',
          otherBonus: ''
        }
      }]
    })
  };

  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  assert.equal(actual.scope, 'armor_attributes');
  assert.equal(actual.rows.length, 1);
  assert.equal(actual.rows[0].tableName, 'maint_armor_attribute_rows');
  assert.equal(actual.rows[0].itemPageTitle, '神圣面具');
  assert.equal(actual.rows[0].defenseValue, 24);
});
```

Run:

```bash
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected: fail because `armor_attributes_raw` is unknown.

- [ ] **Step 4: Implement maint extraction and upsert**

Add dataset mappings:

```js
const DATASET_TYPE_ALIASES = {
  armor_attributes: ['armor_attributes_raw']
};
const SCOPE_TABLES = {
  armor_attributes: 'maint_armor_attribute_rows'
};
```

Add:

```js
function extractArmorAttributeMaintRows(landingRow, payload) {
  return (Array.isArray(payload.records) ? payload.records : []).map((record, index) => ({
    scope: 'armor_attributes',
    tableName: 'maint_armor_attribute_rows',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      itemPageTitle: record.itemPageTitle,
      sectionCode: record.sectionCode,
      slotGroup: record.slotGroup,
      sortOrder: index,
      contentHash: landingRow.content_hash
    }),
    sectionCode: normalizeText(record.sectionCode),
    slotGroup: normalizeText(record.slotGroup),
    sortOrder: index,
    itemPageTitle: normalizeText(record.itemPageTitle),
    itemHref: normalizeText(record.itemHref),
    itemNameZh: normalizeText(record.itemNameZh),
    defenseValue: toNullableNumber(record.defenseValue),
    rawCellsJson: JSON.stringify(record.rawCells ?? {}),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? payload.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record)
  }));
}
```

Add an upsert branch using `record_key` and all fields above.

- [ ] **Step 5: Run maint tests and verify GREEN**

Run:

```bash
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected: pass.

## Task 3: Relation And Projection Normalization

**Files:**

- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`

- [ ] **Step 1: Write failing relation sync test**

Add a dry-run fixture with:

```js
maint_armor_attribute_rows: [{
  id: 1,
  record_key: 'armor-attr-hallowed-mask',
  section_code: 'hardmode',
  slot_group: 'head',
  sort_order: 0,
  item_page_title: '神圣面具',
  item_href: '/zh/wiki/神圣面具',
  item_name_zh: '神圣面具',
  defense_value: 24,
  raw_cells_json: JSON.stringify({
    damage: '+10% 近战伤害',
    critChance: '+10% 暴击率',
    classSpecific: '+10% 近战速度',
    otherBonus: ''
  }),
  source_provider: 'terraria.wiki.gg',
  source_page: '盔甲属性表',
  source_revision_timestamp: '2026-05-30 00:00:00',
  raw_json: '{}'
}]
```

and `maint_items`:

```js
{
  source_id: 559,
  internal_name: 'HallowedMask',
  english_name: 'Hallowed Mask',
  name_zh: '神圣面具',
  raw_json: '{"defense":24,"headSlot":43,"internalName":"HallowedMask","name":"Hallowed Mask"}'
}
```

Assert:

```js
assert.deepEqual(itemRows.map((row) => [
  row.ownerKind,
  row.ownerId,
  row.ownerKey,
  row.itemInternalName,
  row.slotType,
  row.statKey,
  row.classScope,
  row.valueDecimal,
  row.unit,
  row.sourceKind
]).sort((a, b) => String(a[5]).localeCompare(String(b[5]))), [
  ['item', 559, 'HallowedMask', 'HallowedMask', 'headSlot', 'crit_chance', 'all', 10, 'percent', 'wiki_armor_attributes'],
  ['item', 559, 'HallowedMask', 'HallowedMask', 'headSlot', 'damage_bonus', 'melee', 10, 'percent', 'wiki_armor_attributes'],
  ['item', 559, 'HallowedMask', 'HallowedMask', 'headSlot', 'melee_speed', 'melee', 10, 'percent', 'wiki_armor_attributes']
]);
assert.equal(result.results.relationArmorAttributeRows[0].defenseValue, 24);
assert.equal(result.results.relationArmorAttributeRows[0].itemInternalName, 'HallowedMask');
assert.equal(result.results.projectionItemArmorAttributes[0].defenseValue, 24);
```

Run:

```bash
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: fail because relation does not read `maint_armor_attribute_rows`.

- [ ] **Step 2: Add relation and projection schemas**

Add `relation_armor_attribute_rows`:

```sql
CREATE TABLE IF NOT EXISTS `terria_v1_relation`.`relation_armor_attribute_rows` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `source_record_key` CHAR(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `section_code` VARCHAR(64) DEFAULT NULL,
  `slot_group` VARCHAR(64) DEFAULT NULL,
  `slot_type` VARCHAR(64) DEFAULT NULL,
  `sort_order` INT DEFAULT NULL,
  `item_source_id` BIGINT DEFAULT NULL,
  `item_internal_name` VARCHAR(255) DEFAULT NULL,
  `item_page_title` VARCHAR(255) DEFAULT NULL,
  `item_href` VARCHAR(500) DEFAULT NULL,
  `item_name_zh` VARCHAR(255) DEFAULT NULL,
  `defense_value` INT DEFAULT NULL,
  `raw_cells_json` LONGTEXT NOT NULL,
  `mapping_status` VARCHAR(64) NOT NULL,
  ${TRACE_COLUMNS},
  ${AUDIT_COLUMNS},
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_relation_armor_attribute_rows_record_key` (`record_key`),
  KEY `idx_relation_armor_attribute_rows_item` (`item_source_id`, `item_internal_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Add `projection_item_armor_attributes`:

```sql
CREATE TABLE IF NOT EXISTS `terria_v1_relation`.`projection_item_armor_attributes` (
  `id` BIGINT NOT NULL,
  `relation_record_key` CHAR(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `item_id` BIGINT DEFAULT NULL,
  `item_internal_name` VARCHAR(255) DEFAULT NULL,
  `section_code` VARCHAR(64) DEFAULT NULL,
  `slot_group` VARCHAR(64) DEFAULT NULL,
  `slot_type` VARCHAR(64) DEFAULT NULL,
  `defense_value` INT DEFAULT NULL,
  `raw_cells_json` LONGTEXT DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `mapping_status` VARCHAR(64) DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_projection_item_armor_attributes_item` (`item_id`, `item_internal_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 3: Implement item alignment without fixed dictionaries**

In `sync-maint-to-relation.mjs`, create:

```js
function buildArmorAttributeItemLookup(maintItems = []) {
  const lookup = new Map();
  for (const item of maintItems) {
    const raw = parseJsonMaybe(item.raw_json ?? item.rawJson, {});
    const names = [
      item.name_zh,
      item.english_name,
      item.internal_name,
      raw.nameZh,
      raw.name,
      raw.internalName
    ];
    for (const name of names) {
      const key = normalizeEffectLabelKey(name);
      if (key && !lookup.has(key)) lookup.set(key, item);
    }
  }
  return lookup;
}
```

Use it to resolve by `item_name_zh`, then `item_page_title`. Do not add any per-item hardcoded mapping.

- [ ] **Step 4: Convert table cells to item-owned equipment effects**

Reuse `parseEquipmentEffectLines` for each raw cell:

```js
const sourceCells = [
  ['damage', cells.damage],
  ['critChance', cells.critChance],
  ['classSpecific', cells.classSpecific],
  ['otherBonus', cells.otherBonus]
];
```

For each parsed effect:

```js
{
  ownerKind: 'item',
  ownerId: itemSourceId,
  ownerKey: itemInternalName,
  sourceKind: 'wiki_armor_attributes',
  applyScope: 'equipped',
  variantLabel: itemNameZh,
  itemInternalName,
  slotType,
  statKey,
  classScope,
  valueDecimal,
  unit,
  rawText,
  parseStatus
}
```

Do not emit a `defense` equipment effect row from `defense_value`; defense remains row-level armor attribute data and item detail core data.

- [ ] **Step 5: Deduplicate fallback item effects**

Before finalizing `results.relationEquipmentEffectAttributes`, apply:

```js
function dedupeEquipmentEffectRows(rows) {
  const priority = new Map([
    ['wiki_armor_attributes', 2],
    ['benefit_zh', 1]
  ]);
  const byIdentity = new Map();
  for (const row of rows) {
    const key = [
      row.ownerKind,
      row.ownerId,
      row.itemInternalName,
      row.slotType,
      row.statKey,
      row.classScope,
      row.operation,
      row.valueDecimal,
      row.unit
    ].join('|');
    const existing = byIdentity.get(key);
    if (!existing || (priority.get(row.sourceKind) ?? 0) > (priority.get(existing.sourceKind) ?? 0)) {
      byIdentity.set(key, row);
    }
  }
  return [...byIdentity.values()];
}
```

- [ ] **Step 6: Add unresolved-row regression**

Add a fixture row with `item_name_zh='不存在的头盔'` and no matching `maint_items`. Assert:

```js
assert.equal(result.results.relationArmorAttributeRows[0].mappingStatus, 'unresolved');
assert.equal(
  result.results.relationEquipmentEffectAttributes.filter((row) => row.sourceKind === 'wiki_armor_attributes').length,
  0
);
```

- [ ] **Step 7: Run relation/projection tests and verify GREEN**

Run:

```bash
node --test scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected: pass, with Hallowed Mask table-source rows projected.

## Task 4: Public API And Frontend Consumption

**Files:**

- Create: `back/src/main/java/com/terraria/skills/dto/PublicItemArmorAttributeDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/PublicItemService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicItemServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicItemController.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/PublicItemServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicItemControllerTest.java`
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicItemDetail.ts`
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add backend service/controller RED tests**

Service test expected DTO:

```java
assertEquals(559L, dto.getItemId());
assertEquals("HallowedMask", dto.getItemInternalName());
assertEquals("hardmode", dto.getSectionCode());
assertEquals("head", dto.getSlotGroup());
assertEquals("headSlot", dto.getSlotType());
assertEquals(24, dto.getDefenseValue());
assertEquals("mapped", dto.getMappingStatus());
```

Controller endpoint:

```http
GET /public/items/559/armor-attributes
```

Expected JSON:

```json
{
  "itemId": 559,
  "itemInternalName": "HallowedMask",
  "defenseValue": 24,
  "slotType": "headSlot"
}
```

Run:

```bash
cd back && mvn -Dtest=PublicItemServiceImplTest,PublicItemControllerTest test
```

Expected: fail because the DTO and endpoint do not exist.

- [ ] **Step 2: Implement DTO and query**

DTO fields:

```java
private Long itemId;
private String itemInternalName;
private String sectionCode;
private String slotGroup;
private String slotType;
private Integer defenseValue;
private String rawCellsJson;
private String sourcePage;
private LocalDateTime sourceRevisionTimestamp;
private String mappingStatus;
```

SQL:

```sql
SELECT pia.item_id AS itemId,
       pia.item_internal_name AS itemInternalName,
       pia.section_code AS sectionCode,
       pia.slot_group AS slotGroup,
       pia.slot_type AS slotType,
       pia.defense_value AS defenseValue,
       pia.raw_cells_json AS rawCellsJson,
       pia.source_page AS sourcePage,
       pia.source_revision_timestamp AS sourceRevisionTimestamp,
       pia.mapping_status AS mappingStatus
FROM items i
JOIN `terria_v1_relation`.`projection_item_armor_attributes` pia
  ON pia.deleted = 0
 AND pia.status = 1
 AND (
      pia.item_id = i.id
      OR pia.item_internal_name COLLATE utf8mb4_unicode_ci = i.internal_name COLLATE utf8mb4_unicode_ci
 )
WHERE i.deleted = 0
  AND i.id = ?
ORDER BY pia.id ASC
```

- [ ] **Step 3: Add frontend bundle field**

In `front-nuxt/types/public-api.ts`:

```ts
export type PublicItemArmorAttribute = {
  itemId?: number | string | null
  itemInternalName?: string | null
  sectionCode?: string | null
  slotGroup?: string | null
  slotType?: string | null
  defenseValue?: number | string | null
  rawCellsJson?: string | null
  sourcePage?: string | null
  sourceRevisionTimestamp?: string | null
  mappingStatus?: string | null
}

export type PublicItemDetailBundle = {
  armorAttributes: PublicItemArmorAttribute[]
}
```

In `usePublicItemDetail.ts`, fetch:

```ts
fetchOptionalPublicItemRelation<PublicItemArmorAttribute[]>(`/public/items/${normalizedItemId}/armor-attributes`, [])
```

- [ ] **Step 4: Render source metadata on item detail**

On `front-nuxt/pages/items/[id].vue`, add a compact line in the equipment module:

```vue
<small v-if="armorAttributeSummary">
  盔甲属性表 · {{ armorAttributeSummary.slotLabel }} · 防御 {{ armorAttributeSummary.defense }}
</small>
```

The page must still use the item shell's core `defense` stat row for the main visible defense value.

- [ ] **Step 5: Run backend/frontend checks**

Run:

```bash
cd back && mvn -Dtest=PublicItemServiceImplTest,PublicItemControllerTest test
cd front-nuxt && pnpm run check
```

Expected: pass.

## Task 5: Dry-Run Validation And Manual Apply Boundary

**Files:**

- No new source edits unless validation exposes a tested defect.

- [ ] **Step 1: Run source parser tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-armor-attributes.test.mjs
```

Expected: pass.

- [ ] **Step 2: Run maint/relation/projection tests**

Run:

```bash
node --test \
  scripts/data/maint/maint-schema.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/relation/projection-sync.test.mjs
```

Expected: pass.

- [ ] **Step 3: Run dry-run relation sync without DB writes**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --scopes=armor
```

Expected:

```text
Apply: false
Relation writes: 0
```

- [ ] **Step 4: Run in-memory Hallowed Mask smoke**

Run a read-only dry-run harness and assert the item-owned effects include:

```text
damage_bonus/melee/10/percent/559/headSlot/wiki_armor_attributes
crit_chance/all/10/percent/559/headSlot/wiki_armor_attributes
melee_speed/melee/10/percent/559/headSlot/wiki_armor_attributes
```

Expected: 3 table-source rows.

- [ ] **Step 5: Manual apply only after approval**

Only after the user explicitly approves data refresh, run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --scopes=armor
```

Then verify:

```bash
curl -sS http://127.0.0.1:18088/api/public/items/559/armor-attributes
curl -sS http://127.0.0.1:18088/api/public/items/559/equipment-effects
```

Expected:

- `armor-attributes` includes `defenseValue: 24`.
- `equipment-effects` includes `damage_bonus`, `crit_chance`, and `melee_speed` rows with `itemInternalName: "HallowedMask"`.

## Commit Boundary

Do not mix this plan's implementation with the already completed item equipment effect fallback work unless the user explicitly asks to commit both together.

Recommended commit sequence:

1. Commit current fallback item-owned equipment effect work.
2. Start this plan from a clean status or isolated worktree.
3. Commit crawler/source support.
4. Commit maint/relation/projection support.
5. Commit API/frontend consumption.

Before any commit:

```bash
git status --short
git diff --cached --stat
```

## Plan Self-Review

Spec coverage:

- The plan uses wiki API/page data as source of truth.
- It avoids hand-written per-item mapping and relies on existing wiki-derived `maint_items`.
- It preserves row-level wiki table data and also emits item-owned equipment effects.
- It defines dry-run and manual-apply boundaries.

Placeholder scan:

- No `TBD`, `TODO`, or "implement later" placeholders remain.
- Every task has concrete files, expected checks, and verification commands.

Type consistency:

- `PublicItemArmorAttributeDTO` maps to `projection_item_armor_attributes`.
- `EquipmentEffectAttributeDTO` continues to map to `projection_equipment_effect_attributes`.
- `sourceKind='wiki_armor_attributes'` is used consistently in relation and projection rows.

## Plan Audit

## Verdict
- Status: Execution-ready after current dirty worktree is either committed or intentionally carried forward.
- Main goal: Add a wiki-sourced armor attribute table data chain for per-item armor stats.
- Closure definition: Hallowed Mask resolves from wiki armor attributes to item id `559`, row-level `defenseValue=24`, and three item-owned equipment effects from `wiki_armor_attributes`.

## Blocking Plan Defects
- Critical: None in the plan.
- Important: Current worktree contains prior equipment-effect changes; implementation should not start until that scope is committed or explicitly allowed to mix.

## Plan Repairs
- Change: The plan adds a dedicated projection table for row-level armor attributes instead of only using equipment effects.
- Reason: Defense is base item data and should not be duplicated as an equipment effect chip.
- Validation added: `GET /public/items/559/armor-attributes` smoke plus existing `equipment-effects` smoke.

## Execution-Ready Plan
- Scope: Fetcher, maint, relation/projection, API, item-detail consumption.
- Agent split: crawler/progress files, maint/relation files, backend files, frontend files can be implemented in separate disjoint slices after schema names are locked.
- Smoke test: Hallowed Mask table row produces `defenseValue=24` and three item-owned effect rows.
- Final validation: Node tests, backend focused tests, frontend check, relation dry-run, optional manual apply and curl after user approval.

## Residual Risk
- Risk: The live wiki HTML table may have header text differences not represented by the first fixture.
- Follow-up trigger: If the fetcher parses fewer than expected rows or Hallowed Mask is absent, add a fixture from the live saved HTML and repair the parser before touching maint/relation.
