# Town NPC Detail Rich Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public town NPC detail pages show maintained shop prices, sale availability/conditions, dialogue portraits, and living preference facts for town NPCs.

**Architecture:** Close the chain in order: official wiki/source evidence -> generated town NPC maintenance data -> local DB fields/tables -> public backend DTO/API -> front-nuxt detail rendering -> runtime smoke check. Town NPC maintenance data is the canonical writer for town NPC shop rows; relation compatibility sync must preserve those rows instead of overwriting prices or conditions with blank relation rows. Dialogue portraits must be localized to managed image URLs before the public API exposes them.

**Tech Stack:** Spring Boot + MyBatis Plus + JdbcTemplate, Flyway/MySQL, Node data scripts, Python wiki fetch script, Nuxt 4/Vue 3 public frontend, Node and Maven tests.

---

## Confirmed Baseline

- Official wiki search evidence confirms Desktop `1.4.5.6` was released on March 9, 2026, and official NPC pages expose dialogue portrait, shop, and living preference sections.
- `data/generated/wiki-town-npc-maintenance.latest.json` was generated at `2026-05-24T00:49:33.950860Z`.
- That generated file has 39 town NPC records, 631 shop items, 631 `priceText` values, 631 `availability` values, 28 `wikiDetails.dialogPortraitImage` values, 38 sprite images, and 27 map icons.
- Current local `terria_v1_local` checked from `scripts/dev/config/local-stack.config.json` has 762 NPCs, 39 town NPCs, 938 `npc_shop_entries`, only 5 non-empty `price_text` rows, 0 `npc_shop_conditions`, and Merchant has 31 shop rows with blank prices.
- `front-nuxt/pages/npcs/[id].vue` already renders `shopPriceLabel(entry)` and condition summaries when the aggregate API supplies them.
- `PublicNpcServiceImpl` already reads `npc_shop_entries.price_text`, `npc_shop_entries.notes`, and `npc_shop_conditions`.
- `NpcWikiAssetsDTO.java` already exists with `spriteImage`, `mapIconImage`, and `dialogPortraitImage`.
- `NpcDetailDTO` and `front-nuxt/types/public-api.ts` do not currently expose dialogue portrait or living preferences.

## Cross-Review Findings

Reviewer A, data chain:

- `scripts/data/import/import-wiki-town-npcs-to-db.mjs` can write shop prices and conditions from town NPC maintenance data.
- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs` currently deletes and rebuilds `npc_shop_entries` and `npc_shop_conditions`; this can erase town NPC shop prices and conditions after import.
- Dialogue portraits are present in generated maintenance data but are raw `wiki.gg` URLs, not public-managed URLs.
- Living preferences currently exist only as raw crawler notes in another path; they need structured extraction, DB persistence, DTO mapping, and UI rendering.

Reviewer B, API/UI:

- `NpcDetailDTO` exposes only `behaviorNotes/status`; new public fields need an explicit backend contract.
- `PublicNpcServiceImpl.toDetailDto()` must map new fields from `Npc`.
- `ManagedImageUrlPolicy` rejects raw wiki image URLs, so the plan must localize portrait assets before exposure and also filter any non-managed URL in backend mapping.
- The frontend normalizer must preserve camelCase and snake_case fields.
- `shopConditionSummary()` currently returns an empty string when `conditions` is an empty array, so availability in `notes` can be hidden.

This plan was repaired after a three-agent cross-review:

- Data/pipeline review confirmed the real pipeline path is `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`, `prepareShopEntries()` already preserves price/availability/conditions, the generated JSON must be regenerated after fetch changes, and the pipeline must run fetch -> image sync -> import.
- Backend/API review confirmed `PublicNpcAggregateControllerTest` must seed parsed DTO objects instead of raw JSON setters, `PublicNpcServiceImplImageTest` must trust `/terrapedia-images/npcs/` in its mock policy, the Flyway sample must match V45 style, and unpopulated extra code fields should stay out of the initial DTO contract.
- Frontend/runtime review confirmed relation SQL alone is not closure, root-relative image URLs will be dropped by backend policy, unsafe wiki-template notes need a neutral `特殊条件` fallback, and resolved preference NPC targets should link while unresolved targets render plain text.
- Second review pass confirmed the current plan already covers pipeline image sync, non-local managed URL validation, managed prefix checks, and unresolved NPC target fallback. It additionally tightened pipeline static verification, import apply failure on raw wiki assets, empty/unknown preference labels, and list-card rich-field compatibility.
- Third review pass confirmed `targetType` and unknown preference fallbacks are covered, and added observability for unresolved shop condition labels, image-prefix helper convergence, pipeline apply-mode documentation, and type comments for aggregate-only rich fields.

## Blocking Review Guardrails

Before any implementation worker starts, verify these review regressions are not reintroduced:

- `PublicNpcAggregateControllerTest` must seed parsed DTO objects with `npc.setWikiAssets(...)` and `npc.setLivingPreferences(...)`. It must not call `setWikiAssetsJson()` or `setLivingPreferencesJson()` because the fake aggregate service returns a prebuilt `NpcDetailDTO`. Raw JSON setters are valid only in service-level parsing tests such as `PublicNpcServiceImplImageTest`.
- The only town NPC pipeline path is `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`. Do not create or reference a `workflow/` directory variant of this pipeline.
- The pipeline must run `fetch-wiki-town-npc-maintenance.py -> run-image-sync.mjs --scopes=town_npc_maintenance -> import-wiki-town-npcs-to-db.mjs`. Importing directly after fetch is a blocker because raw wiki image URLs will be rejected before `wiki_assets_json` is populated.
- Do not add an `isManagedTownNpcAssetUrl()` helper or hardcode `localhost`/`127.0.0.1` for import validation. Use `resolveManagedImageUrlPrefixes()` plus `isManagedUrlForEntity(..., 'npcs', prefixes)`.
- `prepareShopEntries()` already exists and already maps `priceText`, `availability` as `notes`, and parsed `conditions`. Task 2 is regression coverage and verification, not a rewrite.
- After Task 6 changes the fetcher, regenerate `data/generated/wiki-town-npc-maintenance.latest.json` before image sync/import. Importing the old `2026-05-24` generated JSON cannot produce `livingPreferences`.
- Existing town NPC shop-condition rows may have `notes = NULL` because readable labels are expected to come from referenced lookup tables. New import work should preserve a safe `notes` fallback when it has one, but audit/UI fallback coverage must still handle legacy or unresolved rows so failed joins do not disappear silently.
- `run-image-sync.mjs` and import validation must share the exported `resolveEntityManagedUrlPrefixes()` / `isManagedUrlForEntity()` behavior from `scripts/data/lib/minio-image-upload.mjs`; do not keep a separate local prefix resolver with different fallback semantics.
- If `run-town-npc-sync-pipeline.mjs --output=...` writes a custom maintenance JSON file, the pipeline must pass that path to image sync and import as their `--input=...` value. `run-image-sync.mjs --output=...` remains the report path and must not be overloaded as a town NPC maintenance input path.
- A dry-run pipeline is expected when `--apply=true` is omitted. Runtime closure requires `node scripts/data/pipeline/run-town-npc-sync-pipeline.mjs --apply=true` after review and user approval for local DB writes.

## Scope

In scope:

- Make `town-npc-sync` authoritative for town NPC shop entries.
- Prevent relation compatibility sync from deleting town NPC shop entries and conditions.
- Preserve `priceText` and `availability` in `npc_shop_entries.price_text`, `npc_shop_entries.notes`, and parsed `npc_shop_conditions`.
- Add DB/API fields for managed `wikiAssets` and structured `livingPreferences`.
- Extend the town NPC maintenance fetch/transform path to capture living preferences.
- Localize town NPC maintenance sprite/map/portrait URLs to managed image URLs.
- Update public NPC detail UI to prefer dialogue portrait for town NPC display and render living preference rows.
- Add focused tests and a read-only runtime smoke that proves Merchant or another verified town NPC has price/availability/portrait/preference data.

Out of scope:

- Full visual redesign of NPC pages.
- Boss/enemy NPC rich profile expansion.
- Production data writes.
- Running a DB apply or full crawler during implementation without explicit user approval.
- Exposing raw `terraria.wiki.gg` image URLs on public API or UI.

## Source Of Truth And Data Flow

1. Official wiki pages own the content facts for town NPC shop rows, dialogue portraits, and living preferences.
2. `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py` owns generated town NPC maintenance data at `data/generated/wiki-town-npc-maintenance.latest.json`.
3. `scripts/data/workflow/run-image-sync.mjs --scopes=town_npc_maintenance` owns converting town NPC maintenance image URLs to full managed MinIO URLs. The DB/API contract must store full trusted HTTP URLs such as `http://localhost:9000/terrapedia-images/npcs/...`, not root-relative `/terrapedia-images/...` values, because the backend managed-image policy rejects relative paths.
4. `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs` owns the safe local sequence: fetch/regenerate maintenance JSON -> image sync -> import. It must not import raw wiki image URLs before localization.
5. `scripts/data/import/import-wiki-town-npcs-to-db.mjs` owns local DB apply for town NPC profile rows, `npc_shop_entries`, and `npc_shop_conditions`.
6. `scripts/data/relation/sync-relation-to-local-compat-tables.mjs` may rebuild non-town NPC relation compatibility rows, but must preserve town NPC shop rows.
7. New local DB columns on `npcs` own public rich profile data:
   - `wiki_assets_json`
   - `living_preferences_json`
8. `PublicNpcServiceImpl.getNpcById()` owns mapping DB fields into `NpcDetailDTO`.
9. `PublicNpcAggregateController` owns public detail response shape.
10. `front-nuxt/composables/usePublicNpcs.ts` owns frontend normalization.
11. `front-nuxt/pages/npcs/[id].vue` owns display.

## Write Ownership

Data/relation worker:

- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- `scripts/data/lib/town-npc-shop-conditions.mjs`
- `scripts/data/lib/town-npc-shop-conditions.test.mjs`
- `scripts/data/audit/audit-town-npc-shop-runtime.mjs`
- `scripts/data/audit/audit-town-npc-shop-runtime.test.mjs`

Fetch/image worker:

- `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`
- `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
- `scripts/data/workflow/run-image-sync.mjs`
- `scripts/data/workflow/run-image-sync.test.mjs`
- `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`
- `scripts/data/pipeline/town-npc-sync-args.mjs`
- `scripts/data/pipeline/town-npc-sync-args.test.mjs`

Backend worker:

- `back/src/main/resources/db/migration/V46__add_town_npc_rich_profile_fields.sql`
- `back/src/main/java/com/terraria/skills/entity/Npc.java`
- `back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java`
- `back/src/main/java/com/terraria/skills/dto/NpcLivingPreferenceDTO.java`
- `back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java`
- `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`

Frontend worker:

- `front-nuxt/types/public-api.ts`
- `front-nuxt/composables/usePublicNpcs.ts`
- `front-nuxt/pages/npcs/[id].vue`
- `front-nuxt/scripts/check-public-pages.mjs`

No two agents should write the same file in parallel. Implementation workers run sequentially by ownership; read-only reviewers may run in parallel after each phase.

`scripts/data/import/import-wiki-town-npcs-to-db.mjs` and `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs` are intentionally touched twice: Task 2 adds shop price/availability/condition regression coverage and condition-note fallback, while Task 7 adds rich profile import and raw wiki asset rejection. Task 7 must start from the post-Task-2 branch/commit, not from the original base branch. Before Task 7 edits those files, run `git diff --stat HEAD~1..HEAD -- scripts/data/import/import-wiki-town-npcs-to-db.mjs scripts/data/import/import-wiki-town-npcs-to-db.test.mjs` or the equivalent branch comparison and confirm the Task 2 tests/notes fallback are present.

## Task 1: Lock Town NPC Shop Ownership Against Relation Compat Overwrite

**Files:**
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`

- [ ] **Step 1: Write failing SQL ownership tests**

In `sync-relation-to-local-compat-tables.test.mjs`, extend the existing shop SQL test with assertions that relation compat sync excludes town NPC shop rows:

```js
assert.match(
  sql.npc_shop_entries.deleteSql,
  /COALESCE\(n\.is_town_npc,\s*0\)\s*<>\s*1/
);
assert.match(
  sql.npc_shop_conditions.deleteSql,
  /COALESCE\(n\.is_town_npc,\s*0\)\s*<>\s*1/
);
assert.match(
  sql.npc_shop_entries.insertSql,
  /COALESCE\(n\.is_town_npc,\s*0\)\s*<>\s*1/
);
assert.match(
  sql.npc_shop_conditions.insertSql,
  /COALESCE\(n\.is_town_npc,\s*0\)\s*<>\s*1/
);
```

- [ ] **Step 2: Run the failing relation test**

Run:

```bash
node --test scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

Expected before implementation: fail on the new `is_town_npc` ownership assertions.

- [ ] **Step 3: Change relation compat SQL to preserve town NPC shop rows**

In `buildRelationCompatSyncSql()`, change the shop delete SQL:

```js
npc_shop_entries: {
  deleteSql: `DELETE se
FROM ${localShop} se
INNER JOIN ${localNpcs} n
  ON n.id = se.npc_id
WHERE COALESCE(n.is_town_npc, 0) <> 1`,
```

Change the shop condition delete SQL:

```js
npc_shop_conditions: {
  deleteSql: `DELETE sc
FROM ${localShopConditions} sc
INNER JOIN ${localShop} se
  ON se.id = sc.shop_entry_id
INNER JOIN ${localNpcs} n
  ON n.id = se.npc_id
WHERE COALESCE(n.is_town_npc, 0) <> 1`,
```

Add this predicate to both shop insert SQL statements:

```sql
  AND COALESCE(n.is_town_npc, 0) <> 1
```

- [ ] **Step 4: Re-run relation test**

Run:

```bash
node --test scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

Expected: pass. This prevents future relation compatibility sync runs from erasing town NPC shop data produced by `town-npc-sync`.

## Task 2: Verify Shop Price And Availability In Town NPC Import

**Files:**
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.mjs`

- [ ] **Step 1: Add regression coverage for price and availability**

Use a Merchant fixture with one matched shop item:

```js
{
  nameZh: '弱效治疗药水',
  nameEn: 'Lesser Healing Potion',
  priceText: '3 SC',
  availability: '一直有售。'
}
```

Assert the apply path inserts the price and availability into `npc_shop_entries`:

```js
assert.match(insertShopEntry.sql, /INSERT INTO npc_shop_entries/);
assert.deepEqual(insertShopEntry.params.slice(3, 5), ['3 SC', '一直有售。']);
```

- [ ] **Step 2: Add regression coverage for parsed conditions**

Use this fixture:

```js
{
  nameZh: '治疗药水',
  nameEn: 'Healing Potion',
  priceText: '10 SC',
  availability: '在 困难模式 中。'
}
```

Assert the script inserts a `npc_shop_conditions` row containing:

```js
assert.equal(conditionInsert.params[1], 'GAME_PERIOD');
assert.equal(conditionInsert.params[3], 'required');
assert.match(JSON.stringify(conditionInsert.params), /HARDMODE|困难模式/i);
assert.match(String(conditionInsert.params[4]), /困难模式|Hardmode|HARDMODE/i);
```

The `notes` parameter must contain a display fallback derived from the condition label or source availability. Town NPC condition rows should not rely exclusively on reference-table joins for visible labels.

- [ ] **Step 3: Run the focused import test**

Run:

```bash
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

Expected: pass if the existing `prepareShopEntries()` mapping still preserves price, availability, and parsed conditions. If it fails, repair only the broken mapping path shown by the assertion.

- [ ] **Step 4: Verify existing import mapping stays explicit**

Do not rewrite `prepareShopEntries()` unless Step 3 exposes a real regression. The existing function should remain equivalent to:

```js
entries.push({
  itemId: matchedItem.id,
  priceText: toText(rawItem?.priceText),
  notes: toText(rawItem?.availability),
  conditions: extractTownNpcShopConditions(
    toText(rawItem?.availability),
    shopConditionLookup
  ).map((condition) => ({
    ...condition,
    notes: toText(condition.notes) || toText(condition.label) || toText(rawItem?.availability)
  }))
});
```

Ensure `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs` passes `--apply=true` to import only when the pipeline is run with `--apply=true`.

- [ ] **Step 5: Re-run import test**

Run:

```bash
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

Expected: pass.

## Task 3: Add A Read-Only Shop Runtime Audit

**Files:**
- Create: `scripts/data/audit/audit-town-npc-shop-runtime.mjs`
- Create: `scripts/data/audit/audit-town-npc-shop-runtime.test.mjs`

- [ ] **Step 1: Write the audit test first**

Create a unit test that stubs a query executor and expects:

```js
assert.deepEqual(report.summary, {
  townNpcCount: 39,
  shopEntryCount: 938,
  shopEntriesWithPriceCount: 5,
  shopConditionCount: 0,
  merchantShopEntryCount: 31,
  merchantPriceMissingCount: 31
});
assert.equal(report.status, 'fail');
```

Status rules:

- `fail` when any town NPC shop row has missing `price_text`.
- `fail` when source availability exists but `npc_shop_conditions` is zero.
- `fail` when any town NPC shop condition has no readable label after joining its reference table and no safe `notes` fallback.
- `pass` when town NPC shop rows with known source prices have matching DB prices and condition count is non-zero.

- [ ] **Step 2: Implement the read-only audit**

Use only `SELECT` statements:

```sql
SELECT COUNT(*) AS total FROM npcs WHERE deleted = 0 AND is_town_npc = 1;
SELECT COUNT(*) AS total FROM npc_shop_entries WHERE deleted = 0;
SELECT COUNT(*) AS total FROM npc_shop_entries WHERE deleted = 0 AND price_text IS NOT NULL AND TRIM(price_text) <> '';
SELECT COUNT(*) AS total FROM npc_shop_conditions;
SELECT COUNT(*) AS total
FROM npc_shop_entries s
JOIN npcs n ON n.id = s.npc_id
WHERE n.internal_name = 'Merchant' AND s.deleted = 0;
SELECT COUNT(*) AS total
FROM npc_shop_entries s
JOIN npcs n ON n.id = s.npc_id
WHERE n.internal_name = 'Merchant'
  AND s.deleted = 0
  AND (s.price_text IS NULL OR TRIM(s.price_text) = '');
SELECT COUNT(*) AS total
FROM npc_shop_conditions c
JOIN npc_shop_entries s ON s.id = c.shop_entry_id
JOIN npcs n ON n.id = s.npc_id
LEFT JOIN world_contexts wc ON c.ref_type = 'WORLD_CONTEXT' AND wc.id = c.ref_id
LEFT JOIN condition_terms ct ON c.ref_type = 'CONDITION_TERM' AND ct.id = c.ref_id
LEFT JOIN game_period gp ON c.ref_type = 'GAME_PERIOD' AND gp.id = c.ref_id
LEFT JOIN npcs rn ON c.ref_type = 'NPC' AND rn.id = c.ref_id
LEFT JOIN items ri ON c.ref_type = 'ITEM' AND ri.id = c.ref_id
LEFT JOIN biomes b ON c.ref_type = 'BIOME' AND b.id = c.ref_id
WHERE n.is_town_npc = 1
  AND s.deleted = 0
  AND COALESCE(wc.name_zh, wc.name_en, ct.name_zh, ct.name_en, gp.display_name_zh, gp.display_name_en, rn.name_zh, rn.name, ri.name_zh, ri.name, b.name_zh, b.name_en, c.notes, '') = '';
```

- [ ] **Step 3: Run audit test**

Run:

```bash
node --test scripts/data/audit/audit-town-npc-shop-runtime.test.mjs
```

Expected: pass.

- [ ] **Step 4: Run the audit against local DB before data apply**

Run:

```bash
node scripts/data/audit/audit-town-npc-shop-runtime.mjs --database=terria_v1_local
```

Expected current baseline before data apply: fail with missing Merchant shop prices and zero shop conditions.

## Task 4: Add NPC Rich Profile Schema Fields

**Files:**
- Create: `back/src/main/resources/db/migration/V46__add_town_npc_rich_profile_fields.sql`
- Modify: `back/src/main/java/com/terraria/skills/entity/Npc.java`

- [ ] **Step 1: Add Flyway migration**

Use the repository's existing `information_schema.COLUMNS` conditional pattern:

```sql
SET @schema_name = DATABASE();

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'npcs' AND COLUMN_NAME = 'wiki_assets_json'
  ),
  'ALTER TABLE `npcs` ADD COLUMN `wiki_assets_json` LONGTEXT DEFAULT NULL AFTER `source_items_json`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'npcs' AND COLUMN_NAME = 'living_preferences_json'
  ),
  'ALTER TABLE `npcs` ADD COLUMN `living_preferences_json` LONGTEXT DEFAULT NULL AFTER `wiki_assets_json`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

- [ ] **Step 2: Add entity fields**

Add to `Npc.java`:

```java
@TableField("wiki_assets_json")
private String wikiAssetsJson;

@TableField("living_preferences_json")
private String livingPreferencesJson;
```

- [ ] **Step 3: Run backend compile-focused test**

Run:

```bash
cd back && mvn -Dtest=PublicNpcAggregateControllerTest test
```

Expected: compilation succeeds. A failing assertion for missing `wikiAssets` or `livingPreferences` is acceptable until Task 8 maps the DTO fields.

## Task 5: Localize Town NPC Maintenance Images

**Files:**
- Modify: `scripts/data/workflow/run-image-sync.mjs`
- Modify: `scripts/data/workflow/run-image-sync.test.mjs`
- Modify: `scripts/data/lib/minio-image-upload.mjs`
- Modify: `scripts/data/lib/minio-image-upload.test.mjs`
- Modify: `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs`
- Modify: `scripts/data/pipeline/town-npc-sync-args.mjs`
- Modify: `scripts/data/pipeline/town-npc-sync-args.test.mjs`

- [ ] **Step 1: Add dry-run test for town NPC maintenance image scope**

In `run-image-sync.test.mjs`, add a temp `data/generated/wiki-town-npc-maintenance.latest.json`:

```js
const originalPayload = {
  records: [
    {
      internalName: 'Merchant',
      wikiDetails: {
        spriteImage: 'https://terraria.wiki.gg/images/Merchant.png',
        mapIconImage: 'https://terraria.wiki.gg/images/Map_Icon_Merchant.png',
        dialogPortraitImage: 'https://terraria.wiki.gg/images/thumb/Merchant_%28portrait%29.png/70px-Merchant_%28portrait%29.png'
      }
    }
  ]
};
```

Run the script with:

```js
spawnSync(process.execPath, [scriptPath, '--apply=false', '--scopes=town_npc_maintenance'], {
  cwd: tempDir,
  encoding: 'utf8'
});
```

Assert:

```js
assert.equal(payload.modules.town_npc_maintenance.total, 3);
assert.equal(payload.modules.town_npc_maintenance.candidates, 3);
assert.equal(payload.modules.town_npc_maintenance.changed, 3);
assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), originalPayload);
```

Add prefix-boundary tests in `scripts/data/lib/minio-image-upload.test.mjs` for the shared entity-prefix helper:

```js
import { isManagedUrl, resolveEntityManagedUrlPrefixes } from '../lib/minio-image-upload.mjs';

assert.deepEqual(
  resolveEntityManagedUrlPrefixes('npcs', ['http://localhost:9000/terrapedia-images']),
  ['http://localhost:9000/terrapedia-images/npcs']
);
assert.equal(
  isManagedUrl('http://localhost:9000/terrapedia-images/npcs/merchant.png', resolveEntityManagedUrlPrefixes('npcs', ['http://localhost:9000/terrapedia-images'])),
  true
);
assert.equal(
  isManagedUrl('http://localhost:9000/terrapedia-images/items/merchant.png', resolveEntityManagedUrlPrefixes('npcs', ['http://localhost:9000/terrapedia-images'])),
  false
);
assert.equal(
  isManagedUrl('http://localhost:9000/terrapedia-images/npcs2/guide.png', resolveEntityManagedUrlPrefixes('npcs', ['http://localhost:9000/terrapedia-images/npcs/'])),
  false
);
```

Implement the boundary behavior explicitly in `scripts/data/lib/minio-image-upload.mjs`. Do not leave `isManagedUrl()` as a plain `text.startsWith(prefix)` check after trimming trailing slashes. Parse both candidate and prefix as URLs and require same origin plus exact path boundary:

```js
function isPathUnderPrefix(candidatePath, prefixPath) {
  const normalizedPrefix = prefixPath.endsWith('/') ? prefixPath : `${prefixPath}/`;
  return candidatePath === prefixPath || candidatePath.startsWith(normalizedPrefix);
}
```

If URL parsing fails, return `false`. This keeps managed image trust host-aware and prevents `/terrapedia-images/npcs2/...` from matching the `/terrapedia-images/npcs` prefix.

Also add a table-driven `run-image-sync.test.mjs` regression before deleting the local helper. Use `--managedUrlPrefix=http://localhost:9000/terrapedia-images` so the test exercises the fallback path where the helper semantics differ. Cover actual scope-to-domain behavior, not just helper output:

```js
[
  { scope: 'npcs', entityPath: 'npcs', wrongPath: 'items' },
  { scope: 'projectiles', entityPath: 'projectiles', wrongPath: 'items' },
  { scope: 'buffs', entityPath: 'items', wrongPath: 'buffs' },
  { scope: 'armor_set_images', entityPath: 'items', wrongPath: 'armor_set_images' },
].forEach(({ scope, entityPath, wrongPath }) => {
  // Build the minimal standardized fixture file for this scope.
  // Assert the URL under entityPath counts as alreadyManaged.
  // Assert the URL under wrongPath counts as changed in dry-run.
});
```

For `items`, preserve the current no-`entityDomain` behavior with an explicit dry-run assertion. Changing `items` to `entityDomain: 'items'` is outside this plan and must be handled as a separate behavior-change task.

Add a static assertion that the local helper was actually removed and the shared import is used:

```js
const script = fs.readFileSync(scriptPath, 'utf8');
assert.doesNotMatch(script, /function\s+resolveEntityManagedUrlPrefixes\b/);
assert.match(script, /resolveEntityManagedUrlPrefixes/);
```

If these existing-scope regressions fail, Task 5 is blocked: keep the local helper until `scripts/data/lib/minio-image-upload.mjs` is adjusted and covered by tests. Do not silently broaden `isManagedUrl()` matching to compensate. Managed URL prefix matching must preserve path-boundary semantics, so an `npcs` prefix must not trust `npcs2` or `npcs_backup`.

- [ ] **Step 2: Implement `town_npc_maintenance` scope**

First, update the `run-image-sync.mjs` import from `scripts/data/lib/minio-image-upload.mjs` to include the exported prefix helper:

```js
import {
  createMinioImageUploader,
  isManagedUrl,
  resolveEntityManagedUrlPrefixes,
  slugify,
  toText
} from '../lib/minio-image-upload.mjs';
```

Delete the local `resolveEntityManagedUrlPrefixes()` helper from `run-image-sync.mjs` only after the library prefix tests and `run-image-sync` existing-scope regression checks above pass. Both image sync and import validation must use the exported helper from `scripts/data/lib/minio-image-upload.mjs` so missing-domain-prefix edge cases behave consistently without changing established `items`, `npcs`, `projectiles`, `buffs`, or `armor_set_images` behavior.

Add the scope branch:

```js
} else if (scope === 'town_npc_maintenance') {
  summary.modules.town_npc_maintenance = await syncTownNpcMaintenanceImages();
}
```

Allow the scope:

```js
].filter((scope) => ['items', 'npcs', 'projectiles', 'buffs', 'armor_set_images', 'town_npc_maintenance'].includes(scope));
```

Add a specialized sync function that treats the three `wikiDetails` URLs as image records:

```js
async function syncTownNpcMaintenanceImages() {
  const filePath = path.resolve(options.input ?? path.join(process.cwd(), 'data', 'generated', 'wiki-town-npc-maintenance.latest.json'));
  const payload = readJson(filePath);
  const townNpcs = Array.isArray(payload?.records) ? payload.records : [];
  const records = townNpcs.flatMap((record) => {
    const details = record?.wikiDetails && typeof record.wikiDetails === 'object'
      ? record.wikiDetails
      : {};
    return [
      { owner: record, field: 'spriteImage', sourceUrl: toText(details.spriteImage) },
      { owner: record, field: 'mapIconImage', sourceUrl: toText(details.mapIconImage) },
      { owner: record, field: 'dialogPortraitImage', sourceUrl: toText(details.dialogPortraitImage) }
    ].filter((entry) => entry.sourceUrl);
  });

  return syncRecordImages({
    entityDomain: 'npcs',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => record.sourceUrl,
    targetUrlWriter: (record, url) => {
      record.owner.wikiDetails = record.owner.wikiDetails ?? {};
      record.owner.wikiDetails[record.field] = url;
    },
    fileNameHint: (record, url) => `${slugify(`${record.owner?.internalName || 'town-npc'}-${record.field}`)}${guessExtension(url)}`,
    nameHint: (record) => `${record.owner?.internalName || 'town-npc'} ${record.field}`
  });
}
```

`guessExtension()` is already a local helper in `run-image-sync.mjs`; keep using that local helper unless this task deliberately moves extension guessing into `scripts/data/lib/minio-image-upload.mjs` with tests. Do not add a new import for `guessExtension`.

Add an apply-mode uploader test or fetch spy proving the `entityDomain: 'npcs'` value reaches the image upload API. Stub `/auth/login` with a token response, stub the upstream image response, stub the `/files/images` response, run one `town_npc_maintenance` upload, and assert the posted multipart `FormData` includes:

```js
entityDomain = 'npcs'
```

This closes the assumption that MinIO stores town NPC assets under the NPC object prefix instead of the default item prefix.

- [ ] **Step 3: Run image sync test**

Run:

```bash
node --test scripts/data/lib/minio-image-upload.test.mjs scripts/data/workflow/run-image-sync.test.mjs
```

Expected: pass.

- [ ] **Step 4: Dry-run the scope on real generated data**

Run:

```bash
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=town_npc_maintenance --output=/tmp/town-npc-maintenance-image-sync.json
```

Expected: JSON report shows non-zero `modules.town_npc_maintenance.candidates`. Do not run with `--apply=true` until the user approves data writes.

- [ ] **Step 5: Add pipeline image-sync args**

In `scripts/data/pipeline/town-npc-sync-args.mjs`, export a builder for the image-sync phase:

```js
export function buildTownNpcImageSyncArgs(options = {}) {
  const args = [`--apply=${isTrue(options.apply) ? 'true' : 'false'}`, '--scopes=town_npc_maintenance'];
  pushOption(args, 'input', options.output ?? options.input);
  pushOption(args, 'apiBase', options.apiBase);
  return args;
}
```

In `scripts/data/pipeline/town-npc-sync-args.test.mjs`, add:

```js
test('buildTownNpcImageSyncArgs defaults to dry-run town NPC maintenance scope', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({}),
    ['--apply=false', '--scopes=town_npc_maintenance']
  );
});

test('buildTownNpcImageSyncArgs uses the same generated maintenance file as fetch/import', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({ output: 'data/generated/town-npc-custom.json' }),
    ['--apply=false', '--scopes=town_npc_maintenance', '--input=data/generated/town-npc-custom.json']
  );
});

test('buildTownNpcImageSyncArgs supports apply mode and custom api base', () => {
  assert.deepEqual(
    buildTownNpcImageSyncArgs({ apply: 'true', input: 'data/generated/town-npc-custom.json', apiBase: 'http://127.0.0.1:18088/api' }),
    ['--apply=true', '--scopes=town_npc_maintenance', '--input=data/generated/town-npc-custom.json', '--apiBase=http://127.0.0.1:18088/api']
  );
});
```

- [ ] **Step 6: Wire the town NPC pipeline order**

Update `scripts/data/pipeline/run-town-npc-sync-pipeline.mjs` so the pipeline sequence is:

```text
fetch-wiki-town-npc-maintenance.py -> run-image-sync.mjs --scopes=town_npc_maintenance -> import-wiki-town-npcs-to-db.mjs
```

Thread `--apply=false` or `--apply=true` consistently through the image sync and import phases. Also pass the same generated maintenance file path to image sync and import as `--input=...` when the pipeline fetch step writes a custom `--output=...` maintenance file. Do not reinterpret image sync's own `--output=...`, which is reserved for its JSON report. The pipeline must never run import before image sync, because that can write null `wiki_assets_json` after raw wiki URLs are rejected.

The runner should call:

```js
runScript('python', fetchScriptPath, fetchArgs, 'town npc fetch');
runScript(process.execPath, imageSyncScriptPath, buildTownNpcImageSyncArgs(options), 'town npc image sync');
runScript(process.execPath, importScriptPath, importArgs, 'town npc import');
```

- [ ] **Step 7: Add pipeline static verification**

In `scripts/data/pipeline/town-npc-sync-args.test.mjs`, add a static check that the runner calls image sync between fetch and import:

```js
import fs from 'node:fs';

test('town NPC pipeline runs image sync between fetch and import', () => {
  const script = fs.readFileSync(new URL('./run-town-npc-sync-pipeline.mjs', import.meta.url), 'utf8');
  const fetchIndex = script.indexOf("'town npc fetch'");
  const imageIndex = script.indexOf("'town npc image sync'");
  const importIndex = script.indexOf("'town npc import'");

  assert.ok(fetchIndex >= 0, 'fetch step is present');
  assert.ok(imageIndex > fetchIndex, 'image sync runs after fetch');
  assert.ok(importIndex > imageIndex, 'import runs after image sync');
  assert.match(script, /run-image-sync\.mjs/);
  assert.match(script, /buildTownNpcImageSyncArgs/);
});
```

- [ ] **Step 8: Run pipeline arg tests**

Run:

```bash
node --test scripts/data/pipeline/town-npc-sync-args.test.mjs
```

Expected: pass.

## Task 6: Extend Town NPC Fetch Output With Living Preferences

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.py`
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`

- [ ] **Step 1: Keep crawler progress contract covered**

The existing progress test must continue to assert these concrete fields:

```json
{
  "actionId": "domain-source-town-npc-maintenance",
  "status": "running",
  "generatedAt": "2026-05-26T00:00:00.000Z",
  "lastHeartbeatAt": "2026-05-26T00:00:01.000Z",
  "phase": "fetch",
  "message": "Fetching town NPC maintenance pages",
  "current": 0,
  "total": 39,
  "outputPath": "data/generated/wiki-town-npc-maintenance.latest.json"
}
```

If the progress payload changes, update only `scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs` and keep `actionId`, `status`, `phase`, `current`, `total`, and `outputPath` assertions.

- [ ] **Step 2: Add parser fixture for living preferences**

Add a small fixture matching the official wiki preference table:

```html
<h2><span id="Living_preferences">Living preferences</span></h2>
<table class="terraria living-preferences">
  <tr class="like"><th>Likes</th><td><a title="Forest">Forest</a></td><td><a title="Princess">Princess</a></td></tr>
  <tr class="hate"><th>Hates</th><td><span class="na">n/a</span></td><td><a title="Angler">Angler</a></td></tr>
</table>
```

Expected extracted rows:

```json
[
  {"targetType":"biome","preference":"like","targetName":"Forest"},
  {"targetType":"npc","preference":"like","targetName":"Princess"},
  {"targetType":"npc","preference":"hate","targetName":"Angler"}
]
```

- [ ] **Step 3: Implement extraction in the fetch script**

Add a pure helper that returns an array of objects with:

```python
{
    "targetType": target_type,
    "preference": preference,
    "targetName": target_name,
    "targetNameZh": target_name_zh,
    "sourceText": source_text,
}
```

Normalize `preference` to `love`, `like`, `dislike`, or `hate`. Set `targetType` to `biome` for biome column values and `npc` for relationship column values. Drop `n/a` rows.

- [ ] **Step 4: Emit `livingPreferences` in generated records**

Each generated town NPC record should include:

```json
"livingPreferences": [
  {
    "targetType": "biome",
    "preference": "like",
    "targetName": "Forest",
    "targetNameZh": "森林",
    "sourceText": "Likes Forest"
  }
]
```

Keep `wikiDetails.dialogPortraitImage` in the existing `wikiDetails` object.

- [ ] **Step 5: Run fetch progress/parser tests**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
```

Expected: pass.

- [ ] **Step 6: Regenerate latest maintenance JSON before import work**

After the fetch parser change is merged, regenerate `data/generated/wiki-town-npc-maintenance.latest.json` before Task 7 import validation:

```bash
python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py
```

Expected: generated records include `livingPreferences` for NPC pages where the wiki exposes living preference rows. Do not continue to image sync/import using the old `2026-05-24` generated JSON.

Immediately assert the regenerated file is fresh enough for the new pipeline:

```bash
node -e 'const fs=require("fs"); const p="data/generated/wiki-town-npc-maintenance.latest.json"; const j=JSON.parse(fs.readFileSync(p,"utf8")); const rows=Array.isArray(j.records)?j.records:[]; const pref=rows.reduce((n,r)=>n+(Array.isArray(r.livingPreferences)?r.livingPreferences.length:0),0); const rawAssets=rows.flatMap(r=>Object.values(r.wikiDetails||{})).filter(v=>String(v||"").includes("terraria.wiki.gg")).length; console.log(JSON.stringify({records:rows.length,livingPreferenceRows:pref,rawAssetUrls:rawAssets},null,2)); if(rows.length < 1 || pref < 1) process.exit(1);'
```

Expected after fetch and before image sync: `livingPreferenceRows` is non-zero; `rawAssetUrls` may still be non-zero until Task 5 image sync apply runs.

## Task 7: Import Wiki Assets And Living Preferences Into NPC Rows

**Files:**
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`

- [ ] **Step 1: Add import test for profile fields**

Use a town NPC record with managed URLs:

```js
{
  internalName: 'Merchant',
  wikiDetails: {
    spriteImage: 'http://localhost:9000/terrapedia-images/npcs/merchant.png',
    mapIconImage: 'http://localhost:9000/terrapedia-images/npcs/merchant-map.png',
    dialogPortraitImage: 'http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png'
  },
  livingPreferences: [
    { targetType: 'biome', preference: 'like', targetName: 'Forest', targetNameZh: '森林' },
    { targetType: 'npc', preference: 'hate', targetName: 'Angler', targetNameZh: '渔夫' }
  ]
}
```

Assert the NPC update writes:

```js
assert.match(updateNpc.sql, /wiki_assets_json/);
assert.match(updateNpc.sql, /living_preferences_json/);
assert.match(updateNpc.params.find((value) => String(value).includes('dialogPortraitImage')), /terrapedia-images\/npcs\/merchant-dialog-portrait\.png/);
assert.match(updateNpc.params.find((value) => String(value).includes('livingPreferences') || String(value).includes('targetType')), /Angler|渔夫/);
```

Add a second matched-NPC fixture with managed `wikiDetails`, `livingPreferences`, and no matched `shopItems`. Assert it still updates `wiki_assets_json` and `living_preferences_json`. Rich profile updates must happen before the existing no-shop early return, so they are not skipped when `preparedShopEntries.length === 0`.

- [ ] **Step 2: Implement import mapping**

When matching the town NPC, write:

```js
const wikiAssetsJson = JSON.stringify({
  spriteImage: managedTownNpcAssetOrNull(rawRecord?.wikiDetails?.spriteImage, result),
  mapIconImage: managedTownNpcAssetOrNull(rawRecord?.wikiDetails?.mapIconImage, result),
  dialogPortraitImage: managedTownNpcAssetOrNull(rawRecord?.wikiDetails?.dialogPortraitImage, result)
});
const livingPreferencesJson = JSON.stringify(normalizedLivingPreferences);
```

Explicit `null` values inside `wiki_assets_json` are acceptable but not required. Prefer omitting keys whose managed URL is missing if that matches the existing JSON helper style; either way, the backend parser must treat missing keys and `null` values the same and must return `null` when all three image fields are absent.

Apply this NPC profile update before any `shouldReplaceShop` / `shopReplaceSkipped` return. Do not add new lookup-object mutations for `wikiAssets` or `livingPreferences`; compare local values and update the database row directly.

Normalize preferences with these rules:

- Drop empty targets.
- Map preference to `love`, `like`, `dislike`, or `hate`.
- Keep English and Chinese target names when present.
- Resolve NPC targets to local NPC ids when a match is available.
- Keep `targetId: null` for unresolved NPC targets.
- Do not add extra code fields in the initial JSON/API contract unless a later task adds a real source and resolver for them.

- [ ] **Step 3: Reject raw wiki image URLs in import summary**

Initialize the summary counter:

```js
rawWikiAssetUrlCount: 0,
```

Initialize each `importTownNpcRecord()` result with:

```js
rawWikiAssetUrlCount: 0,
```

After each record import, add:

```js
summary.rawWikiAssetUrlCount += result.rawWikiAssetUrlCount;
```

After all records are processed and before `conn.commit()`, fail apply mode if raw wiki assets remain:

```js
if (apply && summary.rawWikiAssetUrlCount > 0) {
  throw new Error(`Refusing to apply town NPC import with ${summary.rawWikiAssetUrlCount} raw wiki asset URLs. Run town_npc_maintenance image sync before import.`);
}
```

Use the existing managed-image URL policy instead of hardcoding localhost hostnames. Import the same config-backed prefix resolver used elsewhere:

```js
import { isManagedUrlForEntity } from '../lib/minio-image-upload.mjs';
import { resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';

const managedImageUrlPrefixes = resolveManagedImageUrlPrefixes();

function managedTownNpcAssetOrNull(value, result) {
  const text = toText(value);
  if (!text) return null;
  if (isManagedUrlForEntity(text, 'npcs', managedImageUrlPrefixes)) return text;
  if (text.startsWith('https://terraria.wiki.gg/')) {
    result.rawWikiAssetUrlCount += 1;
  }
  return null;
}
```

Build `wikiAssetsJson` with `managedTownNpcAssetOrNull()` so apply mode never writes raw wiki image URLs or root-relative image paths.

- [ ] **Step 4: Add import failure test for unlocalized assets**

Add a test fixture whose `wikiDetails.dialogPortraitImage` is a raw `https://terraria.wiki.gg/...` URL. Assert:

```js
assert.equal(summary.rawWikiAssetUrlCount, 1);
```

For apply-mode test coverage, invoke the import path with `apply: true` and assert it rejects before commit:

```js
await assert.rejects(
  () => runImportWikiTownNpcsToDb(['--apply=true', '--input=...']),
  /raw wiki asset URLs/
);
```

Keep the existing managed-URL fixture as the passing path, so a localized `http://localhost:9000/terrapedia-images/npcs/...` URL writes `wiki_assets_json`.

- [ ] **Step 5: Run import tests**

Run:

```bash
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

Expected: pass.

## Task 8: Publish Wiki Assets And Preferences In Backend API

**Files:**
- Create: `back/src/main/java/com/terraria/skills/dto/NpcLivingPreferenceDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`

- [ ] **Step 1: Add API contract test**

In `PublicNpcAggregateControllerTest`, the fake service returns a prebuilt `NpcDetailDTO`, so seed parsed DTO objects directly:

```java
NpcWikiAssetsDTO wikiAssets = new NpcWikiAssetsDTO();
wikiAssets.setSpriteImage("http://localhost:9000/terrapedia-images/npcs/merchant.png");
wikiAssets.setMapIconImage("http://localhost:9000/terrapedia-images/npcs/merchant-map.png");
wikiAssets.setDialogPortraitImage("http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png");
npc.setWikiAssets(wikiAssets);

NpcLivingPreferenceDTO forestPreference = new NpcLivingPreferenceDTO();
forestPreference.setTargetType("biome");
forestPreference.setPreference("like");
forestPreference.setTargetName("Forest");
forestPreference.setTargetNameZh("森林");

NpcLivingPreferenceDTO anglerPreference = new NpcLivingPreferenceDTO();
anglerPreference.setTargetType("npc");
anglerPreference.setPreference("hate");
anglerPreference.setTargetId(369L);
anglerPreference.setTargetName("Angler");
anglerPreference.setTargetNameZh("渔夫");

npc.setLivingPreferences(List.of(forestPreference, anglerPreference));
```

Assert:

```java
.andExpect(jsonPath("$.data.npc.wikiAssets.dialogPortraitImage").value("http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png"))
.andExpect(jsonPath("$.data.npc.livingPreferences[0].targetType").value("biome"))
.andExpect(jsonPath("$.data.npc.livingPreferences[0].preference").value("like"))
.andExpect(jsonPath("$.data.npc.livingPreferences[1].targetNameZh").value("渔夫"));
```

- [ ] **Step 2: Add DTO fields**

Create `NpcLivingPreferenceDTO.java`:

```java
package com.terraria.skills.dto;

import lombok.Data;

@Data
public class NpcLivingPreferenceDTO {
    private String targetType;
    private String preference;
    private Long targetId;
    private String targetName;
    private String targetNameZh;
    private String sourceText;
}
```

Update `NpcDetailDTO.java`:

```java
private NpcWikiAssetsDTO wikiAssets;
private List<NpcLivingPreferenceDTO> livingPreferences = new ArrayList<>();
```

Add imports:

```java
import java.util.ArrayList;
import java.util.List;
```

- [ ] **Step 3: Parse JSON fields in `PublicNpcServiceImpl`**

Add imports:

```java
import com.terraria.skills.dto.NpcLivingPreferenceDTO;
import com.terraria.skills.dto.NpcWikiAssetsDTO;
```

Add helpers:

```java
private NpcWikiAssetsDTO parseWikiAssets(String json) {
    String text = trimToNull(json);
    if (text == null) {
        return null;
    }
    try {
        JsonNode root = objectMapper.readTree(text);
        NpcWikiAssetsDTO dto = new NpcWikiAssetsDTO();
        dto.setSpriteImage(managedDisplayImageUrl(textOrNull(root.path("spriteImage"))));
        dto.setMapIconImage(managedDisplayImageUrl(textOrNull(root.path("mapIconImage"))));
        dto.setDialogPortraitImage(managedDisplayImageUrl(textOrNull(root.path("dialogPortraitImage"))));
        if (dto.getSpriteImage() == null && dto.getMapIconImage() == null && dto.getDialogPortraitImage() == null) {
            return null;
        }
        return dto;
    } catch (Exception ex) {
        log.warn("Failed to parse NPC wiki assets JSON", ex);
        return null;
    }
}

private List<NpcLivingPreferenceDTO> parseLivingPreferences(String json) {
    String text = trimToNull(json);
    if (text == null) {
        return List.of();
    }
    try {
        JsonNode root = objectMapper.readTree(text);
        if (!root.isArray()) {
            return List.of();
        }
        List<NpcLivingPreferenceDTO> result = new ArrayList<>();
        for (JsonNode node : root) {
            NpcLivingPreferenceDTO dto = new NpcLivingPreferenceDTO();
            dto.setTargetType(textOrNull(node.path("targetType")));
            dto.setPreference(textOrNull(node.path("preference")));
            dto.setTargetId(node.path("targetId").isNumber() ? node.path("targetId").asLong() : null);
            dto.setTargetName(textOrNull(node.path("targetName")));
            dto.setTargetNameZh(textOrNull(node.path("targetNameZh")));
            dto.setSourceText(textOrNull(node.path("sourceText")));
            if (dto.getPreference() != null && (dto.getTargetName() != null || dto.getTargetNameZh() != null)) {
                result.add(dto);
            }
        }
        return result;
    } catch (Exception ex) {
        log.warn("Failed to parse NPC living preferences JSON", ex);
        return List.of();
    }
}
```

- [ ] **Step 4: Map fields in `toDetailDto()`**

Set:

```java
dto.setWikiAssets(parseWikiAssets(npc.getWikiAssetsJson()));
dto.setLivingPreferences(parseLivingPreferences(npc.getLivingPreferencesJson()));
```

- [ ] **Step 5: Add image policy test**

In `PublicNpcServiceImplImageTest`, first extend the test's anonymous `ManagedImageUrlPolicy` so it trusts NPC managed URLs:

```java
@Override
public boolean isManagedImageUrl(String url) {
    return url != null && (
            url.startsWith("http://localhost:9000/terrapedia-images/items/")
                    || url.startsWith("http://localhost:9000/terrapedia-images/buffs/")
                    || url.startsWith("http://localhost:9000/terrapedia-images/npcs/")
                    || url.startsWith("https://cdn.example.com/terrapedia-images/buffs/")
    );
}

@Override
public List<String> trustedManagedImageUrlPrefixes() {
    return List.of(
            "http://localhost:9000/terrapedia-images/items/",
            "http://localhost:9000/terrapedia-images/buffs/",
            "http://localhost:9000/terrapedia-images/npcs/",
            "https://cdn.example.com/terrapedia-images/buffs/"
    );
}
```

Then assert raw wiki URLs are not exposed:

```java
Npc npc = npc(17L, 17L, "Merchant", "Merchant");
npc.setWikiAssetsJson("""
    {"dialogPortraitImage":"https://terraria.wiki.gg/images/thumb/Merchant_%28portrait%29.png/70px-Merchant_%28portrait%29.png"}
    """);
when(npcMapper.selectById(17L)).thenReturn(npc);

NpcDetailDTO detail = newService().getNpcById(npc.getId());
assertNull(detail.getWikiAssets());
```

- [ ] **Step 6: Add positive service parsing test**

In `PublicNpcServiceImplImageTest`, add a managed positive path that seeds the underlying `Npc` row with raw JSON fields and calls the real service mapper. The test must stub `npcMapper.selectById(...)`; otherwise `getNpcById(...)` returns `null` before JSON parsing:

```java
@Test
void shouldParseManagedNpcWikiAssetsAndLivingPreferencesFromDetailEntityJson() {
    Npc npc = npc(17L, 17L, "Merchant", "Merchant");
    npc.setWikiAssetsJson("""
        {"spriteImage":"http://localhost:9000/terrapedia-images/npcs/merchant.png","mapIconImage":"http://localhost:9000/terrapedia-images/npcs/merchant-map.png","dialogPortraitImage":"http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png"}
        """);
    npc.setLivingPreferencesJson("""
        [{"targetType":"biome","preference":"like","targetName":"Forest","targetNameZh":"森林"},{"targetType":"npc","preference":"hate","targetId":369,"targetName":"Angler","targetNameZh":"渔夫"},{"preference":"like","targetName":"Unknown neighbor","targetNameZh":"未知邻居"}]
        """);
    when(npcMapper.selectById(17L)).thenReturn(npc);

    NpcDetailDTO detail = newService().getNpcById(npc.getId());

    assertEquals("http://localhost:9000/terrapedia-images/npcs/merchant-dialog-portrait.png", detail.getWikiAssets().getDialogPortraitImage());
    assertEquals(3, detail.getLivingPreferences().size());
    assertEquals("biome", detail.getLivingPreferences().get(0).getTargetType());
    assertEquals("渔夫", detail.getLivingPreferences().get(1).getTargetNameZh());
    assertNull(detail.getLivingPreferences().get(2).getTargetType());
    assertEquals("未知邻居", detail.getLivingPreferences().get(2).getTargetNameZh());
}
```

This fixture intentionally includes a visible preference target with missing `targetType`. The backend must preserve that row so the frontend can render it as `偏好对象` with a no-link `未关联资料` indicator.

If the current `countNpcRelations()` implementation or Mockito strictness requires explicit relation-count stubs in this test class, add lenient stubs so they do not distract from the JSON parsing assertion:

```java
lenient().when(jdbcTemplate.queryForObject(contains("npc_shop_entries"), eq(Integer.class), eq(17L))).thenReturn(0);
lenient().when(jdbcTemplate.queryForObject(contains("npc_loot_entries"), eq(Integer.class), eq(17L))).thenReturn(0);
lenient().when(jdbcTemplate.queryForObject(contains("npc_buff_relations"), eq(Integer.class), eq(17L))).thenReturn(0);
```

Do not use these stubs as the proof of rich-field parsing; the assertions must still check `detail.getWikiAssets()` and `detail.getLivingPreferences()`.

This service-level test proves `PublicNpcServiceImpl.toDetailDto()` parses DB JSON. The aggregate controller test remains response-shape coverage only because its fake service bypasses parsing.

- [ ] **Step 7: Run backend focused tests**

Run:

```bash
cd back && mvn -Dtest=PublicNpcAggregateControllerTest,PublicNpcServiceImplImageTest test
```

Expected: pass.

## Task 9: Update Frontend Types, Normalizer, And NPC Detail Rendering

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicNpcs.ts`
- Modify: `front-nuxt/pages/npcs/[id].vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add TypeScript types**

Add:

```ts
export type PublicNpcWikiAssets = {
  spriteImage?: string | null
  sprite_image?: string | null
  mapIconImage?: string | null
  map_icon_image?: string | null
  dialogPortraitImage?: string | null
  dialog_portrait_image?: string | null
}

export type PublicNpcLivingPreference = {
  targetType?: string | null
  target_type?: string | null
  preference?: string | null
  targetId?: number | string | null
  target_id?: number | string | null
  targetName?: string | null
  target_name?: string | null
  targetNameZh?: string | null
  target_name_zh?: string | null
  sourceText?: string | null
  source_text?: string | null
}
```

Extend `PublicNpcListItem`:

```ts
/**
 * Rich profile fields are expected on aggregate/detail NPC payloads.
 * List endpoints may omit them; callers must treat them as optional.
 */
wikiAssets?: PublicNpcWikiAssets | null
wiki_assets?: PublicNpcWikiAssets | null
livingPreferences?: PublicNpcLivingPreference[] | null
living_preferences?: PublicNpcLivingPreference[] | null
```

Do not extend `NpcCatalogCard` with these rich fields in the initial implementation. `NpcCatalogCard` is the list-page card contract used by `pages/npcs/index.vue`; keeping detail-only fields out of the top level avoids implying that list cards have profile data the list endpoint does not send.

- [ ] **Step 2: Normalize rich profile fields**

Import the new types in `usePublicNpcs.ts`, then add:

```ts
const normalizeNpcWikiAssets = (raw?: PublicNpcWikiAssets | null): PublicNpcWikiAssets | null => {
  if (!raw) return null
  const spriteImage = normalizeText(raw.spriteImage ?? raw.sprite_image) || null
  const mapIconImage = normalizeText(raw.mapIconImage ?? raw.map_icon_image) || null
  const dialogPortraitImage = normalizeText(raw.dialogPortraitImage ?? raw.dialog_portrait_image) || null
  if (!spriteImage && !mapIconImage && !dialogPortraitImage) return null
  return { spriteImage, mapIconImage, dialogPortraitImage }
}

const normalizeNpcLivingPreference = (raw: PublicNpcLivingPreference): PublicNpcLivingPreference => ({
  ...raw,
  targetType: normalizeText(raw.targetType ?? raw.target_type) || null,
  preference: normalizeText(raw.preference) || null,
  targetId: toNumberOrNull(raw.targetId ?? raw.target_id),
  targetName: normalizeText(raw.targetName ?? raw.target_name) || null,
  targetNameZh: normalizeText(raw.targetNameZh ?? raw.target_name_zh) || null,
  sourceText: normalizeText(raw.sourceText ?? raw.source_text) || null,
})
```

In `normalizePublicNpcBase().raw`, set:

```ts
wikiAssets: raw.wikiAssets || raw.wiki_assets
  ? normalizeNpcWikiAssets(raw.wikiAssets ?? raw.wiki_assets)
  : undefined,
livingPreferences: raw.livingPreferences || raw.living_preferences
  ? (raw.livingPreferences ?? raw.living_preferences ?? []).map(normalizeNpcLivingPreference)
  : undefined,
```

Keep rich fields inside `raw` so `normalizePublicNpcAggregate().npc = npcCard.raw` works for the detail page without implying that catalog cards have populated rich data. Only normalize `livingPreferences` to an array when the backend actually sent the field; omitted list payload fields should remain omitted or `undefined`.

- [ ] **Step 3: Fix availability fallback for empty condition arrays**

In `pages/npcs/[id].vue`, change `shopConditionSummary()`:

```ts
const shopConditionSummary = (entry: PublicNpcShopEntry) => {
  if (!Array.isArray(entry.conditions)) return shopConditionsLabel(entry)
  const labels = entry.conditions.map(conditionLabel).filter(Boolean)
  if (labels.length === 0) {
    const safeNotes = safeNpcDisplayText(entry.notes)
    return safeNotes || (entry.conditions.length > 0 || firstText(entry.notes) ? '特殊条件' : '')
  }
  if (labels.length <= 2) return labels.join(' / ')
  return `${labels.slice(0, 2).join(' / ')} / 另有 ${labels.length - 2} 个条件`
}
```

Also change `shopGroupKey()`:

```ts
if (entry.conditions.length === 0) return firstText(entry.notes) ? 'other' : 'always'
const labels = entry.conditions.map(conditionLabel).filter(Boolean)
if (labels.length === 0) return 'other'
```

Add static contract or page-check fixtures covering both cases:

```js
{ conditions: [], notes: '{{Availability|...}}' }
{ conditions: [{ refType: 'GAME_PERIOD', refId: 99999, label: null, notes: null }], notes: null }
```

The UI must render `特殊条件` and must not render raw wiki template text when no safe label can be resolved.

Replace every shop condition display in the template with `shopConditionSummary(entry)`. The expanded/remainder shop rows must not keep calling `shopConditionsLabel(entry)`, because that bypasses the fallback for unresolved structured conditions.

- [ ] **Step 4: Add portrait and living preference helpers**

In `pages/npcs/[id].vue`, add `PublicNpcLivingPreference` to the type import and compute:

```ts
const npcWikiAssets = computed(() => npc.value?.wikiAssets ?? npc.value?.wiki_assets ?? null)
const dialoguePortraitImage = computed(() => resolvePreviewImageUrl(firstText(
  npcWikiAssets.value?.dialogPortraitImage,
  npcWikiAssets.value?.dialog_portrait_image,
)))
const portraitImage = computed(() => dialoguePortraitImage.value || resolvePreviewImageUrl(firstText(npc.value?.imageUrl)))
const validPreferenceValues = new Set(['love', 'like', 'dislike', 'hate'])
const normalizedPreferenceValue = (value: unknown) => {
  const text = firstText(value).toLowerCase()
  return validPreferenceValues.has(text) ? text : ''
}
const livingPreferenceRows = computed<PublicNpcLivingPreference[]>(() => {
  const rows = npc.value?.livingPreferences ?? npc.value?.living_preferences ?? []
  return Array.isArray(rows)
    ? rows.filter((row) => safeNpcDisplayText(row.targetNameZh, row.targetName) && normalizedPreferenceValue(row.preference))
    : []
})
const preferenceLabel = (value: unknown) => ({
  love: '最喜欢',
  like: '喜欢',
  dislike: '不喜欢',
  hate: '讨厌',
}[normalizedPreferenceValue(value)] ?? '')
const preferenceTargetTypeLabel = (value: unknown) => {
  const type = firstText(value).toLowerCase()
  if (type === 'biome') return '生物群系'
  if (type === 'npc') return '邻近 NPC'
  return '偏好对象'
}
const preferenceTargetPath = (row: PublicNpcLivingPreference) => {
  const id = toNumberOrNull(row.targetId ?? row.target_id)
  return firstText(row.targetType ?? row.target_type).toLowerCase() === 'npc' && id ? `/npcs/${id}` : ''
}
const preferenceMissingLinkLabel = (row: PublicNpcLivingPreference) => {
  const type = firstText(row.targetType ?? row.target_type).toLowerCase()
  return type === 'biome' ? '' : '未关联资料'
}
```

- [ ] **Step 5: Render living preferences module**

Add an NPC detail module with title `生活偏好` that renders only when `livingPreferenceRows.length > 0`. Each row shows:

```vue
<b>{{ preferenceLabel(row.preference) }}</b>
<NuxtLink v-if="preferenceTargetPath(row)" :to="preferenceTargetPath(row)">
  {{ preferenceTargetTypeLabel(row.targetType) }} · {{ safeNpcDisplayText(row.targetNameZh, row.targetName) }}
</NuxtLink>
<span v-else>
  {{ preferenceTargetTypeLabel(row.targetType) }} · {{ safeNpcDisplayText(row.targetNameZh, row.targetName) }}
  <small v-if="preferenceMissingLinkLabel(row)">{{ preferenceMissingLinkLabel(row) }}</small>
</span>
```

Do not render rows with empty or unknown preference values. Do not render `sourceText`, raw wiki URLs, or template fragments. Unknown or empty `targetType` rows with a visible target name may render as `偏好对象`, but they should still show `未关联资料` when no link can be built so users do not mistake them for linked records.

- [ ] **Step 6: Update static contract markers**

In `front-nuxt/scripts/check-public-pages.mjs`, require markers:

```js
'dialoguePortraitImage',
'生活偏好',
'preferenceLabel',
'normalizedPreferenceValue',
'livingPreferenceRows',
'preferenceTargetPath',
'preferenceMissingLinkLabel',
'偏好对象',
'未关联资料',
'shopConditionSummary(entry)',
'特殊条件',
```

Reject raw rendering markers in the NPC detail template block:

```js
'sourceText',
'{{living preferences',
'terraria.wiki.gg',
```

Also reject stale shop-condition rendering in the template block:

```js
'shopConditionsLabel(entry)',
```

The helper definition may remain in `<script setup>` for non-array fallback logic, but the template must not call it directly.

- [ ] **Step 7: Run frontend checks**

Run:

```bash
cd front-nuxt && node scripts/check-public-pages.mjs
cd front-nuxt && pnpm run check
```

Expected: pass.

## Task 10: Runtime Smoke Validation And Commit

**Files:**
- Optional generated report: `reports/domain/npcs/town-npc-rich-detail-smoke-2026-05-26.json`

- [ ] **Step 1: Run narrow validation suite**

Run:

```bash
node --test scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
node --test scripts/data/lib/town-npc-shop-conditions.test.mjs
node --test scripts/data/audit/audit-town-npc-shop-runtime.test.mjs
node --test scripts/data/lib/minio-image-upload.test.mjs scripts/data/workflow/run-image-sync.test.mjs
node --test scripts/data/pipeline/town-npc-sync-args.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
cd back && mvn -Dtest=PublicNpcAggregateControllerTest,PublicNpcServiceImplImageTest test
cd front-nuxt && node scripts/check-public-pages.mjs
cd front-nuxt && pnpm run check
```

- [ ] **Step 2: Run dry-run data checks**

Run:

```bash
python3 scripts/data/fetch/fetch-wiki-town-npc-maintenance.py
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=town_npc_maintenance --output=/tmp/town-npc-maintenance-image-sync.json
node scripts/data/import/import-wiki-town-npcs-to-db.mjs --apply=false --output=/tmp/wiki-town-npc-import.latest.json --snapshot-output=/tmp/wiki-town-npc-import-snapshot.json
node scripts/data/audit/audit-town-npc-shop-runtime.mjs --database=terria_v1_local
```

Expected before approved DB apply: fetch regenerates JSON with `livingPreferences`; image/import dry-runs complete; runtime audit may still fail on current local DB because no data write has been performed. That failure is not closure and not a regression until the approved image sync apply plus import apply has run.

Also run the JSON freshness check from Task 6. `livingPreferenceRows` must be non-zero before continuing.

- [ ] **Step 3: Verify local image configuration before apply**

Check the backend managed-prefix config and frontend image origin before any apply/runtime smoke:

```bash
rg -n "managed-image-object-prefixes|TERRAPEDIA_MANAGED_IMAGE_OBJECT_PREFIXES" back/src/main/resources/application.yml scripts/dev/config/local-stack.config.json
node -e 'const v=process.env.TERRAPEDIA_IMAGE_ORIGIN||process.env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT||"http://localhost:9000"; if (/terrapedia-images\\/?$/.test(v)) { console.error("TERRAPEDIA_IMAGE_ORIGIN must be MinIO origin only, not .../terrapedia-images"); process.exit(1) } console.log(v)'
```

Expected: the effective backend managed image object prefixes include `npcs`; `TERRAPEDIA_IMAGE_ORIGIN` resolves to a MinIO origin such as `http://localhost:9000`, not `http://localhost:9000/terrapedia-images`.

If a deployment uses CDN-style managed image URLs that do not contain `/terrapedia-images/`, verify those URLs are directly browser-accessible before accepting them. The current frontend preview proxy rewrites only paths containing `/terrapedia-images/`; other managed URLs pass through unchanged.

- [ ] **Step 4: Run local stack smoke only after approved DB apply**

After code review and user approval for local DB writes, run the full town NPC pipeline so fetch, image sync, and import happen in order:

```bash
node scripts/data/pipeline/run-town-npc-sync-pipeline.mjs --apply=true
node scripts/data/audit/audit-town-npc-shop-runtime.mjs --database=terria_v1_local
```

Before accepting the import result, verify the generated JSON no longer contains raw wiki asset URLs:

```bash
node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync("data/generated/wiki-town-npc-maintenance.latest.json","utf8")); const rows=Array.isArray(j.records)?j.records:[]; const raw=rows.flatMap(r=>Object.values(r.wikiDetails||{})).filter(v=>String(v||"").includes("terraria.wiki.gg")).length; console.log(JSON.stringify({rawAssetUrls:raw},null,2)); if(raw !== 0) process.exit(1);'
```

Then restart the local stack and run. The restart is required because this change adds compiled backend code, DTO/entity fields, and a Flyway migration; an already-running backend process will not load those code/schema changes:

```bash
curl -s 'http://127.0.0.1:8080/api/public/npcs/17/aggregate?include=shop,buffs' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const npc=j.data?.npc; const shop=j.data?.shopEntries||[]; const out={name:npc?.nameZh, portraitPresent:Boolean(npc?.wikiAssets?.dialogPortraitImage), prefCount:(npc?.livingPreferences||[]).length, shopCount:shop.length, priceCount:shop.filter(x=>x.priceText).length, availabilityCount:shop.filter(x=>x.notes || (Array.isArray(x.conditions) && x.conditions.length > 0)).length}; console.log(JSON.stringify(out,null,2)); if(out.name!=="商人" || !out.portraitPresent || out.prefCount < 1 || out.shopCount < 1 || out.priceCount < 1 || out.availabilityCount < 1) process.exit(1);})'
```

Also verify the portrait URL is either preview-proxyable or directly browser-accessible:

```bash
curl -s 'http://127.0.0.1:8080/api/public/npcs/17/aggregate?include=shop,buffs' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const url=j.data?.npc?.wikiAssets?.dialogPortraitImage||""; console.log(url); if(!url || (!url.includes("/terrapedia-images/") && !/^https?:\\/\\//.test(url))) process.exit(1);})'
```

For URLs that do not contain `/terrapedia-images/`, do not stop at the shape check. The frontend preview helper passes those URLs through unchanged, so the URL must load directly in the browser. Run an actual load check:

```bash
curl -s 'http://127.0.0.1:8080/api/public/npcs/17/aggregate?include=shop,buffs' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",async()=>{const j=JSON.parse(s); const url=j.data?.npc?.wikiAssets?.dialogPortraitImage||""; if(!url || url.includes("/terrapedia-images/")) process.exit(0); if(!/^https?:\/\//.test(url)) process.exit(1); const res=await fetch(url,{method:"HEAD"}); console.log(JSON.stringify({url,status:res.status},null,2)); if(!res.ok) process.exit(1);})'
```

If this command has no output, the URL is preview-proxyable through `/preview-assets/terrapedia-images/...`. If it prints a URL/status JSON, the HEAD request must return a successful HTTP status; if the origin blocks HEAD but works in browsers, replace this with a Playwright image-load check before accepting the smoke.

Expected after DB apply:

```json
{
  "name": "商人",
  "portraitPresent": true,
  "prefCount": 1,
  "shopCount": 1,
  "priceCount": 1,
  "availabilityCount": 1
}
```

Exact counts may be higher; any zero for `prefCount`, `shopCount`, `priceCount`, or `availabilityCount` is failure. Running only the relation compatibility SQL fix is not sufficient closure, because it preserves town NPC rows but does not populate missing prices, availability, portraits, or preferences.

- [ ] **Step 5: Run frontend smoke**

Run:

```bash
cd front-nuxt && pnpm run dev --host 127.0.0.1 --port 3000
```

Open `/npcs/17` and confirm:

- hero uses dialogue portrait when available
- shop rows show prices
- conditional shop rows show readable availability labels
- `生活偏好` appears for NPCs with preferences
- no raw wiki template or raw wiki image URL is visible

- [ ] **Step 6: Inspect git scope**

Run:

```bash
git status --short
git diff --cached --stat
```

Do not stage unrelated files. Do not use `git add .`.

- [ ] **Step 7: Commit focused change**

Stage only files that were actually created or modified from this explicit list:

```bash
git add scripts/data/relation/sync-relation-to-local-compat-tables.mjs scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
git add scripts/data/import/import-wiki-town-npcs-to-db.mjs scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
git add scripts/data/audit/audit-town-npc-shop-runtime.mjs scripts/data/audit/audit-town-npc-shop-runtime.test.mjs
git add scripts/data/lib/minio-image-upload.mjs scripts/data/lib/minio-image-upload.test.mjs
git add scripts/data/workflow/run-image-sync.mjs scripts/data/workflow/run-image-sync.test.mjs
git add scripts/data/pipeline/run-town-npc-sync-pipeline.mjs scripts/data/pipeline/town-npc-sync-args.mjs scripts/data/pipeline/town-npc-sync-args.test.mjs
git add scripts/data/fetch/fetch-wiki-town-npc-maintenance.py scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
git add back/src/main/resources/db/migration/V46__add_town_npc_rich_profile_fields.sql back/src/main/java/com/terraria/skills/entity/Npc.java back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java back/src/main/java/com/terraria/skills/dto/NpcLivingPreferenceDTO.java back/src/main/java/com/terraria/skills/dto/NpcWikiAssetsDTO.java back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java
git add front-nuxt/types/public-api.ts front-nuxt/composables/usePublicNpcs.ts front-nuxt/pages/npcs/[id].vue front-nuxt/scripts/check-public-pages.mjs
git commit -m "feat(npc): expose town npc rich detail data"
```

Omit paths that were not touched.

## Multi-Agent Execution And Review Plan

Read-only cross-review already completed:

- Reviewer A checked source/fetch/import/schema/audit assumptions and crawler progress constraints.
- Reviewer B checked DTO/API/frontend normalizer/page contract and validation gaps.

### Same-File Handoff: Import Script

Task 2 and Task 7 intentionally edit the same import files:

- `scripts/data/import/import-wiki-town-npcs-to-db.mjs`
- `scripts/data/import/import-wiki-town-npcs-to-db.test.mjs`

Task 7 must not start from a stale worktree. Before Task 7 begins, the main agent must merge or rebase the Data/relation worker's completed Task 2 changes into the Task 7 worktree or branch and record the Task 2 commit or handoff diff. The Task 7 worker must inspect the current import diff and confirm the Task 2 regression coverage for price, availability, parsed conditions, and condition-note fallback is still present.

Task 7 may only append or integrate profile-field tests into the existing import test file. It must not replace the file wholesale. If a conflict occurs in `importTownNpcRecord()`, `prepareShopEntries()`, or import test helpers, preserve Task 2's shop price/availability/condition assertions and then add Task 7 profile assertions.

Before implementing Task 7, run:

```bash
node --test scripts/data/import/import-wiki-town-npcs-to-db.test.mjs
```

Expected: the Task 2 import regressions pass on the Task 7 starting point. If they do not, stop and repair the handoff before adding Task 7 changes.

Implementation workers should run sequentially by write ownership and schema dependency:

1. Data/relation worker: Tasks 1, 2, and 3.
2. Backend schema worker: Task 4.
3. Fetch/image/pipeline worker: Tasks 5 and 6.
4. Data import worker: Task 7, starting only after the same-file import handoff above is complete and verified.
5. Backend API worker: Task 8.
6. Frontend worker: Task 9.
7. Main agent: Task 10 integration validation.

After each implementation phase, dispatch a read-only reviewer for that phase before continuing. If a worker discovers a schema mismatch, missing source field, image localization gap, or failed smoke, patch this plan, re-run plan audit, then continue. Do not invent frontend fallback fixtures to hide upstream gaps.

## Completion Criteria

The task is complete only when:

- Merchant or another verified town vendor public aggregate response has non-empty shop `priceText`.
- At least one shop row has structured `conditions` or preserved availability `notes`.
- Relation compatibility sync no longer deletes town NPC shop rows.
- NPC aggregate response includes managed `wikiAssets.dialogPortraitImage` for a town NPC with source portrait.
- NPC aggregate response includes `livingPreferences` for a town NPC with source preferences.
- `/npcs/17` or another verified town NPC page renders those fields without raw wiki template text or raw wiki image URLs.
- Focused data, backend, and frontend checks pass.
