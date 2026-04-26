# Item Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining `items` gaps so `projection_items` can replace `local.items` under the existing relation-replace-local acceptance rules.

**Architecture:** Treat `maint` as the only fact source, fix item-field loss and missing source chains there first, then let `relation_items`, `relation_item_images`, and `projection_items` consume only source-backed fields. The plan is sequenced to remove false blockers first (dropped zero values and weak ingestion), then expand maint-backed assets/prices/text, then rerun full relation sync and readiness audit.

**Tech Stack:** Node.js scripts, MySQL (`terria_v1_maint`, `terria_v1_relation`), Markdown/JSON audit reports, PowerShell entrypoints

---

## File Structure

### Existing Files To Reuse

- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/item-page-statistics-parser.mjs`
- Modify: `scripts/data/maint/item-page-statistics-parser.test.mjs`
- Modify: `scripts/data/relation/base-entity-processor.mjs`
- Modify: `scripts/data/relation/base-entity-processor.test.mjs`
- Modify: `scripts/data/relation/image-processor.mjs`
- Modify: `scripts/data/relation/image-processor.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

### New Files To Create

- Create: `scripts/data/maint/item-field-coverage-audit.mjs`
- Create: `scripts/data/maint/item-field-coverage-audit.test.mjs`
- Create: `scripts/data/maint/sync-standardized-item-images-to-maint.mjs`
- Create: `scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`
- Create: `scripts/data/maint/item-page-text-parser.mjs`
- Create: `scripts/data/maint/item-page-text-parser.test.mjs`
- Create: `reports/relation/item-cutover-*.json`
- Create: `reports/relation/item-cutover-*.md`

### Responsibility Split

- `maint/*`: own source-backed item facts and fix normalization loss
- `relation/*`: mirror/derive only from maint-backed facts
- `reports/relation/*`: prove each milestone changed coverage and readiness
- `project-plan/*issue_log*`: capture unresolved upstream defects instead of guessing

---

## Milestone Overview

### M1: Fix Maint Field Loss

- Goal: remove ingestion defects that currently turn valid item source values into `NULL`
- Target blockers: `damage`, `defense`, `knockback`, `use_time`, `buy`, `stack_size`
- Acceptance:
  - maint audit explains per-field source coverage and normalized-column coverage
  - explicit zero values stay explicit after maint sync
  - `stack_size` anomaly is either fixed or escalated with reproducible evidence

### M2: Expand Maint Asset And Price Coverage

- Goal: push missing item images and sell values into maintainable maint-side tables
- Target blockers: `image`, `sell`
- Acceptance:
  - item image source chain lands in `maint_item_images`
  - item page sell coverage is rerun and quantified
  - relation image/price consumers can read only maint-backed rows

### M3: Build Maint Item Text Source Chain

- Goal: add formal maint-backed item text facts for entity-inherent description/tooltip fields
- Target blockers: `tooltip_zh`, future `tooltip`, `description`, `description_zh`
- Acceptance:
  - maint has an auditable item-text carrier
  - English text extraction is repeatable and tested
  - zh gaps are reported rather than guessed

### M4: Rebuild Relation Item Projection

- Goal: consume the improved maint facts into `relation_items`, `relation_item_images`, and `projection_items`
- Target blockers: all remaining item fields
- Acceptance:
  - relation sync materializes improved item fields from maint only
  - projection field coverage increases for the targeted blockers
  - no local fallback is introduced

### M5: Validate Item Cutover Readiness

- Goal: prove whether `items` becomes switchable and document any final blockers
- Acceptance:
  - full replacement-readiness report is rerun after relation sync
  - item missing/extra row mismatches are enumerated
  - issue log clearly states what remains blocked, if anything

---

## Milestone Details

### Task 1: Lock The Item Baseline And Reproduce Field Loss

**Files:**
- Create: `scripts/data/maint/item-field-coverage-audit.mjs`
- Create: `scripts/data/maint/item-field-coverage-audit.test.mjs`
- Create: `reports/relation/item-cutover-baseline-<date>.json`
- Create: `reports/relation/item-cutover-baseline-<date>.md`

- [ ] **Step 1: Write the failing audit test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildItemFieldCoverageAudit } from './item-field-coverage-audit.mjs';

test('buildItemFieldCoverageAudit reports raw-vs-normalized coverage gaps per item field', () => {
  const audit = buildItemFieldCoverageAudit({
    maintItems: [
      { internal_name: 'Torch', raw_json: '{"damage":0,"maxStack":9999,"value":0}', combat_value: null, stack_size: null, major_value: null },
      { internal_name: 'IronPickaxe', raw_json: '{"damage":5,"maxStack":1,"value":2000}', combat_value: 5, stack_size: 1, major_value: 2000 },
    ],
  });

  assert.equal(audit.fields.damage.rawPresent, 2);
  assert.equal(audit.fields.damage.normalizedPresent, 1);
  assert.equal(audit.fields.stackSize.rawPresent, 2);
  assert.equal(audit.fields.stackSize.normalizedPresent, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/data/maint/item-field-coverage-audit.test.mjs`

Expected: FAIL with `Cannot find export 'buildItemFieldCoverageAudit'` or equivalent missing-module failure.

- [ ] **Step 3: Write minimal audit implementation**

```js
export function buildItemFieldCoverageAudit({ maintItems = [] } = {}) {
  const fields = {
    damage: { rawPresent: 0, normalizedPresent: 0 },
    stackSize: { rawPresent: 0, normalizedPresent: 0 },
  };
  for (const row of maintItems) {
    const raw = JSON.parse(row.raw_json ?? '{}');
    if (raw.damage !== undefined) fields.damage.rawPresent += 1;
    if (row.combat_value !== null && row.combat_value !== undefined) fields.damage.normalizedPresent += 1;
    if (raw.maxStack !== undefined) fields.stackSize.rawPresent += 1;
    if (row.stack_size !== null && row.stack_size !== undefined) fields.stackSize.normalizedPresent += 1;
  }
  return { fields };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/data/maint/item-field-coverage-audit.test.mjs`

Expected: PASS

- [ ] **Step 5: Run the audit against live maint and save the baseline**

Run: `node scripts/data/maint/item-field-coverage-audit.mjs --database=terria_v1_maint --output=reports/relation/item-cutover-baseline-2026-04-26.json`

Expected:
- JSON and Markdown reports exist
- report includes current counts for `image`, `damage`, `defense`, `knockback`, `use_time`, `buy`, `sell`, `rarity_id`, `stack_size`, `tooltip*`, `description*`

### Task 2: Preserve Explicit Zero Values In Maint Item Ingestion

**Files:**
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/maint/item-field-coverage-audit.mjs`

- [ ] **Step 1: Write the failing regression test**

```js
test('extractItemsMaintRows preserves explicit zero-valued item facts instead of coercing them to null', async () => {
  const landingRow = makeLandingRowWithItemModule(`
    return { ["data"] = [=====[{"1":{"name":"Torch","internalName":"Torch","damage":0,"defense":0,"knockBack":0,"useTime":0,"maxStack":9999,"value":0}}]=====] }
  `);
  const actual = await extractMaintEntitiesFromLandingRow(landingRow);
  const row = actual.rows[0];
  assert.equal(row.combatValue, 0);
  assert.equal(row.defenseValue, 0);
  assert.equal(row.useTime, 0);
  assert.equal(row.stackSize, 9999);
  assert.equal(row.majorValue, 0);
});
```

- [ ] **Step 2: Run only that test and verify it fails**

Run: `node --test scripts/data/maint/sync-landing-to-maint.test.mjs`

Expected: FAIL because current normalization uses `Number(value ?? 0) || null`.

- [ ] **Step 3: Replace lossy numeric coercion with zero-safe parsing**

```js
function toNullableNumberPreservingZero(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

majorValue: toNullableNumberPreservingZero(value.value),
combatValue: toNullableNumberPreservingZero(value.damage),
defenseValue: toNullableNumberPreservingZero(value.defense),
useTime: toNullableNumberPreservingZero(value.useTime),
stackSize: toNullableNumberPreservingZero(value.maxStack),
```

- [ ] **Step 4: Run tests and a dry-run maint sync**

Run:
- `node --test scripts/data/maint/sync-landing-to-maint.test.mjs`
- `node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --database=terria_v1_maint --scopes=items`

Expected:
- tests PASS
- dry run completes without SQL errors

- [ ] **Step 5: Re-run the coverage audit and compare counts**

Run: `node scripts/data/maint/item-field-coverage-audit.mjs --database=terria_v1_maint --output=reports/relation/item-cutover-zero-safe-2026-04-26.json`

Expected:
- counts for normalized `damage`, `defense`, `use_time`, `buy`, and possibly `stack_size` increase
- if `stack_size` is still abnormal, capture a separate blocker sample list

### Task 3: Materialize Maint-Backed Item Images

**Files:**
- Create: `scripts/data/maint/sync-standardized-item-images-to-maint.mjs`
- Create: `scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/relation/image-processor.mjs`
- Modify: `scripts/data/relation/image-processor.test.mjs`

- [ ] **Step 1: Write the failing image sync test**

```js
test('sync-standardized-item-images-to-maint writes maint_item_images rows for missing item images', async () => {
  const rows = buildMaintItemImageRows({
    standardizedItems: [{ internalName: 'Torch', imageUrl: 'https://terraria.wiki.gg/images/Torch.png' }],
    existingMaintImages: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemInternalName, 'Torch');
  assert.match(rows[0].originalUrl, /Torch\.png$/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`

Expected: FAIL because the script does not exist yet.

- [ ] **Step 3: Implement the maint image sync script**

```js
export function buildMaintItemImageRows({ standardizedItems = [], existingMaintImages = [] } = {}) {
  const existing = new Set(existingMaintImages.map((row) => row.item_internal_name));
  return standardizedItems
    .filter((item) => item.internalName && item.imageUrl && !existing.has(item.internalName))
    .map((item, index) => ({
      recordKey: `maint_item_images:${item.internalName}:${index}`,
      itemInternalName: item.internalName,
      originalUrl: item.imageUrl,
      cachedUrl: item.imageUrl,
      isPrimary: 1,
      sortOrder: 0,
      sourceProvider: 'standardized',
      sourcePage: 'items.standardized.json',
    }));
}
```

- [ ] **Step 4: Run tests and dry-run the image sync**

Run:
- `node --test scripts/data/maint/sync-standardized-item-images-to-maint.test.mjs`
- `node scripts/data/maint/sync-standardized-item-images-to-maint.mjs --apply=false --database=terria_v1_maint --output=reports/relation/item-image-maint-sync-2026-04-26.json`

Expected:
- tests PASS
- report shows matched standardized rows and unresolved gaps

- [ ] **Step 5: Apply and rebuild relation image projection**

Run:
- `node scripts/data/maint/sync-standardized-item-images-to-maint.mjs --apply=true --database=terria_v1_maint --output=reports/relation/item-image-maint-sync-2026-04-26.json`
- `node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile`

Expected:
- `maint_item_images` count increases
- `relation_item_images` and `projection_items.image` coverage increase after relation sync

### Task 4: Expand Maint-Backed Sell Coverage

**Files:**
- Modify: `scripts/data/maint/item-page-statistics-parser.mjs`
- Modify: `scripts/data/maint/item-page-statistics-parser.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/item-field-coverage-audit.mjs`

- [ ] **Step 1: Write a failing sell parser regression test**

```js
test('extractItemSellStat reads sell values from statistics HTML', () => {
  const actual = extractItemSellStat('<tr><th>Sell</th><td><span class="coin" data-sort-value="400000">4 GC</span></td></tr>');
  assert.equal(actual.sellText, '4 GC');
  assert.equal(actual.sellValue, 400000);
});
```

- [ ] **Step 2: Run the parser tests**

Run: `node --test scripts/data/maint/item-page-statistics-parser.test.mjs`

Expected: PASS if already covered, otherwise FAIL and justify the parser change before proceeding.

- [ ] **Step 3: Add a live-coverage audit path for missing sell rows**

```js
const [pageRows] = await connection.query(`
  SELECT item_internal_name, sell_value, source_revision_timestamp
  FROM maint_item_pages
  WHERE deleted = 0
`);
```

- [ ] **Step 4: Re-fetch or resync missing item pages before applying new relation sync**

Run:
- `node scripts/data/fetch/fetch-wiki-item-pages.mjs --limit=0`
- `node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_pages`

Expected:
- `maint_item_pages.sell_value` coverage is refreshed from current page HTML

- [ ] **Step 5: Save sell coverage report**

Run: `node scripts/data/maint/item-field-coverage-audit.mjs --database=terria_v1_maint --output=reports/relation/item-sell-coverage-2026-04-26.json`

Expected:
- report shows updated `sell` coverage
- unresolved sell gaps are listed by `item_internal_name`

### Task 5: Add Formal Maint Item Text Facts

**Files:**
- Create: `scripts/data/maint/item-page-text-parser.mjs`
- Create: `scripts/data/maint/item-page-text-parser.test.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

- [ ] **Step 1: Write the failing text-parser test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMaintItemTextFacts } from './item-page-text-parser.mjs';

test('extractMaintItemTextFacts emits entity-inherent description facts from item page intro HTML', () => {
  const rows = extractMaintItemTextFacts({
    itemInternalName: 'Torch',
    pageTitle: 'Torch',
    html: '<p>Torch is a basic light source.</p>',
    sourceRevisionTimestamp: '2026-04-26T00:00:00Z',
  });
  assert.equal(rows[0].fieldName, 'description_en');
  assert.equal(rows[0].textValue, 'Torch is a basic light source.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/data/maint/item-page-text-parser.test.mjs`

Expected: FAIL because parser and schema do not exist yet.

- [ ] **Step 3: Add a dedicated maint text-fact table and parser**

```sql
CREATE TABLE IF NOT EXISTS `maint_item_text_facts` (
  `record_key` CHAR(64) NOT NULL,
  `item_internal_name` VARCHAR(255) NOT NULL,
  `field_name` VARCHAR(64) NOT NULL,
  `language_code` VARCHAR(16) NOT NULL,
  `text_value` TEXT NOT NULL,
  `source_section` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`record_key`)
);
```

```js
export function extractMaintItemTextFacts(payload) {
  const description = extractIntroParagraphs(payload.html ?? '')[0] ?? null;
  return description ? [{
    fieldName: 'description_en',
    languageCode: 'en',
    textValue: description,
    sourceSection: 'intro',
  }] : [];
}
```

- [ ] **Step 4: Run tests and maint item-page sync**

Run:
- `node --test scripts/data/maint/item-page-text-parser.test.mjs`
- `node scripts/data/maint/sync-landing-to-maint.mjs --apply=true --database=terria_v1_maint --scopes=item_pages`

Expected:
- tests PASS
- `maint_item_text_facts` populates with auditable English description rows

- [ ] **Step 5: Record unresolved zh text gaps in the issue log**

Run: none

Expected edit:
- add a new issue-log entry listing `description_zh` / `tooltip_zh` as source-chain-open until a trusted zh source lands

### Task 6: Rebuild Relation Items And Revalidate Readiness

**Files:**
- Modify: `scripts/data/relation/base-entity-processor.mjs`
- Modify: `scripts/data/relation/base-entity-processor.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `reports/relation/replacement-readiness-*.json`
- Modify: `reports/relation/replacement-readiness-*.md`

- [ ] **Step 1: Write failing relation/projection tests for the newly maintained item fields**

```js
test('buildBaseEntityRelations carries sell and zero-safe numeric item facts from maint into relation_items', () => {
  const actual = buildBaseEntityRelations({
    maintItems: [{ source_id: 8, internal_name: 'Torch', raw_json: '{"damage":0,"value":0,"rare":1}', combat_value: 0, use_time: 0, stack_size: 9999 }],
    maintItemPages: [{ item_internal_name: 'Torch', sell_value: 10, sell_text: '10 CP' }],
  });
  assert.equal(actual.relationItems[0].combatValue, 0);
  assert.equal(actual.relationItems[0].sellRaw, 10);
});
```

- [ ] **Step 2: Run the focused relation tests**

Run:
- `node --test scripts/data/relation/base-entity-processor.test.mjs`
- `node --test scripts/data/relation/projection-sync.test.mjs`

Expected: FAIL on any field not yet consumed from the improved maint source chain.

- [ ] **Step 3: Update relation and projection consumers**

```js
record.sellRaw = toNullableNumber(itemPage.sell_value);
record.stackSize = toNullableNumber(row.stack_size);
damage: toNullableNumber(raw.damage ?? row.combatValue),
buy: toNullableNumber(row.valueRaw ?? raw.value ?? row.majorValue),
```

- [ ] **Step 4: Run full relation rebuild and readiness audit**

Run:
- `node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --scopes=category,recipe,npc,buff,biome,projectile`
- `node scripts/data/relation/replacement-readiness-audit.mjs`

Expected:
- `projection_items` is rebuilt from maint-backed facts only
- `reports/relation/replacement-readiness-2026-04-25.md` updates the item blocker list

- [ ] **Step 5: Save milestone report and commit**

Run:
- `git add scripts/data/maint scripts/data/relation reports/relation project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- `git commit -m "feat: advance item cutover coverage"`

Expected:
- one milestone-sized commit with tests and reports included

---

## Execution Rules

- [ ] Execute milestones in order: zero-loss first, then images/sell, then text, then relation rebuild
- [ ] Never backfill from `local` into `maint`, `relation`, or `projection`
- [ ] Any field without a trusted source chain stays `NULL` and goes to report / issue log
- [ ] Every milestone ends with:
  - updated coverage numbers
  - sample evidence rows
  - explicit unresolved list

---

## Milestone Success Criteria

- M1 success: audit proves current field loss and zero-safe maint ingestion is fixed
- M2 success: image and sell coverage improve through maint-backed tables only
- M3 success: item text has a formal maint-backed carrier and unresolved zh gaps are explicit
- M4 success: relation/projection consume the new maint facts without local fallback
- M5 success: readiness report either marks `items` switchable or isolates the final blocker set with evidence
