# Armor Set Three-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move armor set facts off legacy local tables and onto the maint -> relation -> projection chain.

**Architecture:** Preserve stable upstream armor definitions in maint, expand them into relation armor set/entity/image rows, and expose a local-compatible `projection_armor_sets` read model. Backend admin reads projection first and only falls back to old local tables when the projection table is absent.

**Tech Stack:** Node.js test runner, MySQL-compatible DDL generators, Spring Boot 3, JdbcTemplate, Jackson, JUnit 5.

---

## File Structure

- Modify `scripts/tooling/upstream-monitor/check-upstream-updates.mjs`
  - Add `armor_sets` and `armor_set` aliases for `Module:ArmorSetBonuses`.
- Create `scripts/tooling/upstream-monitor/check-upstream-updates.test.mjs`
  - Verifies the new alias via a CLI dry monitor run with a stub source fetch.
- Modify `scripts/data/normalize/normalize-wiki-items.mjs`
  - Preserve equipment slot facts under `equipment`.
- Create `scripts/data/normalize/normalize-wiki-items.test.mjs`
  - Tests item equipment slot normalization.
- Modify `scripts/data/transform/standardize-existing-data.mjs`
  - Carry `equipment` into `items.standardized.json`.
- Create `scripts/data/transform/standardize-existing-data.test.mjs`
  - Tests standardized item equipment fields.
- Create `scripts/data/relation/armor-set-processor.mjs`
  - Builds `relationArmorSets`, `relationArmorSetItems`, `relationArmorSetImages`, and issues from maint armor sets/items/images.
- Create `scripts/data/relation/armor-set-processor.test.mjs`
  - Tests variants, slot resolution, image role mapping, and missing item issues.
- Modify `scripts/data/relation/relation-schema.mjs`
  - Adds armor set relation table names and DDL.
- Modify `scripts/data/relation/relation-schema.test.mjs`
  - Asserts armor table order and required columns.
- Modify `scripts/data/relation/projection-schema.mjs`
  - Adds `projection_armor_sets`.
- Modify `scripts/data/relation/projection-schema.test.mjs`
  - Asserts projection armor set columns.
- Modify `scripts/data/relation/projection-sync.mjs`
  - Adds `projectionArmorSets` output.
- Modify `scripts/data/relation/projection-sync.test.mjs`
  - Asserts armor projection shape.
- Modify `scripts/data/relation/sync-maint-to-relation.mjs`
  - Loads maint armor sets and optional armor images, calls armor processor, writes relation/projection rows, and includes counts in summaries.
- Modify `scripts/data/relation/sync-maint-to-relation.test.mjs`
  - Asserts dry-run includes armor rows without local input.
- Modify `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`
  - Reads `projection_armor_sets` first for list/detail, falls back to existing legacy path when absent.
- Create `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
  - Tests projection-first and fallback behavior.

## Task 1: Upstream Monitor Alias

**Files:**
- Modify: `scripts/tooling/upstream-monitor/check-upstream-updates.mjs`
- Test: `scripts/tooling/upstream-monitor/check-upstream-updates.test.mjs`

- [ ] **Step 1: Write failing alias test**

Create a test that runs the monitor with:

```powershell
node scripts/tooling/upstream-monitor/check-upstream-updates.mjs --modules=armor_sets --check-official=false --write-state=false --state-file=reports/runtime/test-armor-state.json --output-file=reports/runtime/test-armor-output.json --format=json
```

The test stubs wiki fetching by setting `TERRAPEDIA_UPSTREAM_MONITOR_STUB_MODULES` to JSON with `Module:ArmorSetBonuses`. It asserts the command exits `0` and reports one module checked.

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test scripts/tooling/upstream-monitor/check-upstream-updates.test.mjs
```

Expected: failure because `armor_sets` is not accepted.

- [ ] **Step 3: Implement alias**

Add:

```js
armor_sets: 'armorsetbonuses',
armor_set: 'armorsetbonuses',
```

Add the small stub hook inside `loadWikiUtils()` so the test can avoid network.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node --test scripts/tooling/upstream-monitor/check-upstream-updates.test.mjs
```

Expected: pass.

## Task 2: Preserve Item Equipment Slots

**Files:**
- Modify: `scripts/data/normalize/normalize-wiki-items.mjs`
- Test: `scripts/data/normalize/normalize-wiki-items.test.mjs`
- Modify: `scripts/data/transform/standardize-existing-data.mjs`
- Test: `scripts/data/transform/standardize-existing-data.test.mjs`

- [ ] **Step 1: Write failing normalize test**

Use a fixture item:

```js
{
  name: 'Wood Helmet',
  internalName: 'WoodHelmet',
  headSlot: 52,
  bodySlot: -1,
  legSlot: -1,
  defense: 1
}
```

Assert `normalizeItemForTest(...).equipment` equals:

```js
{ headSlot: 52, bodySlot: null, legSlot: null }
```

- [ ] **Step 2: Write failing standardize test**

Assert standardized item records carry:

```js
equipment: { headSlot: 52, bodySlot: null, legSlot: null }
```

- [ ] **Step 3: Run RED**

Run:

```powershell
node --test scripts/data/normalize/normalize-wiki-items.test.mjs scripts/data/transform/standardize-existing-data.test.mjs
```

Expected: failures because test exports/equipment fields do not exist.

- [ ] **Step 4: Implement minimal exports and equipment mapping**

Export small test helpers:

```js
export function normalizeItemForTest(item, overrides = { exactInternalName: {}, exactName: {} }) {
  return stripUndefinedFields(normalizeItem(item, overrides));
}

export function standardizeItemForTest(item, itemMaps = { byInternalName: new Map(), byName: new Map() }) {
  return normalizeItem(item, itemMaps);
}
```

Add equipment fields with null for missing or negative slot values.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
node --test scripts/data/normalize/normalize-wiki-items.test.mjs scripts/data/transform/standardize-existing-data.test.mjs
```

Expected: pass.

## Task 3: Armor Set Relation Processor

**Files:**
- Create: `scripts/data/relation/armor-set-processor.mjs`
- Test: `scripts/data/relation/armor-set-processor.test.mjs`

- [ ] **Step 1: Write failing processor tests**

Cover:

- Wood armor maps three source item IDs to head/body/leg rows.
- Multiple `sets_json` variants preserve `setVariantIndex`.
- Missing item emits an issue and keeps relation set.
- Image rows map to `maleImages`, `femaleImages`, and `specialImages` roles.

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: missing module failure.

- [ ] **Step 3: Implement processor**

Export:

```js
export function buildArmorSetRelations({
  maintArmorSets = [],
  maintItems = [],
  maintArmorSetImages = []
} = {}) { ... }
```

Return:

```js
{
  relationArmorSets,
  relationArmorSetItems,
  relationArmorSetImages,
  issues
}
```

Use `createRecordKey()` for all record keys. Derive part role from equipment slot fields.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: pass.

## Task 4: Schema And Projection Payload

**Files:**
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`

- [ ] **Step 1: Write failing schema/projection tests**

Assert:

- `RELATION_TABLE_NAMES` includes `relation_armor_sets`, `relation_armor_set_items`, `relation_armor_set_images`.
- `PROJECTION_TABLE_NAMES` includes `projection_armor_sets`.
- `buildProjectionPayload()` returns `projectionArmorSets` with `maleImages`, `femaleImages`, `specialImages`, and `relatedItemsJson`.

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected: failures for missing tables and payload.

- [ ] **Step 3: Implement schema and projection mapping**

Add DDL for the three relation tables and one projection table. Extend `buildProjectionPayload()` inputs:

```js
relationArmorSets = [],
relationArmorSetItems = [],
relationArmorSetImages = []
```

Return `projectionArmorSets`.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node --test scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs
```

Expected: pass.

## Task 5: Sync Chain Integration

**Files:**
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] **Step 1: Write failing sync dry-run test**

Use dependency-injected `queryMaint` rows for:

- `maint_armor_sets`
- `maint_items`
- missing `maint_armor_set_images`

Assert:

- `results.relationArmorSets.length === 1`
- `results.relationArmorSetItems.length === 3`
- `results.projectionArmorSets.length === 1`
- `summary.domainSummary.armorSet === 4`

- [ ] **Step 2: Run RED**

Run:

```powershell
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: failure because sync ignores armor sets.

- [ ] **Step 3: Implement sync integration**

Load armor rows, call `buildArmorSetRelations`, include armor tables in `flattenResults`, `summary`, clear table order, and upsert order.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: pass.

## Task 6: Backend Projection-First Read

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`

- [ ] **Step 1: Write failing controller tests**

Use MockMvc or direct controller instantiation with a mocked `JdbcTemplate`. Cover:

- list query reads `projection_armor_sets` when table exists.
- detail query reads `projection_armor_sets` by `id`.
- missing projection table falls back to legacy `armor_sets`.

- [ ] **Step 2: Run RED**

Run:

```powershell
cd back
mvn "-Dtest=AdminArmorSetControllerTest" test
```

Expected: failure because projection-first logic is missing.

- [ ] **Step 3: Implement projection-first helpers**

Add helpers:

```java
private boolean tableExists(String tableName) { ... }
private ResponseEntity<ApiResponse<List<Map<String, Object>>>> getProjectionArmorSets(...) { ... }
private ResponseEntity<ApiResponse<Map<String, Object>>> getProjectionArmorSetById(Long id) { ... }
```

Use projection rows only for GET paths.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
cd back
mvn "-Dtest=AdminArmorSetControllerTest" test
```

Expected: pass.

## Task 7: Final Verification

**Files:**
- All files above.

- [ ] **Step 1: Run Node focused tests**

```powershell
node --test scripts/tooling/upstream-monitor/check-upstream-updates.test.mjs scripts/data/normalize/normalize-wiki-items.test.mjs scripts/data/transform/standardize-existing-data.test.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/relation-schema.test.mjs scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
```

- [ ] **Step 2: Run syntax checks**

```powershell
node --check scripts/tooling/upstream-monitor/check-upstream-updates.mjs
node --check scripts/data/normalize/normalize-wiki-items.mjs
node --check scripts/data/transform/standardize-existing-data.mjs
node --check scripts/data/relation/armor-set-processor.mjs
node --check scripts/data/relation/relation-schema.mjs
node --check scripts/data/relation/projection-schema.mjs
node --check scripts/data/relation/projection-sync.mjs
node --check scripts/data/relation/sync-maint-to-relation.mjs
```

- [ ] **Step 3: Run backend focused test**

```powershell
cd back
mvn "-Dtest=AdminArmorSetControllerTest" test
```

- [ ] **Step 4: Review diff scope**

```powershell
git status --short
git diff --stat
```

- [ ] **Step 5: Leave uncommitted unless user requests commit**

Do not commit automatically in this task. Report changed files, verification evidence, and remaining DB apply steps.
