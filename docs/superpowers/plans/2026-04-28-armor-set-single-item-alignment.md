# Armor Set Single-Piece Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/entities/armor-sets` 的数据源同时覆盖传统完整套装和盔甲页里的单件构成套装/非三件构成套装，并能用审计脚本证明 source、relation、projection、API、页面口径一致。

**Architecture:** 保持现有 `wiki/source -> maint -> relation -> projection -> backend/admin/page` 链路不变，只补齐 armor page 的构成分类、relation 建模和覆盖率审计。所有纳入行的实体类型都仍是 `armor_set`；新增 `compositionKind` 只表示套装由三件、多件、两件还是单件构成，不表示“是不是套装”。`Module:ArmorSetBonuses` 仍只作为套装加成事实源，盔甲页作为套装枚举事实源，`maint_items` / `projection_items` 负责把条目映射到真实物品。

**Tech Stack:** Node.js ESM data scripts, node:test, Spring Boot controller tests, Nuxt admin page, MySQL local stack.

---

## Current Baseline

- Page: `http://localhost:3001/entities/armor-sets?page=3`
- Runtime API: `GET /api/admin/armor-sets?page=3&limit=20`
- Current API total: `67`
- Current generated source: `data/generated/wiki-armor-sets.latest.json`
- Current generated source total: `67`, split as `pre-hardmode=35`, `hardmode=32`
- Current known gap: `scripts/data/fetch/fetch-wiki-armor-sets.test.mjs` explicitly expects `Wizard set` and `Other armor` rows to be excluded.
- Current read path: [data-query-app/pages/entities/[type].vue](G:/ClaudeCode/TerraPedia-dev/data-query-app/pages/entities/[type].vue:1384) uses `/admin/armor-sets`; [AdminArmorSetController.java](G:/ClaudeCode/TerraPedia-dev/back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java:66) prefers `projection_armor_sets`.
- Current source priority stays: wiki armor page rows > `Module:ArmorSetBonuses` effect rows > `maint_items` equipment facts > image facts.

## Success Criteria

- `wiki-armor-sets.latest.json` includes every intended armor page row category: traditional armor sets, wizard/single-piece sets, and explicitly accepted nonstandard armor-set rows.
- Every included row has `entityType: "armor_set"` and `compositionKind`: `traditional_set`, `single_piece_set`, or `nonstandard_piece_set`.
- `relation_armor_sets`, `relation_armor_set_items`, and `projection_armor_sets` retain one stable row per included armor page entry.
- `projection_armor_sets.current_item_ids_json` and `related_items_json` include real source item IDs for single-piece set rows.
- `/api/admin/armor-sets?page=3&limit=20` total is greater than the current `67` if upstream source has accepted single/special rows.
- No accepted armor page row silently disappears; any unmapped row is reported with reason and source evidence.
- Page display still works for current 67 traditional rows and also shows single-piece set rows without empty variant cards.

## Non-Goals

- Do not copy legacy `local.armor_sets` or `local.armor_set_items` back into the new source chain.
- Do not hand-write missing rows directly into projection tables.
- Do not broaden this into all equipment/accessory categories; only armor-page rows accepted as armor-set-domain entries are included.
- Do not apply DB writes until dry-run and coverage audit pass.

## File Map

- Modify: `scripts/data/fetch/fetch-wiki-armor-sets.mjs`
  Parse additional armor page sections and emit `entityType`, `compositionKind`, `pageTitle`, `nameZh`, `images`, `effectText`, `sourceText`, and source section evidence.

- Modify: `scripts/data/fetch/fetch-wiki-armor-sets.test.mjs`
  Change the old exclusion test into explicit inclusion/exclusion tests for traditional, single-piece, nonstandard set, and non-armor rows.

- Modify: `scripts/data/relation/armor-set-processor.mjs`
  Map `compositionKind=single_piece_set` and `nonstandard_piece_set` to one-item or non-three-piece variants without requiring all `head/body/legs` groups.

- Modify: `scripts/data/relation/armor-set-processor.test.mjs`
  Add coverage for `Magic Hat`, `Wizard Hat`, and one nonstandard armor-set-domain sample.

- Modify: `scripts/data/relation/projection-sync.mjs`
  Preserve `compositionKind` in `rawJson`/projection behavior and ensure one-piece variants produce `setCount=1`, `uniqueItemCount=1`, and usable `relatedItemsJson`.

- Modify: `scripts/data/relation/projection-sync.test.mjs`
  Assert single-piece set projection shape and UI-safe image fallback.

- Create: `scripts/data/audit/audit-armor-set-source-coverage.mjs`
  Compare `wiki-armor-sets.latest.json`, relation dry-run output, `projection_armor_sets`, and API result totals. Emit missing rows by `pageTitle`, `compositionKind`, and item mapping status.

- Test: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
  Add a projection-backed single-piece armor set case if backend normalization fails to display one-item variants.

- Modify only if runtime display is broken: `data-query-app/pages/entities/[type].vue`
  Adjust detail card labels/counts for one-item variants, without changing data source logic.

## Task 1: Lock Source Coverage Rules

- [ ] **Step 1: Write the failing parser test**

Add cases in `scripts/data/fetch/fetch-wiki-armor-sets.test.mjs` where the fixture contains:

```js
== [[{{tr|Wizard set}}]] ==
{| class="terraria lined"
|-
| [[File:Magic Hat (equipped).png|link=]]
| {{item|mode=text|wrap=y|Magic Hat}}
| class="small" | +60 mana
|}

== Other armor ==
{| class="terraria lined"
|-
| [[File:Night Vision Helmet.png|link=]]
| {{item|mode=text|wrap=y|Night Vision Helmet}}
| class="small" | Emits light
|}
```

Expected assertions:

```js
assert.deepEqual(actual.map((row) => [row.pageTitle, row.entityType, row.compositionKind]), [
  ['Wood armor', 'armor_set', 'traditional_set'],
  ['Hallowed armor', 'armor_set', 'traditional_set'],
  ['Magic Hat', 'armor_set', 'single_piece_set'],
  ['Night Vision Helmet', 'armor_set', 'nonstandard_piece_set']
]);
```

- [ ] **Step 2: Run test and confirm current failure**

Run:

```powershell
node --test scripts/data/fetch/fetch-wiki-armor-sets.test.mjs
```

Expected: FAIL because current parser stops before `Wizard set`.

- [ ] **Step 3: Update parser section model**

In `scripts/data/fetch/fetch-wiki-armor-sets.mjs`, replace the two-section-only `WIKI_SECTIONS` with explicit section descriptors:

```js
const WIKI_SECTIONS = [
  { code: 'pre-hardmode', compositionKind: 'traditional_set', wikiStart: '== [[{{tr|Pre-Hardmode}}]] ==', wikiEnd: '== [[{{tr|Hardmode}}]] ==', htmlHeading: '困难模式之前' },
  { code: 'hardmode', compositionKind: 'traditional_set', wikiStart: '== [[{{tr|Hardmode}}]] ==', wikiEnd: '== [[{{tr|Wizard set}}]] ==', htmlHeading: '困难模式' },
  { code: 'wizard-set', compositionKind: 'single_piece_set', wikiStart: '== [[{{tr|Wizard set}}]] ==', wikiEnd: '== Other armor ==', htmlHeading: '巫师套装' },
  { code: 'other-armor', compositionKind: 'nonstandard_piece_set', wikiStart: '== Other armor ==', wikiEnd: '== Vanity items ==', htmlHeading: '其他盔甲' }
];
```

Keep `entityType: "armor_set"` and `compositionKind` on every returned row.

- [ ] **Step 4: Run parser test**

Run:

```powershell
node --test scripts/data/fetch/fetch-wiki-armor-sets.test.mjs
```

Expected: PASS.

## Task 2: Map Single-Piece Set Rows To Real Items

- [ ] **Step 1: Write failing relation processor test**

Add a test to `scripts/data/relation/armor-set-processor.test.mjs` with one `single_piece_set` row:

```js
const actual = buildArmorSetRelations({
  wikiArmorSets: [
    {
      pageTitle: 'Magic Hat',
      nameZh: '魔法帽',
      entityType: 'armor_set',
      compositionKind: 'single_piece_set',
      section: 'wizard-set',
      effectText: '+60 mana',
      images: [{ role: 'male', fileTitle: 'Magic Hat (equipped).png', url: 'https://terraria.wiki.gg/images/Magic_Hat_%28equipped%29.png' }]
    }
  ],
  maintItems: [
    item(2275, 'MagicHat', 'Magic Hat', { headSlot: 80 })
  ]
});

assert.equal(actual.relationArmorSets.length, 1);
assert.equal(actual.relationArmorSetItems.length, 1);
assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [[2275]]);
assert.equal(actual.relationArmorSetItems[0].partRole, 'head');
assert.equal(actual.issues.length, 0);
```

- [ ] **Step 2: Run relation test and confirm failure**

Run:

```powershell
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: FAIL if current matching only builds variants from grouped full armor names.

- [ ] **Step 3: Implement single-piece set matcher**

In `scripts/data/relation/armor-set-processor.mjs`, add a direct item title matcher for non-`traditional_set` rows:

```js
function findWikiSinglePieceArmorSetItem(record, slotItems) {
  const pageKey = normalizeNameKey(record.pageTitle);
  if (!pageKey) return [];
  return slotItems
    .filter((entry) => normalizeNameKey(entry.item.english_name ?? entry.item.englishName ?? entry.item.name) === pageKey)
    .slice(0, 1);
}
```

Use it in `buildWikiArmorSetRelations`:

```js
const compositionKind = normalizeText(record.compositionKind) ?? 'traditional_set';
const setItems = compositionKind === 'traditional_set'
  ? findWikiArmorItems(record, slotItems)
  : findWikiSinglePieceArmorSetItem(record, slotItems);
const variants = compositionKind === 'traditional_set'
  ? cartesianArmorSets(groups)
  : setItems.map((entry) => [entry.sourceId]);
```

Also include `entityType` and `compositionKind` in `rawJson`.

- [ ] **Step 4: Run relation test**

Run:

```powershell
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: PASS.

## Task 3: Keep Projection UI-Safe

- [ ] **Step 1: Write projection test**

Add a single-piece set projection case in `scripts/data/relation/projection-sync.test.mjs`:

```js
assert.equal(actual.projectionArmorSets[0].setCount, 1);
assert.equal(actual.projectionArmorSets[0].uniqueItemCount, 1);
assert.deepEqual(JSON.parse(actual.projectionArmorSets[0].currentItemIdsJson), [2275]);
assert.equal(JSON.parse(actual.projectionArmorSets[0].relatedItemsJson)[0].partRole, 'head');
assert.equal(actual.projectionArmorSets[0].mappingStatus, 'mapped');
```

- [ ] **Step 2: Run projection test**

Run:

```powershell
node --test scripts/data/relation/projection-sync.test.mjs
```

Expected: PASS or expose a concrete one-item variant defect.

- [ ] **Step 3: Patch projection only if the test fails**

If needed, update `projection-sync.mjs` so one-item rows keep the existing `relatedItemsJson` shape and image fallback:

```js
image: projectionItem?.image ?? findArmorSetPartImageUrl(item, images) ?? wikiItemFileUrl(item)
```

- [ ] **Step 4: Run projection test again**

Run:

```powershell
node --test scripts/data/relation/projection-sync.test.mjs
```

Expected: PASS.

## Task 4: Add Coverage Audit

- [ ] **Step 1: Create audit script**

Create `scripts/data/audit/audit-armor-set-source-coverage.mjs` with this behavior:

```js
const sourceRows = readJson('data/generated/wiki-armor-sets.latest.json').records ?? [];
const acceptedSourceKeys = new Set(sourceRows.map((row) => `${row.compositionKind}:${row.pageTitle}`));
const projectedKeys = new Set(apiRows.map((row) => `${row.compositionKind ?? inferCompositionKind(row)}:${row.sourceKey}`));
const missing = [...acceptedSourceKeys].filter((key) => !projectedKeys.has(key));
```

The report must include:

```json
{
  "sourceTotal": 0,
  "projectionTotal": 0,
  "apiTotal": 0,
  "missingFromProjection": [],
  "missingFromApi": [],
  "unmappedItems": []
}
```

- [ ] **Step 2: Run audit before fixes**

Run:

```powershell
node scripts/data/audit/audit-armor-set-source-coverage.mjs --api-base=http://localhost:3001/api --username=admin --password=admin123456
```

Expected: report shows current `sourceTotal=67` before parser change; after parser change it must show any missing projection rows until relation sync runs.

- [ ] **Step 3: Add audit test**

Create `scripts/data/audit/audit-armor-set-source-coverage.test.mjs` for a small in-memory sample:

```js
assert.deepEqual(findMissingRows(
  [{ pageTitle: 'Magic Hat', entityType: 'armor_set', compositionKind: 'single_piece_set' }],
  [{ sourceKey: 'Magic Hat', entityType: 'armor_set', compositionKind: 'single_piece_set' }]
), []);
```

- [ ] **Step 4: Run audit test**

Run:

```powershell
node --test scripts/data/audit/audit-armor-set-source-coverage.test.mjs
```

Expected: PASS.

## Task 5: Dry-Run The Full Data Chain

- [ ] **Step 1: Regenerate source**

Run:

```powershell
node scripts/data/fetch/fetch-wiki-armor-sets.mjs
```

Expected: `data/generated/wiki-armor-sets.latest.json` total is greater than `67` if upstream still exposes wizard/nonstandard armor-set rows.

- [ ] **Step 2: Dry-run relation sync**

Run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armorSet --apply=false
```

Expected: `reports/relation/relation-audit-2026-04-28.json` has `entityBreakdown.armorSet` greater than current `67` and no `wiki_armor_set_items_missing` for accepted single-piece set rows.

- [ ] **Step 3: Inspect unresolved armor issues**

Run:

```powershell
rg -n "wiki_armor_set_items_missing|armor_set_item_missing|Magic Hat|Wizard Hat|Night Vision Helmet" reports/relation/relation-unresolved-2026-04-28.json
```

Expected: no accepted row appears as missing unless the item does not exist in `maint_items`; any missing row has a concrete item title and source section.

## Task 6: Apply Only After Counts Match

- [ ] **Step 1: Check target DB state**

Run SQL against `terria_v1_relation`:

```sql
SELECT COUNT(*) FROM projection_armor_sets;
SELECT mapping_status, COUNT(*) FROM projection_armor_sets GROUP BY mapping_status;
```

Expected before apply: current count remains `67`.

- [ ] **Step 2: Apply relation sync**

Run only after Task 5 passes:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armorSet --apply=true
```

Expected: writes complete and relation reports are regenerated.

- [ ] **Step 3: Re-run API audit**

Run:

```powershell
node scripts/data/audit/audit-armor-set-source-coverage.mjs --api-base=http://localhost:3001/api --username=admin --password=admin123456
```

Expected:

```json
{
  "missingFromProjection": [],
  "missingFromApi": [],
  "unmappedItems": []
}
```

## Task 7: Runtime Page Verification

- [ ] **Step 1: Verify API pagination**

Run:

```powershell
$login = Invoke-RestMethod -Uri 'http://localhost:3001/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"username":"admin","password":"admin123456"}'
$token = $login.data.token
Invoke-RestMethod -Uri 'http://localhost:3001/api/admin/armor-sets?page=1&limit=100' -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 8
```

Expected: response includes traditional rows and single-piece set rows, all with `relatedItems` populated.

- [ ] **Step 2: Verify page behavior**

Open:

```text
http://localhost:3001/entities/armor-sets?page=3
```

Expected: single-piece set rows show one related item, one variant, image fallback if available, and no empty "具体套装与 ID" cards.

- [ ] **Step 3: Add UI patch only if needed**

If one-item variants display awkwardly, adjust `normalizeArmorSetVariantRows` or detail labels in `data-query-app/pages/entities/[type].vue` so a one-item set is rendered as a valid one-piece variant.

## Verification Commands

Run this set before completion:

```powershell
node --test scripts/data/fetch/fetch-wiki-armor-sets.test.mjs
node --test scripts/data/relation/armor-set-processor.test.mjs
node --test scripts/data/relation/projection-sync.test.mjs
node --test scripts/data/audit/audit-armor-set-source-coverage.test.mjs
node --check scripts/data/fetch/fetch-wiki-armor-sets.mjs
node --check scripts/data/relation/armor-set-processor.mjs
node --check scripts/data/relation/projection-sync.mjs
node --check scripts/data/audit/audit-armor-set-source-coverage.mjs
```

If backend normalization is changed:

```powershell
cd back
mvn "-Dtest=AdminArmorSetControllerTest" test
```

If UI is changed:

```powershell
cd data-query-app
pnpm run check
```

## Rollback Plan

- Revert parser and processor changes.
- Regenerate `data/generated/wiki-armor-sets.latest.json` from the previous implementation.
- Re-run `sync-maint-to-relation.mjs --apply=true` only if the apply step had already been executed.
- Confirm `/api/admin/armor-sets` total returns to the previous `67`.

## Self-Review

- Spec coverage: covers source parsing, relation mapping, projection payload, API/page rendering, audit, dry-run, apply, and rollback.
- Placeholder scan: no unresolved placeholder language remains.
- Type consistency: `entityType`, `compositionKind`, `pageTitle`, `sourceKey`, `currentItemIdsJson`, and `relatedItemsJson` are consistently named across source, relation, projection, audit, and page validation.
