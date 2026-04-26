import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClearLocalMinioItemImagesSql,
  buildInsertLocalItemImagesSql,
  buildUpdateLocalItemsImageSql,
  parseArgs,
  runRelationItemImagesToLocalSync
} from './sync-relation-item-images-to-local.mjs';

test('parseArgs defaults relation item image sync to dry-run', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    dateTag: null,
    backupSuffix: null
  });
});

test('buildInsertLocalItemImagesSql maps relation images to local items by internal_name and writes wiki URLs', () => {
  const sql = buildInsertLocalItemImagesSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });

  assert.match(sql, /JOIN `terria_v1_local`\.`items` i\s+ON i\.`internal_name` COLLATE utf8mb4_unicode_ci = ranked\.`item_internal_name` COLLATE utf8mb4_unicode_ci/);
  assert.match(sql, /`original_url`, `cached_url`/);
  assert.match(sql, /CASE\s+WHEN ranked\.`original_url` IS NOT NULL/i);
  assert.doesNotMatch(sql, /\/terrapedia-images\/'%\s+THEN\s+ranked\.`cached_url`/i);
});

test('buildUpdateLocalItemsImageSql updates items.image from relation wiki URLs by internal_name', () => {
  const sql = buildUpdateLocalItemsImageSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });

  assert.match(sql, /UPDATE `terria_v1_local`\.`items` i/);
  assert.match(sql, /ON best\.`item_internal_name` COLLATE utf8mb4_unicode_ci = i\.`internal_name` COLLATE utf8mb4_unicode_ci/);
  assert.match(sql, /SET i\.`image` = best\.`wiki_url`/);
  assert.match(sql, /best\.`wiki_url` NOT LIKE '%\/terrapedia-images\/%'/);
});

test('relation item image sync rejects demo and placed wiki images as preferred item icons', () => {
  const insertSql = buildInsertLocalItemImagesSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });
  const updateSql = buildUpdateLocalItemsImageSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });
  const combinedSql = `${insertSql}\n${updateSql}`;

  assert.match(combinedSql, /LOWER\(rii\.`source_file_title`\) NOT LIKE '%\(demo\)%'/i);
  assert.match(combinedSql, /LOWER\(rii\.`source_file_title`\) NOT LIKE '%\(placed\)%'/i);
  assert.match(combinedSql, /LOWER\(rii\.`original_url`\) NOT LIKE '%28demo%29%'/i);
  assert.match(combinedSql, /LOWER\(rii\.`cached_url`\) NOT LIKE '%28placed%29%'/i);
});

test('relation item image sync treats demo and placed underscores as literals', () => {
  const insertSql = buildInsertLocalItemImagesSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });
  const updateSql = buildUpdateLocalItemsImageSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });
  const combinedSql = `${insertSql}\n${updateSql}`;

  assert.doesNotMatch(combinedSql, /LIKE '%_demo%'/i);
  assert.doesNotMatch(combinedSql, /LIKE '%!_demo%'/i);
  assert.doesNotMatch(combinedSql, /LIKE '%_placed%'/i);
  assert.doesNotMatch(combinedSql, /LIKE '%!_placed%'/i);
  assert.doesNotMatch(combinedSql, /LIKE '%\/placed_%'/i);
  assert.match(combinedSql, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)demo\(\[\._\?\&#\/-\]\|\$\)'/i);
  assert.match(combinedSql, /NOT REGEXP '\(\^\|\[\/_\[:space:\]-\]\)placed\(\[\._\?\&#\/-\]\|\$\)'/i);
});

test('buildClearLocalMinioItemImagesSql removes legacy MinIO item images from direct items.image consumers', () => {
  const sql = buildClearLocalMinioItemImagesSql({
    localDatabase: 'terria_v1_local'
  });

  assert.match(sql, /UPDATE `terria_v1_local`\.`items`/);
  assert.match(sql, /SET `image` = NULL/);
  assert.match(sql, /`image` LIKE '%\/terrapedia-images\/%'/);
});

test('runRelationItemImagesToLocalSync dry-run writes report without mutating local tables', async () => {
  const statements = [];
  let reportPayload = null;

  const result = await runRelationItemImagesToLocalSync(
    {
      apply: false,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-27',
      backupSuffix: '20260427120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [[{ total: 1 }]];
        }
      }),
      collectStats: async () => ({
        localItems: 2,
        localItemImagesBefore: 3,
        relationItemImages: 1,
        relationImagesMatchedToLocalItems: 1,
        localItemsWithWikiImageBefore: 0,
        localItemsWithMinioImageBefore: 2
      }),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/relation-item-images-to-local-sync-2026-04-27.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.summary.relationImagesMatchedToLocalItems, 1);
  assert.equal(reportPayload.summary.localItemImagesBefore, 3);
  assert.equal(result.reportPath, 'reports/relation/relation-item-images-to-local-sync-2026-04-27.json');
  assert.ok(statements.every((sql) => !/DELETE FROM|INSERT INTO|UPDATE `terria_v1_local`\.`items`|CREATE TABLE/i.test(sql)));
});

test('runRelationItemImagesToLocalSync apply backs up image tables and removes legacy MinIO item images', async () => {
  const statements = [];

  await runRelationItemImagesToLocalSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-27',
      backupSuffix: '20260427120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      collectStats: async () => ({
        localItems: 2,
        localItemImagesBefore: 3,
        relationItemImages: 1,
        relationImagesMatchedToLocalItems: 1,
        localItemsWithWikiImageBefore: 0,
        localItemsWithMinioImageBefore: 2
      }),
      writeReport: async () => 'reports/relation/relation-item-images-to-local-sync-2026-04-27.json'
    }
  );

  assert.ok(statements.some((sql) => sql.includes('CREATE TABLE `terria_v1_local`.`item_images_relation_backup_20260427120000` LIKE `terria_v1_local`.`item_images`')));
  assert.ok(statements.some((sql) => sql.includes('CREATE TABLE `terria_v1_local`.`items_relation_backup_20260427120000` LIKE `terria_v1_local`.`items`')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `terria_v1_local`.`item_images_relation_backup_20260427120000` SELECT * FROM `terria_v1_local`.`item_images`')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `terria_v1_local`.`items_relation_backup_20260427120000` SELECT * FROM `terria_v1_local`.`items`')));
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM `terria_v1_local`.`item_images`')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO `terria_v1_local`.`item_images`')));
  assert.ok(statements.some((sql) => sql.includes('UPDATE `terria_v1_local`.`items` i')));
  assert.ok(statements.some((sql) => sql.includes('SET `image` = NULL')));
  assert.ok(statements.every((sql) => !sql.includes('DELETE FROM `terria_v1_local`.`items`')));
});
