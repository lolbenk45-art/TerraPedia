# Armor Set Image Fallback Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make armor-set images render consistently in admin and public surfaces when full armor wear images are missing but managed part images already exist.

**Architecture:** Treat managed image selection as a backend contract, not a page-only workaround. The admin armor-set API should expose the same usable fallback image set as the public armor-set API, and the admin UI should consume that contract. Add a read-only chain audit so future data refreshes cannot silently leave projection image fields empty while local managed images exist.

**Tech Stack:** Spring Boot 3, JdbcTemplate, JUnit 5, Node.js `node:test`, Nuxt admin page contract tests, MySQL read-only validation.

---

## Current Analysis

This is a common chain problem, not a single bad image.

- The reported rows are reproducible:
  - `53420643 / ArmorSetBonus.Meteor` has `projection_armor_sets.male_images` and `female_images`, so it renders.
  - `158677909 / ArmorSetBonus.BeetleDamage`, `265780782 / ArmorSetBonus.MonkTier2`, and `282558401 / ArmorSetBonus.MonkTier3` have no `male_images`, `female_images`, or `special_images`.
  - Their `related_items_json` image fields are also `null`.
- The image files are not missing:
  - The part rows in `items.image` and `item_images.cached_url` have managed URLs.
  - Sample URLs return `200 image/png`.
- Public route was already patched:
  - `PublicArmorSetServiceImpl` returns `fallbackImages` from `item_images.cached_url`.
  - `/api/public/armor-sets` returns fallback images for the reported rows.
- Admin route is still incomplete:
  - `AdminArmorSetController.enrichProjectionEquipmentItems` only enriches from `projection_items.image`.
  - Current local DB has `projection_items.image = 0/6146`, while `items.image = 6133/6159`.
  - Admin UI `resolveRowImageUrl()` returns empty for armor sets when wear images are absent and does not consume `fallbackImages`.
- The wider pattern exists:
  - `projection_items.image` is empty while local item images exist.
  - `projection_npcs.image_url` is empty while local NPC images exist.
  - `projection_buffs.image` and `projection_projectiles.image_url` are currently healthy.
  - The running local DB has `terria_v1_local` and `terria_v1_relation`, but no `terria_v1_maint`, so plans that assume a live maint layer are not valid for this immediate fix.

## Scope

In scope:

- Admin armor-set list/detail API image fallback.
- Admin armor-set page preview image selection.
- Public/admin contract parity for armor-set fallback images.
- Read-only audit that flags projection image holes when local managed images exist.

Out of scope:

- Running crawler/import/backfill/apply scripts.
- Creating or restoring `terria_v1_maint`.
- Replacing the full item/NPC projection image chain in this branch.
- Editing unrelated homepage work in the main worktree.

## Branch

- Branch: `fix/armor-set-image-fallback-chain-2026-05-21`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/fix-armor-set-image-fallback-chain-2026-05-21`

## File Map

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`
  - Add managed item fallback enrichment for projection equipment items.
  - Expose `fallbackImages` in list/detail payloads when wear images are missing.
  - Keep raw wiki URLs suppressed.

- Modify: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
  - Add failing tests for reported shape: no wear images, projection item image empty, local item image exists.
  - Assert API returns `imageUrl`, `fallbackImages`, enriched `equipmentItems.image`, and usable `managedImageCount`.

- Modify: `data-query-app/pages/entities/[type].vue`
  - Let armor-set preview select from wear images first, then `fallbackImages`, then related/equipment item images, then `imageUrl`.
  - Keep existing data quality warning UI.

- Modify: `data-query-app/tests/armor-sets-data-quality-contract.test.mjs`
  - Add a page contract test proving armor-set rows do not discard `fallbackImages`.

- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
  - Add explicit fallback debt metrics for items, NPCs, and armor sets:
    - local/core rows with managed image values
    - projection rows with blank image values
    - projection blank but local/core image available

- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
  - Add tests for the new fallback debt metrics.

## Task 1: Backend Admin Armor Fallback Contract

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`

- [ ] **Step 1: Write failing backend test**

Add a test named `projectionArmorSetUsesManagedLocalItemImagesWhenWearImagesAreMissing`.

Fixture shape:

```java
// projection_armor_sets row
male_images = "";
female_images = "";
special_images = "";
related_items_json = "[{\"id\":2199,\"itemId\":2199,\"sourceId\":2199,\"internalName\":\"BeetleHelmet\",\"image\":null}]";

// projection_items row
id = 2199;
image = null;

// local item image fallback row
item_id = 2199;
cached_url = "http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png";
```

Assertions:

```java
assertEquals(
    "http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png",
    data.get("imageUrl")
);
assertEquals(
    List.of("http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png"),
    data.get("fallbackImages")
);
assertEquals(
    "http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png",
    equipmentItems.get(0).get("image")
);
assertFalse(String.valueOf(data).contains("terraria.wiki.gg/images"));
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
cd back
mvn -Dtest=AdminArmorSetControllerTest#projectionArmorSetUsesManagedLocalItemImagesWhenWearImagesAreMissing test
```

Expected: FAIL because the admin controller currently returns no fallback image for this projection shape.

- [ ] **Step 3: Implement backend fallback**

Implementation requirements:

- Build a `Map<Long, String>` from local `item_images.cached_url`, ordered by `is_primary DESC, sort_order ASC, id ASC`.
- Only keep URLs accepted by `ManagedImageUrlPolicy.isManagedImageUrl`.
- Use the fallback only when projection item image is blank.
- Put the selected URL into each equipment item as `image`.
- Add `fallbackImages` to the armor-set payload when wear images are empty.
- Use first fallback image as `image` and `imageUrl` only when wear images are empty.

- [ ] **Step 4: Verify backend tests pass**

Run:

```bash
cd back
mvn -Dtest=AdminArmorSetControllerTest,PublicArmorSetServiceImplTest test
```

Expected: PASS.

## Task 2: Admin UI Preview Consumption

**Files:**
- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/tests/armor-sets-data-quality-contract.test.mjs`

- [ ] **Step 1: Write failing page contract test**

Add assertions that the armor-set preview resolver includes these source fields:

```js
assert.match(page, /fallbackImages/);
assert.match(page, /relatedItems/);
assert.match(page, /equipmentItems/);
assert.doesNotMatch(page, /if \(entityType\.value === 'armor-sets'\) return ''/);
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
cd data-query-app
node --test tests/armor-sets-data-quality-contract.test.mjs
```

Expected: FAIL because current `resolveRowImageUrl()` exits early for armor sets.

- [ ] **Step 3: Implement UI source priority**

Use this priority for armor sets:

1. `maleImages`, `femaleImages`, `specialImages`
2. `fallbackImages`
3. `relatedItems[].image` / `relatedItems[].imageUrl`
4. `equipmentItems[].image` / `equipmentItems[].imageUrl`
5. `imageUrl`
6. `image`

Every candidate must pass `normalizeImageUrl`.

- [ ] **Step 4: Verify UI contract test passes**

Run:

```bash
cd data-query-app
node --test tests/armor-sets-data-quality-contract.test.mjs
```

Expected: PASS.

## Task 3: Read-Only Chain Audit For Projection Image Holes

**Files:**
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`

- [ ] **Step 1: Write failing audit test**

Add a test where:

```js
entities.items = {
  coreRows: [{ internalName: 'BeetleHelmet', image: 'http://localhost:9000/terrapedia-images/items/beetle.png' }],
  projectionRows: [{ internalName: 'BeetleHelmet', image: null }],
};
```

Expected report shape:

```js
assert.equal(report.entities.items.lineage.projection.rowsBlankButCoreImageAvailable, 1);
assert.ok(report.entities.items.gapReasons.includes('projection_blank_but_core_image_available'));
```

Add two more explicit cases:

```js
entities.npcs = {
  coreRows: [{ internalName: 'Guide', imageUrl: 'http://localhost:9000/terrapedia-images/npcs/guide.png' }],
  projectionRows: [{ internalName: 'Guide', imageUrl: null }],
};
assert.equal(report.entities.npcs.lineage.projection.rowsBlankButCoreImageAvailable, 1);
assert.ok(report.entities.npcs.gapReasons.includes('projection_blank_but_core_image_available'));
```

```js
entities.armor_sets = {
  coreRows: [{
    textKey: 'ArmorSetBonus.BeetleDamage',
    maleImages: null,
    femaleImages: null,
    specialImages: null,
    fallbackImages: ['http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/beetle-helmet.png'],
  }],
  projectionRows: [{
    textKey: 'ArmorSetBonus.BeetleDamage',
    maleImages: null,
    femaleImages: null,
    specialImages: null,
  }],
};
assert.equal(report.entities.armor_sets.lineage.projection.rowsBlankButCoreImageAvailable, 1);
assert.ok(report.entities.armor_sets.gapReasons.includes('projection_blank_but_core_image_available'));
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

Expected: FAIL because current lineage report does not quantify this fallback debt.

- [ ] **Step 3: Implement metrics**

Add a read-only comparison from normalized entity keys:

- items: `internalName`
- NPCs: `internalName`
- armor sets: `textKey`

Do not write DB rows or mutate reports from this helper.

- [ ] **Step 4: Verify audit test passes**

Run:

```bash
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

Expected: PASS.

## Task 4: Runtime Read-Only Validation

**Files:** none.

- [ ] **Step 1: Confirm DB evidence**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const { spawnSync } = require('child_process');
const cfg = JSON.parse(fs.readFileSync('/home/lolben/TerraPedia/scripts/dev/config/local-stack.config.json', 'utf8'));
const db = cfg.database || {};
const sql = `
SELECT 'armor_projection_images', COUNT(*),
  SUM(COALESCE(NULLIF(male_images,''),NULLIF(female_images,''),NULLIF(special_images,'')) IS NOT NULL)
FROM terria_v1_relation.projection_armor_sets;
SELECT 'projection_items', COUNT(*), SUM(image IS NOT NULL AND image <> '') FROM terria_v1_relation.projection_items;
SELECT 'local_items', COUNT(*), SUM(image IS NOT NULL AND image <> '') FROM items WHERE deleted=0;
`;
const result = spawnSync('mysql', ['-h', db.host, '-P', String(db.port), '-u', db.username, '--batch', '--raw'], {
  input: sql,
  encoding: 'utf8',
  env: { ...process.env, MYSQL_PWD: db.password || '' },
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 0);
NODE
```

Expected local baseline today:

- `projection_armor_sets`: 63 rows, 34 with wear images.
- `projection_items.image`: 0 populated rows.
- `items.image`: 6133 populated rows in the 2026-05-21 local sample.

- [ ] **Step 2: Validate admin API after backend restart**

Run after restarting backend from this branch:

```bash
curl -s 'http://localhost:18088/api/admin/armor-sets/158677909' \
  -H "Authorization: Bearer $TP_ADMIN_TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=JSON.parse(s); const d=p.data; console.log(JSON.stringify({id:d.id,imageUrl:d.imageUrl,fallbackImages:d.fallbackImages,equipmentImages:d.equipmentItems?.map(i=>i.image)},null,2))})"
```

Expected:

- `imageUrl` is a managed `http://localhost:9000/terrapedia-images/...` URL.
- `fallbackImages.length > 0`.
- At least one `equipmentImages` entry is non-empty.

- [ ] **Step 3: Validate image asset URLs**

Run:

```bash
for url in \
  'http://localhost:9000/terrapedia-images/items/wiki/item-images/cc/cc42cd37db5adb0a6de770873c4c460ef3384f6a-beetle-helmet-png.png' \
  'http://localhost:9000/terrapedia-images/items/wiki/item-images/28/283d27cc2edabd0e06a410033e830e2e5f12e2be-monk-s-bushy-brow-bald-cap-png.png'
do
  curl -sS -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' "$url"
done
```

Expected: `200 image/png` for both URLs.

## Task 5: Final Validation

Run focused checks:

```bash
cd back
mvn -Dtest=AdminArmorSetControllerTest,PublicArmorSetServiceImplTest test

cd ../data-query-app
node --test tests/armor-sets-data-quality-contract.test.mjs

cd ..
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

If runtime was restarted from this branch, also inspect the admin page at:

```text
http://localhost:3001/entities/armor-sets
```

Expected:

- Rows `158677909`, `265780782`, and `282558401` no longer show only `AS` placeholders when managed item fallback images are present.
- The page still shows data quality warnings for rows missing full wear images.

## Plan Audit

Status: execution-ready after user approval.

- Goal lock: fixed to admin/public armor-set image rendering when managed item fallback images exist.
- Source-chain lock: source files and local DB keep original image ownership; branch only repairs API/UI consumption and read-only audit.
- Boundary lock: no crawler/import/backfill/apply or `terria_v1_maint` restoration in this branch.
- Evidence lock: failing backend test, failing UI contract test, failing audit test, runtime DB/API checks.
- Residual risk: this branch does not fully repair `projection_items.image` or `projection_npcs.image_url`; it makes the gap visible and stops armor-set UI from breaking while the larger projection repair is planned separately.
