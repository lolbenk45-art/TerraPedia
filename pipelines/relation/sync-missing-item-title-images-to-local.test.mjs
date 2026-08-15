import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMissingItemTitleImagePlan,
  deriveWikiPngUrl,
  parseArgs,
  runMissingItemTitleImageSync
} from './sync-missing-item-title-images-to-local.mjs';

test('parseArgs defaults missing item title image sync to dry-run for material and wall categories', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    localDatabase: 'terria_v1_local',
    pageRecordsPath: 'data/standardized/item_pages.standardized.json',
    categoryIds: [48, 50],
    dateTag: null,
    backupSuffix: null
  });
});

test('parseArgs supports all category title image sync', () => {
  assert.deepEqual(parseArgs(['--all-categories']), {
    apply: false,
    localDatabase: 'terria_v1_local',
    pageRecordsPath: 'data/standardized/item_pages.standardized.json',
    categoryIds: [],
    dateTag: null,
    backupSuffix: null
  });
});

test('deriveWikiPngUrl builds deterministic wiki image URL from page title', () => {
  assert.equal(
    deriveWikiPngUrl('Blue Mossy Wall'),
    'https://terraria.wiki.gg/images/Blue_Mossy_Wall.png'
  );
  assert.equal(
    deriveWikiPngUrl("Tinkerer's Workshop"),
    'https://terraria.wiki.gg/images/Tinkerer%27s_Workshop.png'
  );
});

test('buildMissingItemTitleImagePlan maps missing local images to standardized page titles', () => {
  const plan = buildMissingItemTitleImagePlan({
    localItems: [
      item(4499, 'Cave4Echo', 'Blue Mossy Wall', null, 50),
      item(30, 'DirtWall', 'Dirt Wall', 'https://terraria.wiki.gg/images/Dirt_Wall.png', 50),
      item(205, 'EmptyBucket', 'Empty Bucket', null, 23)
    ],
    pageRecords: [
      { itemInternalName: 'Cave4Echo', pageTitle: 'Blue Mossy Wall' },
      { itemInternalName: 'EmptyBucket', pageTitle: 'Empty Bucket' }
    ],
    categoryIds: [48, 50]
  });

  assert.deepEqual(plan.summary, {
    localItemCount: 3,
    missingCandidateCount: 1,
    plannedUpdateCount: 1,
    skippedWithoutPageCount: 0
  });
  assert.deepEqual(plan.updates, [{
    itemId: 4499,
    internalName: 'Cave4Echo',
    name: 'Blue Mossy Wall',
    categoryId: 50,
    pageTitle: 'Blue Mossy Wall',
    sourceFileTitle: 'Blue Mossy Wall.png',
    imageUrl: 'https://terraria.wiki.gg/images/Blue_Mossy_Wall.png'
  }]);
});

test('buildMissingItemTitleImagePlan treats placed images as missing but keeps Demon item icons', () => {
  const plan = buildMissingItemTitleImagePlan({
    localItems: [
      item(52, 'AngelStatue', 'Angel Statue', 'https://terraria.wiki.gg/images/Angel_Statue_%28placed%29.png?735099', 144),
      item(2752, 'LivingDemonFireBlock', 'Living Demon Fire Block', 'https://terraria.wiki.gg/images/Living_Demon_Fire_Block.png', 48)
    ],
    pageRecords: [
      { itemInternalName: 'AngelStatue', pageTitle: 'Angel Statue' },
      { itemInternalName: 'LivingDemonFireBlock', pageTitle: 'Living Demon Fire Block' }
    ],
    categoryIds: []
  });

  assert.deepEqual(plan.summary, {
    localItemCount: 2,
    missingCandidateCount: 1,
    plannedUpdateCount: 1,
    skippedWithoutPageCount: 0
  });
  assert.deepEqual(plan.updates.map((entry) => ({
    itemId: entry.itemId,
    imageUrl: entry.imageUrl
  })), [{
    itemId: 52,
    imageUrl: 'https://terraria.wiki.gg/images/Angel_Statue.png'
  }]);
});

test('runMissingItemTitleImageSync dry-run writes report without mutating tables', async () => {
  const statements = [];
  let reportPayload = null;
  const result = await runMissingItemTitleImageSync(
    {
      apply: false,
      localDatabase: 'terria_v1_local',
      categoryIds: [48, 50],
      dateTag: '2026-04-27',
      backupSuffix: '20260427120000'
    },
    {
      readPageRecords: async () => [{ itemInternalName: 'Cave4Echo', pageTitle: 'Blue Mossy Wall' }],
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [[item(4499, 'Cave4Echo', 'Blue Mossy Wall', null, 50)]];
        }
      }),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/missing-item-title-images-2026-04-27.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.summary.plannedUpdateCount, 1);
  assert.equal(reportPayload.updates[0].imageUrl, 'https://terraria.wiki.gg/images/Blue_Mossy_Wall.png');
  assert.ok(statements.every((sql) => !/UPDATE|INSERT INTO|CREATE TABLE/i.test(sql)));
});

test('runMissingItemTitleImageSync apply backs up and writes item image rows', async () => {
  const statements = [];
  await runMissingItemTitleImageSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      categoryIds: [48, 50],
      dateTag: '2026-04-27',
      backupSuffix: '20260427120000'
    },
    {
      readPageRecords: async () => [{ itemInternalName: 'Cave4Echo', pageTitle: 'Blue Mossy Wall' }],
      executeLocal: async (fn) => fn({
        query: async (sql, params = []) => {
          statements.push({ sql, params });
          if (/SELECT `id`, `internal_name`/.test(sql)) {
            return [[item(4499, 'Cave4Echo', 'Blue Mossy Wall', null, 50)]];
          }
          return [{ affectedRows: 1 }];
        }
      }),
      writeReport: async () => 'reports/relation/missing-item-title-images-2026-04-27.json'
    }
  );

  assert.ok(statements.some((entry) => entry.sql.includes('CREATE TABLE `terria_v1_local`.`items_title_image_backup_20260427120000` LIKE `terria_v1_local`.`items`')));
  assert.ok(statements.some((entry) => entry.sql.includes('CREATE TABLE `terria_v1_local`.`item_images_title_image_backup_20260427120000` LIKE `terria_v1_local`.`item_images`')));
  assert.ok(statements.some((entry) => /UPDATE `terria_v1_local`\.`items`/.test(entry.sql)));
  assert.ok(statements.some((entry) => /INSERT INTO `terria_v1_local`\.`item_images`/.test(entry.sql)));
  assert.ok(statements.some((entry) => /COMMIT/i.test(entry.sql)));
});

function item(id, internalName, name, image, categoryId) {
  return {
    id,
    internal_name: internalName,
    name,
    image,
    category_id: categoryId,
    deleted: 0,
    status: 1
  };
}
