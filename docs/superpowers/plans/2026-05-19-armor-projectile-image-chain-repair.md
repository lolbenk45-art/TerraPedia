# Armor And Projectile Image Chain Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore durable managed images for armor-set admin pages and keep projectile detail source item/NPC images from regressing on later data refreshes.

**Architecture:** Fix the data chain instead of adding another page-only fallback. Armor-set images must flow from existing source rows and MinIO managed URLs into maint, relation, projection, and then `AdminArmorSetController`; projectile detail source images must be enriched from durable local/relation image sources while sync scripts refuse to wipe local images from an empty relation table.

**Tech Stack:** Node.js ESM data scripts and `node:test`, MySQL-compatible relation/local sync scripts, Spring Boot 3 controllers, JdbcTemplate, JUnit 5, MinIO managed URL policy.

---

## Current Evidence

- Root repo starts from `main` at `4e4fe49`, clean, ahead of `origin/main` by 8 commits.
- Do not delete or rewrite any existing branch/worktree. In particular, `fix/projectile-source-detail-images-2026-05-19` is an old worktree with useful uncommitted projectile reference changes only.
- Armor set DB state shows the durable chain is empty:
  - `armor_sets` has 151 rows.
  - `armor_sets.male_images`, `female_images`, and `special_images` are empty.
  - `terria_v1_relation.relation_armor_set_images` has 0 rows.
  - `terria_v1_relation.projection_armor_sets` has 0 rows.
- Source armor images exist:
  - `data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json` has `armorSetImages = 175`.
  - Every row currently has `originalUrl`, but `cachedUrl = null`.
- MinIO is not the missing piece:
  - Existing objects are under `/home/lolben/.local/share/terrapedia/minio/data/terrapedia-images/items/wiki/armor-sets`.
  - Sample public URLs return `200 image/png`.
- Current API symptom:
  - `GET /api/admin/armor-sets?page=1&limit=5` returns `imageUrl: null`, `managedImageCount: 0`, and `imagePipelineStatus: "source_images_unmanaged"`.
- Projectile current patch risk:
  - Detail source item/NPC images can be enriched at read time, but `relation_item_images = 0`.
  - `scripts/data/relation/sync-relation-item-images-to-local.mjs --apply` currently deletes local `item_images` before inserting relation images; with an empty relation table this can wipe the 8322 usable local managed item image rows.

## Success Criteria

- Armor-set list/detail API returns managed image URLs for rows whose source image has a matching existing MinIO object.
- `relation_armor_set_images` and `projection_armor_sets` are populated by the maint -> relation -> projection chain, not by hand-editing local API responses.
- `imagePipelineStatus` for representative armor sets moves from `source_images_unmanaged` to `managed_images_available`.
- Projectile detail source items and source NPCs include managed image URLs.
- Future local item-image sync cannot delete existing local `item_images` when relation input is empty or below a clearly unsafe threshold.
- All DB writes have dry-run output first; apply steps only run after the dry-run summary proves nonzero source/matched counts.
- Existing branches/worktrees remain untouched unless explicitly named in the implementation step.

## File Map

- Create: `scripts/data/workflow/armor-set-managed-image-index.mjs`
  - Build a deterministic lookup from source armor-set image rows to already-managed MinIO URLs.
  - Prefer exact matches by `sourceFileTitle` and fall back to normalized `pageTitle + imageRole`.
  - Export pure helpers for tests and a CLI that can dry-run or apply updates to `armor_set_images.parsed.latest.json`.

- Create: `scripts/data/workflow/armor-set-managed-image-index.test.mjs`
  - Unit-test exact file title matching, role/page fallback, dry-run behavior, and no-match reporting.

- Modify: `scripts/data/workflow/run-image-sync.mjs`
  - Add an `armor_set_images` scope so future image uploads/writebacks can update `armor_set_images.parsed.latest.json`.
  - Keep default scopes unchanged.

- Modify: `scripts/data/workflow/run-image-sync.test.mjs`
  - Verify `--scopes=armor_set_images --apply=false` counts unmanaged armor set images and does not mutate the source file.

- Modify: `scripts/data/relation/armor-set-processor.mjs`
  - Ensure `buildManagedArmorImageLookup` consumes `maintArmorSetImages.cachedUrl` and existing relation rows with managed URLs for armor-set image rows.
  - Preserve only managed URLs in `relationArmorSetImages.cachedUrl`.

- Modify: `scripts/data/relation/armor-set-processor.test.mjs`
  - Add a case where `maintArmorSetImages` provides a managed MinIO URL for `Wood armor` male/female image rows and projection receives it.

- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
  - Make armor-set image counts explicit in dry-run/apply summaries.
  - Keep writes inside existing relation/projection sync flow.

- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
  - Assert dry-run includes `maintArmorSetImages`, `relationArmorSetImages`, and `projectionArmorSets` counts when armor image rows are present.

- Modify: `scripts/data/relation/sync-relation-item-images-to-local.mjs`
  - Add an apply guard that blocks destructive local image replacement when relation image input is empty or no relation image matches local items.
  - Keep an explicit override flag for deliberate recovery runs.

- Modify: `scripts/data/relation/sync-relation-item-images-to-local.test.mjs`
  - Add tests proving apply aborts before `DELETE FROM item_images` when `relationItemImages = 0` or `relationImagesMatchedToLocalItems = 0`.

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
  - Port the projectile detail enrichment from the old branch only after tests are written.
  - Enrich `sourceItems` from local `item_images` and `sourceNpcs` from managed `npcs.image_url`, without changing public projectile payloads.

- Modify: `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`
  - Add detail test for source item image and source NPC image enrichment.

- Modify: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
  - Add projection-backed armor-set managed image assertions if existing tests do not already cover the final API shape.

## Parallel Execution Boundaries

- Agent A owns armor-set image indexing and armor-set relation/projection tests:
  - `scripts/data/workflow/armor-set-managed-image-index.mjs`
  - `scripts/data/workflow/armor-set-managed-image-index.test.mjs`
  - armor-set-only tests in `scripts/data/relation/armor-set-processor.test.mjs`
  - armor-set-only tests in `scripts/data/relation/sync-maint-to-relation.test.mjs`

- Agent B owns projectile/local item-image regression protection:
  - `scripts/data/relation/sync-relation-item-images-to-local.mjs`
  - `scripts/data/relation/sync-relation-item-images-to-local.test.mjs`
  - `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
  - `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`

- Coordinator owns shared integration after both agents return:
  - `scripts/data/workflow/run-image-sync.mjs`
  - `scripts/data/workflow/run-image-sync.test.mjs`
  - final runtime dry-runs, optional apply, backend tests, restart.

## Task 1: Armor Set Managed Image Index

**Files:**
- Create: `scripts/data/workflow/armor-set-managed-image-index.mjs`
- Test: `scripts/data/workflow/armor-set-managed-image-index.test.mjs`

- [ ] **Step 1: Write the failing index test**

Create `scripts/data/workflow/armor-set-managed-image-index.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorSetManagedImageIndex,
  applyManagedArmorSetImageUrls
} from './armor-set-managed-image-index.mjs';

test('buildArmorSetManagedImageIndex matches MinIO object names by source file title', () => {
  const index = buildArmorSetManagedImageIndex({
    managedUrls: [
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png',
      'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor-female-png.png'
    ]
  });

  const payload = {
    armorSetImages: [
      {
        pageTitle: 'Wood armor',
        imageRole: 'male',
        sourceFileTitle: 'Wood armor.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
        cachedUrl: null
      },
      {
        pageTitle: 'Wood armor',
        imageRole: 'female',
        sourceFileTitle: 'Wood armor female.png',
        originalUrl: 'https://terraria.wiki.gg/images/Wood_armor_female.png',
        cachedUrl: null
      }
    ]
  };

  const result = applyManagedArmorSetImageUrls(payload, index);

  assert.equal(result.updated, 2);
  assert.equal(payload.armorSetImages[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png');
  assert.equal(payload.armorSetImages[1].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor-female-png.png');
});

test('applyManagedArmorSetImageUrls leaves unmatched rows unchanged and reports them', () => {
  const index = buildArmorSetManagedImageIndex({ managedUrls: [] });
  const payload = {
    armorSetImages: [
      {
        pageTitle: 'Missing armor',
        imageRole: 'male',
        sourceFileTitle: 'Missing armor.png',
        originalUrl: 'https://terraria.wiki.gg/images/Missing_armor.png',
        cachedUrl: null
      }
    ]
  };

  const result = applyManagedArmorSetImageUrls(payload, index);

  assert.equal(result.updated, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(payload.armorSetImages[0].cachedUrl, null);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/workflow/armor-set-managed-image-index.test.mjs
```

Expected: FAIL with `Cannot find module` for `armor-set-managed-image-index.mjs`.

- [ ] **Step 3: Implement the index helper**

Create `scripts/data/workflow/armor-set-managed-image-index.mjs` with exported pure helpers:

```js
export function normalizeArmorImageKey(value) {
  return String(value ?? '')
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-png$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildArmorSetManagedImageIndex({ managedUrls = [] } = {}) {
  const byFileTitle = new Map();
  for (const url of managedUrls) {
    const text = String(url ?? '').trim();
    if (!text) continue;
    const fileName = decodeURIComponent(text.split('/').pop() ?? '');
    const withoutHash = fileName.replace(/^[a-f0-9]{8,64}-/i, '');
    const key = normalizeArmorImageKey(withoutHash);
    if (key && !byFileTitle.has(key)) {
      byFileTitle.set(key, text);
    }
  }
  return { byFileTitle };
}

export function applyManagedArmorSetImageUrls(payload, index) {
  const rows = Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [];
  const unmatched = [];
  let updated = 0;
  for (const row of rows) {
    const existing = String(row.cachedUrl ?? '').trim();
    if (existing.startsWith('http://localhost:9000/terrapedia-images/')) continue;
    const fileKey = normalizeArmorImageKey(row.sourceFileTitle);
    const managedUrl = index.byFileTitle.get(fileKey);
    if (managedUrl) {
      row.cachedUrl = managedUrl;
      updated += 1;
    } else {
      unmatched.push({
        pageTitle: row.pageTitle ?? null,
        imageRole: row.imageRole ?? null,
        sourceFileTitle: row.sourceFileTitle ?? null
      });
    }
  }
  return { total: rows.length, updated, unmatched };
}
```

The CLI portion must:

```bash
node scripts/data/workflow/armor-set-managed-image-index.mjs --input=data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json --minio-root=/home/lolben/.local/share/terrapedia/minio/data/terrapedia-images/items/wiki/armor-sets --apply=false
```

It should read MinIO object metadata paths, convert object paths to public URLs under `http://localhost:9000/terrapedia-images/items/wiki/armor-sets/...`, print JSON summary, and only write the input file when `--apply=true`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test scripts/data/workflow/armor-set-managed-image-index.test.mjs
```

Expected: PASS.

## Task 2: Armor Set Chain Consumption

**Files:**
- Modify: `scripts/data/relation/armor-set-processor.mjs`
- Test: `scripts/data/relation/armor-set-processor.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Test: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] **Step 1: Write failing armor processor test**

Add a test to `scripts/data/relation/armor-set-processor.test.mjs`:

```js
test('buildArmorSetRelations carries managed maint armor set image urls into relation rows', () => {
  const result = buildArmorSetRelations({
    wikiArmorSets: [{
      pageTitle: 'Wood armor',
      entityType: 'armor_set',
      compositionKind: 'traditional_set',
      images: [{
        role: 'male',
        fileTitle: 'Wood armor.png',
        url: 'https://terraria.wiki.gg/images/Wood_armor.png'
      }]
    }],
    maintItems: [
      item(1, 'WoodHelmet', 'Wood Helmet', { headSlot: 1 }),
      item(2, 'WoodBreastplate', 'Wood Breastplate', { bodySlot: 1 }),
      item(3, 'WoodGreaves', 'Wood Greaves', { legSlot: 1 })
    ],
    maintArmorSetImages: [{
      pageTitle: 'Wood armor',
      imageRole: 'male',
      sourceFileTitle: 'Wood armor.png',
      originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
      cachedUrl: 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png'
    }],
    managedImageUrlPrefixes: ['http://localhost:9000/terrapedia-images']
  });

  assert.equal(result.relationArmorSetImages.length, 1);
  assert.equal(result.relationArmorSetImages[0].cachedUrl, 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets/00/hash-wood-armor.png');
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: FAIL if managed maint rows are not being matched into relation image rows.

- [ ] **Step 3: Implement only the missing managed URL match**

In `scripts/data/relation/armor-set-processor.mjs`, keep existing `buildManagedArmorImageLookup` behavior and adjust only the missing key normalization if the RED test proves it is needed:

```js
const managedCachedUrl = managedImageLookup?.byOriginalUrl.get(normalizeUrlKey(originalUrl))
  ?? managedImageLookup?.byPageRoleFile.get(`${normalizeFileTitleKey(armorSet.rawPageTitle)}|${role}|${normalizeFileTitleKey(image.fileTitle)}`)
  ?? null;
```

The implementation must never put non-managed URLs into `cachedUrl`.

- [ ] **Step 4: Add sync summary test**

In `scripts/data/relation/sync-maint-to-relation.test.mjs`, assert the dry-run result exposes nonzero armor image counts when `maint_armor_set_images` rows exist:

```js
assert.equal(result.summary.maintArmorSetImages, 1);
assert.equal(result.summary.relationArmorSetImages, 1);
assert.equal(result.summary.projectionArmorSets, 1);
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: PASS.

## Task 3: Projectile Image Regression Guard

**Files:**
- Modify: `scripts/data/relation/sync-relation-item-images-to-local.mjs`
- Test: `scripts/data/relation/sync-relation-item-images-to-local.test.mjs`

- [ ] **Step 1: Write failing guard tests**

Add tests:

```js
test('runRelationItemImagesToLocalSync apply blocks destructive sync when relation images are empty', async () => {
  const statements = [];
  await assert.rejects(
    () => runRelationItemImagesToLocalSync(
      { apply: true, dateTag: '2026-05-19', backupSuffix: '20260519000000' },
      {
        executeLocal: async (fn) => fn({ query: async (sql) => { statements.push(sql); return [[{ total: 0 }]]; } }),
        collectStats: async () => ({
          localItems: 10,
          localItemImages: 8322,
          relationItemImages: 0,
          relationImagesMatchedToLocalItems: 0,
          localItemsWithWikiImage: 0,
          localItemsWithMinioImage: 0
        }),
        writeReport: async () => 'reports/relation/test.json'
      }
    ),
    /relation item images are empty/i
  );
  assert.ok(statements.every((sql) => !/DELETE FROM `terria_v1_local`\.`item_images`/i.test(sql)));
});

test('runRelationItemImagesToLocalSync apply can be forced for deliberate recovery', async () => {
  const statements = [];
  await runRelationItemImagesToLocalSync(
    { apply: true, allowEmptyRelationImages: true, dateTag: '2026-05-19', backupSuffix: '20260519000000' },
    {
      executeLocal: async (fn) => fn({ query: async (sql) => { statements.push(sql); return [{ affectedRows: 1 }]; } }),
      collectStats: async () => ({
        localItems: 10,
        localItemImages: 8322,
        relationItemImages: 0,
        relationImagesMatchedToLocalItems: 0,
        localItemsWithWikiImage: 0,
        localItemsWithMinioImage: 0
      }),
      writeReport: async () => 'reports/relation/test.json'
    }
  );
  assert.ok(statements.some((sql) => /DELETE FROM `terria_v1_local`\.`item_images`/i.test(sql)));
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/relation/sync-relation-item-images-to-local.test.mjs
```

Expected: FAIL because apply does not yet block empty relation image input.

- [ ] **Step 3: Implement guard**

Add option parsing:

```js
allowEmptyRelationImages: booleanOption(raw['allow-empty-relation-images'] ?? raw.allowEmptyRelationImages, false)
```

Add before `applySync`:

```js
function assertSafeToApplyRelationItemImageSync(stats, options) {
  if (options.allowEmptyRelationImages) return;
  if ((stats.relationItemImages ?? 0) <= 0) {
    throw new Error('relation item images are empty; refusing to replace local item_images');
  }
  if ((stats.relationImagesMatchedToLocalItems ?? 0) <= 0) {
    throw new Error('relation item images do not match local items; refusing to replace local item_images');
  }
}
```

Call it after `before` stats and before backup/delete statements.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test scripts/data/relation/sync-relation-item-images-to-local.test.mjs
```

Expected: PASS.

## Task 4: Projectile Detail Source Image Enrichment

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`

- [ ] **Step 1: Write failing backend detail test**

Add a test asserting detail `sourceItems[0].image` and `sourceNpcs[0].imageUrl` are populated from managed local sources:

```java
mockMvc.perform(get("/api/admin/projectiles/{id}", 1L))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.sourceItems[0].itemId").value(40))
    .andExpect(jsonPath("$.data.sourceItems[0].image").value("http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png"))
    .andExpect(jsonPath("$.data.sourceNpcs[0].npcId").value(3))
    .andExpect(jsonPath("$.data.sourceNpcs[0].imageUrl").value("http://localhost:9000/terrapedia-images/npcs/zombie.png"));
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd back && mvn -Dtest=AdminProjectileControllerTest test
```

Expected: FAIL because source item/NPC detail images are absent on `main`.

- [ ] **Step 3: Port minimal enrichment from old projectile branch**

Use the old worktree only as a reference:

```bash
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/fix-crawler-monitor-progress-reliability-2026-05-15 diff -- back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java
```

Port only the code that:

- Parses `sourceItemsJson` and `sourceNpcsJson`.
- Queries local `item_images.cached_url` or managed `items.image` for source item IDs/internal names.
- Queries managed `npcs.image_url` for source NPC IDs/internal names.
- Filters with `ManagedImageUrlPolicy`.
- Leaves public projectile controller responses unchanged.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd back && mvn -Dtest=AdminProjectileControllerTest test
```

Expected: PASS.

## Task 5: Integrate Image Sync Scope And Runtime Data

**Files:**
- Modify: `scripts/data/workflow/run-image-sync.mjs`
- Test: `scripts/data/workflow/run-image-sync.test.mjs`

- [ ] **Step 1: Write failing armor image sync scope test**

Add a test that creates a temp `data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json`:

```js
{
  "armorSetImages": [
    {
      "pageTitle": "Wood armor",
      "imageRole": "male",
      "sourceFileTitle": "Wood armor.png",
      "originalUrl": "https://terraria.wiki.gg/images/Wood_armor.png",
      "cachedUrl": null
    }
  ]
}
```

Run:

```js
spawnSync(process.execPath, [scriptPath, '--apply=false', '--scopes=armor_set_images'], { cwd: tempDir, encoding: 'utf8' })
```

Assert:

```js
assert.equal(payload.modules.armor_set_images.total, 1);
assert.equal(payload.modules.armor_set_images.candidates, 1);
assert.equal(payload.modules.armor_set_images.changed, 1);
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/workflow/run-image-sync.test.mjs
```

Expected: FAIL because `armor_set_images` is not an accepted scope.

- [ ] **Step 3: Implement armor_set_images scope**

Add `armor_set_images` to `resolveScopes`.

Add:

```js
async function syncArmorSetImages() {
  const filePath = path.join(process.cwd(), 'data', 'terraPedia', 'raw', 'wiki', 'armor_set_images.parsed.latest.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [];
  return syncRecordImages({
    entityDomain: 'items',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.cachedUrl) || toText(record?.originalUrl),
    targetUrlWriter: (record, url) => {
      record.cachedUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.sourceFileTitle || record?.pageTitle || 'armor-set')}${guessExtension(url)}`,
    nameHint: (record) => record?.sourceFileTitle || record?.pageTitle || 'armor-set'
  });
}
```

Wire it in the scope loop as `summary.modules.armor_set_images = await syncArmorSetImages();`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --test scripts/data/workflow/run-image-sync.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Dry-run local armor image index**

Run:

```bash
node scripts/data/workflow/armor-set-managed-image-index.mjs --input=data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json --minio-root=/home/lolben/.local/share/terrapedia/minio/data/terrapedia-images/items/wiki/armor-sets --apply=false
```

Expected:

- `updated` is greater than 0.
- `unmatched` is not treated as fatal unless every row is unmatched.
- No file is written.

- [ ] **Step 6: Apply source image URL writeback**

Only after Step 5 passes, run:

```bash
node scripts/data/workflow/armor-set-managed-image-index.mjs --input=data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json --minio-root=/home/lolben/.local/share/terrapedia/minio/data/terrapedia-images/items/wiki/armor-sets --apply=true
```

Expected:

- `cachedUrl` values appear in `data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json`.
- The write is limited to source armor-set image JSON.

## Task 6: Maint/Relation/Projection Dry-Run, Apply, And API Verification

**Files:**
- Test: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`

- [ ] **Step 1: Run narrow test suite**

Run:

```bash
node --test scripts/data/workflow/armor-set-managed-image-index.test.mjs scripts/data/workflow/run-image-sync.test.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-relation-item-images-to-local.test.mjs
cd back && mvn -Dtest=AdminArmorSetControllerTest,AdminProjectileControllerTest test
```

Expected: PASS.

- [ ] **Step 2: Dry-run maint import for armor_set_images**

Run:

```bash
node scripts/data/maint/sync-landing-to-maint.mjs --scopes=armor_set_images --apply=false
```

Expected:

- Dry-run summary shows `armor_set_images` rows greater than 0.
- No DB write occurs.

- [ ] **Step 3: Apply maint import after dry-run passes**

Run:

```bash
node scripts/data/maint/sync-landing-to-maint.mjs --scopes=armor_set_images --apply=true
```

Expected:

- `maint_armor_set_images` contains rows with managed `cached_url`.

- [ ] **Step 4: Dry-run relation/projection sync for armor sets**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armor_sets,armor_set_images --apply=false
```

Expected:

- Dry-run summary shows nonzero `relationArmorSetImages`.
- Dry-run summary shows nonzero `projectionArmorSets`.
- No destructive local table sync is run.

- [ ] **Step 5: Apply relation/projection sync after dry-run passes**

Run:

```bash
node scripts/data/relation/sync-maint-to-relation.mjs --scopes=armor_sets,armor_set_images --apply=true
```

Expected:

- `terria_v1_relation.relation_armor_set_images` has rows.
- `terria_v1_relation.projection_armor_sets` has rows.

- [ ] **Step 6: Runtime API verification before restart**

Run:

```bash
curl -s 'http://localhost:18088/api/admin/armor-sets?page=1&limit=5' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify(p.data.records.map(r=>({name:r.name,imageUrl:r.imageUrl,managedImageCount:r.managedImageCount,imagePipelineStatus:r.imagePipelineStatus})),null,2))})"
curl -s 'http://localhost:18088/api/admin/projectiles/1' | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify({sourceItems:p.data.sourceItems?.length,sourceItemImage:p.data.sourceItems?.[0]?.image,sourceNpcs:p.data.sourceNpcs?.length,sourceNpcImage:p.data.sourceNpcs?.[0]?.imageUrl},null,2))})"
```

Expected:

- Armor rows with managed source images show non-null `imageUrl`.
- Armor rows show `managedImageCount > 0` and `imagePipelineStatus = "managed_images_available"`.
- Projectile detail shows non-null source item/NPC images where the local data has managed URLs.

- [ ] **Step 7: Restart project stack**

Stop existing backend/front/admin processes only after confirming their ports and working directories. Restart from the new branch worktree, not detached HEAD and not the old projectile worktree.

Expected:

- Backend runs from the new branch on `18088`.
- Front/admin run from the intended local worktree ports.
- No process remains attached to the old projectile worktree.

## Final Validation

Run:

```bash
git status --short --branch
node --test scripts/data/workflow/armor-set-managed-image-index.test.mjs scripts/data/workflow/run-image-sync.test.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs scripts/data/relation/sync-relation-item-images-to-local.test.mjs
cd back && mvn -Dtest=AdminArmorSetControllerTest,AdminProjectileControllerTest test
```

Then record:

- Current branch name.
- Exact commits or uncommitted files.
- Dry-run/apply report paths.
- API verification output.
- Restarted process ports and working directories.
