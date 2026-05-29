# Item Category Taxonomy Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the item category chain so crawled wiki page taxonomy classifies all item domains correctly, with `DrillContainmentUnit` and other mount summons no longer landing in `MATERIAL`.

**Architecture:** Keep raw wiki item pages as the authoritative category evidence, use standardized items only for identity and fallback, and sync category updates through the existing manual dry-run/apply script. Add shared taxonomy definitions, classifier tests, and a read-only audit script before any DB mutation.

**Tech Stack:** Node.js ESM scripts and `node:test`, MySQL via existing `mysql2` scripts, Spring/Flyway migration tests only if a schema migration is needed.

---

## File Map

- Modify: `scripts/data/lib/item-category-normalization.mjs`
  - Owns shared category definitions and legacy-code normalization for import/backfill paths.
- Modify: `scripts/data/lib/item-category-normalization.test.mjs`
  - Verifies shared category definitions include all classifier output families.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
  - Owns raw wiki item page classification, category upsert, dry-run reporting, and apply behavior.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
  - Verifies category classifier behavior across mounts and representative item families.
- Create: `scripts/data/audit/audit-item-category-taxonomy.mjs`
  - Read-only audit for raw page availability, classifier distribution, verified sample results, and suspicious legacy material rows.
- Create: `scripts/data/audit/audit-item-category-taxonomy.test.mjs`
  - Verifies missing raw pages block classification and known samples are reported.
- Optional modify: `back/src/main/resources/db/migration/V47__expand_item_category_taxonomy.sql`
  - Only if category upsert through scripts is not enough for runtime bootstrapping.
- Optional create: `scripts/data/sync/item-category-taxonomy-expansion.test.mjs`
  - Only if adding a Flyway SQL migration.
- Modify: `docs/superpowers/specs/2026-05-29-item-category-taxonomy-repair-design.md`
  - Keep design updated if execution discovers a chain gap.
- Modify: this plan file when a task uncovers a critical plan gap.

## Task 1: Lock Regression Samples And Taxonomy Definitions

**Files:**
- Modify: `scripts/data/lib/item-category-normalization.mjs`
- Modify: `scripts/data/lib/item-category-normalization.test.mjs`

- [ ] **Step 1: Write failing tests for full taxonomy definition coverage**

Add tests that assert `CATEGORY_DEFINITIONS` contains these codes with stable parentage:

```js
const expectedDefinitions = [
  ['ACCESSORY', null],
  ['ACCESSORY_SHIELD', 'ACCESSORY'],
  ['ACCESSORY_BOOTS', 'ACCESSORY'],
  ['ACCESSORY_WINGS', 'ACCESSORY'],
  ['ACCESSORY_MISC', 'ACCESSORY'],
  ['AMMUNITION', null],
  ['AMMUNITION_ARROW', 'AMMUNITION'],
  ['AMMUNITION_BULLET', 'AMMUNITION'],
  ['AMMUNITION_ROCKET', 'AMMUNITION'],
  ['AMMUNITION_DART', 'AMMUNITION'],
  ['AMMUNITION_FLASH', 'AMMUNITION'],
  ['AMMUNITION_TOOL_BAIT', 'AMMUNITION'],
  ['AMMUNITION_TOOL_SOLUTION', 'AMMUNITION'],
  ['AMMUNITION_TOOL_WIRE', 'AMMUNITION'],
  ['AMMUNITION_OTHER_TYPE', 'AMMUNITION'],
  ['PET', null],
  ['MOUNT', null],
  ['VANITY', null],
  ['DYE', null],
  ['CRITTER', null],
  ['MISC', null],
  ['CONSUMABLE_POTION', 'CONSUMABLE'],
  ['CONSUMABLE_SUMMON', 'CONSUMABLE'],
  ['CONSUMABLE_GRAB_BAG', 'CONSUMABLE'],
  ['CONSUMABLE_PERMANENT_BOOSTER', 'CONSUMABLE'],
  ['CONSUMABLE_MISC', 'CONSUMABLE'],
  ['CONSUMABLE_FOOD', 'CONSUMABLE'],
  ['MATERIAL_ORE', 'MATERIAL'],
  ['MATERIAL_BAR', 'MATERIAL'],
  ['MATERIAL_GEM', 'MATERIAL'],
  ['MATERIAL_SEED', 'MATERIAL'],
  ['MATERIAL_POTION_INGREDIENT', 'MATERIAL'],
  ['MATERIAL_BLOCK', 'MATERIAL'],
  ['MATERIAL_BRICK', 'MATERIAL'],
  ['MATERIAL_WALL', 'MATERIAL'],
  ['MATERIAL_MISC', 'MATERIAL'],
  ['MATERIAL_CURRENCY', 'MATERIAL'],
  ['MATERIAL_KEY', 'MATERIAL'],
  ['FURNITURE_CRAFTING_STATION', 'FURNITURE'],
  ['FURNITURE_STORAGE', 'FURNITURE'],
  ['FURNITURE_LIGHT', 'FURNITURE'],
  ['FURNITURE_FUNCTIONAL', 'FURNITURE'],
  ['FURNITURE_DECORATION', 'FURNITURE'],
  ['WEAPON_MELEE', 'WEAPON'],
  ['WEAPON_MELEE_SWORD', 'WEAPON_MELEE'],
  ['WEAPON_MELEE_BOOMERANG', 'WEAPON_MELEE'],
  ['WEAPON_MELEE_YOYO', 'WEAPON_MELEE'],
  ['WEAPON_MELEE_SPEAR', 'WEAPON_MELEE'],
  ['WEAPON_MELEE_FLAIL', 'WEAPON_MELEE'],
  ['WEAPON_MELEE_OTHER', 'WEAPON_MELEE'],
  ['WEAPON_RANGED', 'WEAPON'],
  ['WEAPON_RANGED_BOW_CROSSBOW', 'WEAPON_RANGED'],
  ['WEAPON_RANGED_GUN', 'WEAPON_RANGED'],
  ['WEAPON_RANGED_LAUNCHER', 'WEAPON_RANGED'],
  ['WEAPON_RANGED_CONSUMABLE', 'WEAPON_RANGED'],
  ['WEAPON_RANGED_OTHER', 'WEAPON_RANGED'],
  ['WEAPON_MAGIC', 'WEAPON'],
  ['WEAPON_MAGIC_GUN', 'WEAPON_MAGIC'],
  ['WEAPON_MAGIC_SPELLBOOK', 'WEAPON_MAGIC'],
  ['WEAPON_MAGIC_WAND', 'WEAPON_MAGIC'],
  ['WEAPON_SUMMON', 'WEAPON'],
  ['WEAPON_SUMMON_WHIP', 'WEAPON_SUMMON'],
  ['WEAPON_SUMMON_MINION', 'WEAPON_SUMMON'],
  ['WEAPON_SUMMON_SENTRY', 'WEAPON_SUMMON'],
  ['WEAPON_OTHER', 'WEAPON'],
  ['WEAPON_OTHER_EXPLOSIVE', 'WEAPON_OTHER'],
  ['WEAPON_OTHER_TOOL', 'WEAPON_OTHER'],
  ['ARMOR_OTHER', 'ARMOR'],
];
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test scripts/data/lib/item-category-normalization.test.mjs
```

Expected: FAIL because several category definitions are absent.

- [ ] **Step 3: Expand category definitions**

Update `CATEGORY_DEFINITIONS` with the missing codes and parent links. Preserve existing root codes and existing tool/armor definitions. Use `topType` equal to the root family (`MOUNT`, `PET`, `ACCESSORY`, `AMMUNITION`, `WEAPON`, `MATERIAL`, `FURNITURE`, `CONSUMABLE`, `TOOL`, `ARMOR`) and stable sort values.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/lib/item-category-normalization.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/lib/item-category-normalization.mjs scripts/data/lib/item-category-normalization.test.mjs
git commit -m "data: expand item category taxonomy definitions"
```

## Task 2: Add Classifier Regression Coverage

**Files:**
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`

- [ ] **Step 1: Add failing mount and representative category tests**

Add tests using inline wiki payloads. Include these exact expectations:

```js
const categoryLookup = {
  byCode: new Map([
    ['MOUNT', { id: 1 }],
    ['PET', { id: 2 }],
    ['ACCESSORY_MISC', { id: 3 }],
    ['AMMUNITION_ARROW', { id: 4 }],
    ['CONSUMABLE_POTION', { id: 5 }],
    ['CONSUMABLE_SUMMON', { id: 6 }],
    ['CONSUMABLE_GRAB_BAG', { id: 7 }],
    ['FURNITURE_CRAFTING_STATION', { id: 8 }],
    ['FURNITURE_LIGHT', { id: 9 }],
    ['MATERIAL_BAR', { id: 10 }],
    ['TOOL_DRILL', { id: 11 }],
    ['TOOL_PICKAXE', { id: 12 }],
    ['TOOL_AXE', { id: 13 }],
    ['TOOL_CHAINSAW', { id: 14 }],
    ['ARMOR_PART_HEAD', { id: 15 }],
    ['ARMOR_PART_BODY', { id: 16 }],
    ['ARMOR_PART_LEGS', { id: 17 }],
  ]),
  depthByCode: new Map(),
  parentCodeByCode: new Map(),
};
```

Test samples:

```js
[
  ['Drill Containment Unit', 'DrillContainmentUnit', 'Mount summon', 'MOUNT'],
  ['Slimy Saddle', 'SlimySaddle', 'Mount summon', 'MOUNT'],
  ['Fuzzy Carrot', 'FuzzyCarrot', 'Mount summon', 'MOUNT'],
  ['Cosmic Car Key', 'CosmicCarKey', 'Mount summon', 'MOUNT'],
  ["Witch's Broom", 'WitchBroom', 'Mount summon', 'MOUNT'],
  ['Cursed Piper Flute', 'RatMountItem', 'Mount summon', 'MOUNT'],
  ['Dog Whistle', 'DogWhistle', 'Pet summon', 'PET'],
  ['Cloud in a Bottle', 'CloudinaBottle', 'Accessory', 'ACCESSORY_MISC'],
  ['Wooden Arrow', 'WoodenArrow', 'Ammunition', 'AMMUNITION_ARROW'],
  ['Ironskin Potion', 'IronskinPotion', 'Potion / Consumable', 'CONSUMABLE_POTION'],
  ['Suspicious Looking Eye', 'SuspiciousLookingEye', 'Boss summon / Consumable', 'CONSUMABLE_SUMMON'],
  ['Treasure Bag', 'KingSlimeBossBag', 'Grab bag / Consumable', 'CONSUMABLE_GRAB_BAG'],
  ['Iron Anvil', 'IronAnvil', 'Furniture / Crafting station', 'FURNITURE_CRAFTING_STATION'],
  ['Torch', 'Torch', 'Furniture / Light source', 'FURNITURE_LIGHT'],
  ['Luminite Bar', 'LunarBar', 'Bar / Crafting material', 'MATERIAL_BAR'],
]
```

Each inline wiki payload should include:

```js
wiki: {
  wikitext: `
{{item infobox
| type = ${type}
}}
  `
}
```

- [ ] **Step 2: Run test to verify current gaps**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: FAIL for any unsupported token/category definition gaps.

- [ ] **Step 3: Repair classifier token handling**

Update `classifyByTypeTokens`, `classifyByTemplates`, and name heuristics only as needed. Keep explicit infobox type tokens ahead of standardized fallback. Ensure `Mount summon` beats `MATERIAL` fallback for `DrillContainmentUnit`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs scripts/data/lib/item-category-normalization.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/sync/sync-item-categories-from-wiki-pages.mjs scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
git commit -m "fix(data): classify wiki item taxonomy leaves"
```

## Task 3: Add Read-Only Category Taxonomy Audit

**Files:**
- Create: `scripts/data/audit/audit-item-category-taxonomy.mjs`
- Create: `scripts/data/audit/audit-item-category-taxonomy.test.mjs`

- [ ] **Step 1: Write failing audit tests**

Test two behaviors:

1. Missing raw item-pages directory returns `status: "blocked"` with `reason: "raw_item_pages_missing"`.
2. Given inline raw pages and standardized records, the audit reports `DrillContainmentUnit` as `expectedCategoryCode: "MOUNT"` and `currentCategoryCode: "MATERIAL"`.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: FAIL because the audit script does not exist.

- [ ] **Step 3: Implement audit script**

Export a testable function:

```js
export function auditItemCategoryTaxonomy({
  standardizedRecords,
  rawPagesByInternal,
  rawPagesDir,
  classifier,
  verifiedInternalNames = ['DrillContainmentUnit', 'SlimySaddle', 'FuzzyCarrot', 'CosmicCarKey', 'WitchBroom', 'RatMountItem'],
} = {}) {
  return {
    status,
    blockers,
    summary,
    distribution,
    verifiedSamples,
    suspiciousMaterials,
  };
}
```

`status` is `blocked` when raw pages are missing, `warning` when classifier output contains skipped categories or suspicious material rows, and `pass` when raw pages are present and verified samples classify correctly. `blockers` uses machine-readable reasons such as `raw_item_pages_missing`. `summary` contains counts. `distribution` is keyed by classifier category code. `verifiedSamples` lists the fixed regression items. `suspiciousMaterials` lists standardized `MATERIAL` records whose raw page classifier predicts a non-material category.

CLI behavior:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --rawItemPagesDir=/path/to/item-pages --standardized=data/standardized/items.standardized.json --format=json
```

The script must not connect to MySQL and must not write DB rows.

- [ ] **Step 4: Add report fields**

The JSON output must include:

```json
{
  "status": "pass|warning|blocked",
  "blockers": [],
  "summary": {
    "standardizedRecords": 6131,
    "rawPages": 0,
    "classified": 0,
    "changedFromStandardized": 0
  },
  "distribution": {},
  "verifiedSamples": [],
  "suspiciousMaterials": []
}
```

- [ ] **Step 5: Run audit tests**

Run:

```bash
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run audit in current WSL workspace**

Run:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --format=json
```

Expected: `status` is `blocked` and `blockers` contains `raw_item_pages_missing`.

- [ ] **Step 7: Commit**

```bash
git add scripts/data/audit/audit-item-category-taxonomy.mjs scripts/data/audit/audit-item-category-taxonomy.test.mjs
git commit -m "test(data): audit item category taxonomy coverage"
```

## Task 4: DB Dry-Run Contract And Manual Apply Gate

**Files:**
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
- Optional modify: `docs/runbooks/item-category-taxonomy-repair.md`

- [ ] **Step 1: Add tests for missing raw directory and dry-run report shape**

Assert `runItemCategorySync` fails clearly when `itemPagesDir` is missing and dependencies do not inject `wikiPagesByInternal`.

Assert dry-run samples include:

```js
{
  internalName: 'DrillContainmentUnit',
  currentCategoryCode: 'MATERIAL',
  nextCategoryCode: 'MOUNT',
  reason: 'type:mount summon'
}
```

- [ ] **Step 2: Run focused test**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: FAIL until report fields are complete.

- [ ] **Step 3: Improve report and guardrails**

Ensure dry-run report includes:

- `apply`
- `db.database`
- `itemPagesDir`
- `scanned`
- `wikiMatched`
- `classified`
- `updated`
- `skippedNoWiki`
- `skippedNoCategory`
- `categoryDistribution`
- `changedSamples`
- `verifiedSamples`

Keep `apply=false` as default.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Write manual runbook**

Create `docs/runbooks/item-category-taxonomy-repair.md` with these commands and warnings:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --rawItemPagesDir=/path/to/raw/wiki/item-pages --format=json

node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --itemPagesDir=/path/to/raw/wiki/item-pages \
  --apply=false \
  --report=reports/items-wiki-category-sync-$(date +%F).json

node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --itemPagesDir=/path/to/raw/wiki/item-pages \
  --apply=true \
  --report=reports/items-wiki-category-sync-$(date +%F).apply.json
```

State that apply is manual only and must be preceded by DB snapshot/backup.

- [ ] **Step 6: Commit**

```bash
git add scripts/data/sync/sync-item-categories-from-wiki-pages.mjs scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs docs/runbooks/item-category-taxonomy-repair.md
git commit -m "chore(data): harden item category sync dry-run"
```

## Task 5: Optional SQL Bootstrap Migration

**Files:**
- Optional create: `back/src/main/resources/db/migration/V47__expand_item_category_taxonomy.sql`
- Optional create: `scripts/data/sync/item-category-taxonomy-expansion.test.mjs`

- [ ] **Step 1: Decide if SQL migration is needed**

Run the dry-run sync category upsert tests. If `ensureCategories` creates all missing category rows reliably, skip this task and record that decision in the final handoff.

- [ ] **Step 2: If needed, write migration test first**

Create a migration test that asserts the SQL contains every category code from `CATEGORY_DEFINITIONS` and uses `ON DUPLICATE KEY UPDATE deleted = 0`.

- [ ] **Step 3: Implement migration**

Create `V47__expand_item_category_taxonomy.sql` with idempotent upserts into `category`. Do not update `items` in this migration; item assignment remains the script's job.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test scripts/data/sync/item-category-taxonomy-expansion.test.mjs scripts/data/sync/item-category-taxonomy-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit if task was needed**

```bash
git add back/src/main/resources/db/migration/V47__expand_item_category_taxonomy.sql scripts/data/sync/item-category-taxonomy-expansion.test.mjs
git commit -m "data: bootstrap expanded item category taxonomy"
```

## Task 6: Validation And Closeout

**Files:**
- No planned code changes.

- [ ] **Step 1: Run all category tests**

Run:

```bash
node --test \
  scripts/data/lib/item-category-normalization.test.mjs \
  scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs \
  scripts/data/audit/audit-item-category-taxonomy.test.mjs \
  scripts/data/sync/item-category-taxonomy-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run audit in current workspace**

Run:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --format=json
```

Expected in this WSL workspace: `blocked` because raw item pages are missing. This is acceptable only if the blocker is explicit.

- [ ] **Step 3: If raw item pages are available, run dry-run**

Run:

```bash
node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --itemPagesDir=/path/to/raw/wiki/item-pages \
  --apply=false \
  --report=reports/items-wiki-category-sync-$(date +%F).json
```

Expected:

- `MOUNT` classified count is greater than 0.
- Verified samples show `nextCategoryCode: "MOUNT"`.
- `skippedNoCategory` is 0 or every skipped category has a named follow-up.

- [ ] **Step 4: Run backend focused tests if Java files or migration changed**

Run:

```bash
cd back && mvn -Dtest=ItemImportServiceImplTest,ItemImportRegressionTest test
```

Expected: PASS.

- [ ] **Step 5: Check git scope**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected: only category taxonomy repair files are changed/committed.

- [ ] **Step 6: Final handoff**

Report:

- Whether raw item pages were available.
- Whether audit was blocked or passed.
- Whether dry-run showed `DrillContainmentUnit -> MOUNT`.
- Whether SQL migration was needed or skipped.
- Exact command to run manual apply, but do not run it unless explicitly requested.
