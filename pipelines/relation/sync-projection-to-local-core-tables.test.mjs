import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInsertProjectionSql,
  parseArgs,
  runProjectionToLocalCoreSync
} from './sync-projection-to-local-core-tables.mjs';

test('parseArgs defaults to dry-run local core sync', () => {
  const actual = parseArgs([]);

  assert.deepEqual(actual, {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    domains: null,
    dateTag: null,
    backupSuffix: null
  });
});

test('parseArgs accepts a domain filter for partial local core sync', () => {
  const actual = parseArgs(['--domains=npcs,projectiles']);

  assert.deepEqual(actual, {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    domains: ['npcs', 'projectiles'],
    dateTag: null,
    backupSuffix: null
  });
});

test('buildInsertProjectionSql supports explicit local to projection column mappings', () => {
  const sql = buildInsertProjectionSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    localTable: 'buffs',
    projectionTable: 'projection_buffs',
    columnMappings: [
      ['id', 'id'],
      ['internal_name', 'internal_name'],
      ['image_cached_url', 'image']
    ]
  });

  assert.match(sql, /INSERT INTO `terria_v1_local`\.`buffs` \(`id`, `internal_name`, `image_cached_url`\)/);
  assert.match(sql, /SELECT `id`, `internal_name`, `image` FROM `terria_v1_relation`\.`projection_buffs`/);
});

test('runProjectionToLocalCoreSync dry-run writes a report without mutating local tables', async () => {
  const mutations = [];
  let reportPayload = null;

  const result = await runProjectionToLocalCoreSync(
    {
      apply: false,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-26',
      backupSuffix: '20260426120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          mutations.push(sql);
          return [{ affectedRows: 0 }];
        }
      }),
      listColumns: async (_connection, _database, table) => {
        if (table === 'projection_items') return ['id', 'relation_record_key', 'name', 'internal_name'];
        return ['id', 'name', 'internal_name'];
      },
      countRows: async (_connection, _database, table) => (table.includes('items') ? 2 : 0),
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/projection-to-local-core-sync-2026-04-26.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.domains.items.columnsToSync.length, 3);
  assert.equal(result.reportPath, 'reports/relation/projection-to-local-core-sync-2026-04-26.json');
  assert.equal(reportPayload.summary.totalProjectionRows, 2);
  assert.ok(mutations.every((sql) => !/DELETE FROM|INSERT INTO|CREATE TABLE/i.test(sql)));
});

test('runProjectionToLocalCoreSync apply backs up core tables and only replaces unmanaged domains', async () => {
  const statements = [];

  await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-26',
      backupSuffix: '20260426120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async () => ['id', 'source_id', 'name', 'internal_name', 'status', 'deleted'],
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-26.json'
    }
  );

  for (const table of ['items', 'npcs', 'boss_groups', 'projectiles', 'buffs']) {
    assert.ok(statements.some((sql) => sql.includes(`CREATE TABLE \`terria_v1_local\`.\`${table}_relation_backup_20260426120000\` LIKE \`terria_v1_local\`.\`${table}\``)));
    assert.ok(statements.some((sql) => sql.includes(`INSERT INTO \`terria_v1_local\`.\`${table}_relation_backup_20260426120000\` SELECT * FROM \`terria_v1_local\`.\`${table}\``)));
  }
  for (const table of ['projectiles']) {
    assert.ok(statements.some((sql) => sql.includes(`DELETE FROM \`terria_v1_local\`.\`${table}\``)));
  }
  for (const table of ['items', 'npcs', 'boss_groups', 'buffs']) {
    assert.ok(statements.every((sql) => !sql.includes(`DELETE FROM \`terria_v1_local\`.\`${table}\``)));
  }
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_items`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_npcs`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_bosses`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_projectiles`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_buffs`')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`items`') && sql.includes('ON DUPLICATE KEY UPDATE')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npcs`') && sql.includes('ON DUPLICATE KEY UPDATE')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`boss_groups`') && sql.includes('ON DUPLICATE KEY UPDATE')));
  assert.ok(statements.every((sql) => !sql.includes('category')));
  assert.ok(statements.every((sql) => !sql.includes('recipes')));
});

test('runProjectionToLocalCoreSync apply can target only selected domains', async () => {
  const statements = [];

  await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      domains: ['npcs', 'projectiles'],
      dateTag: '2026-04-26',
      backupSuffix: '20260426120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async () => ['id', 'source_id', 'name', 'internal_name', 'image_url', 'status', 'deleted'],
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-26.json'
    }
  );

  assert.ok(statements.some((sql) => sql.includes('`npcs_relation_backup_20260426120000`')));
  assert.ok(statements.some((sql) => sql.includes('`projectiles_relation_backup_20260426120000`')));
  assert.ok(statements.every((sql) => !sql.includes('`items_relation_backup_20260426120000`')));
  assert.ok(statements.every((sql) => !sql.includes('`boss_groups_relation_backup_20260426120000`')));
  assert.ok(statements.every((sql) => !sql.includes('`buffs_relation_backup_20260426120000`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_npcs`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_projectiles`')));
  assert.ok(statements.every((sql) => !sql.includes('FROM `terria_v1_relation`.`projection_items`')));
  assert.ok(statements.every((sql) => !sql.includes('FROM `terria_v1_relation`.`projection_bosses`')));
  assert.ok(statements.every((sql) => !sql.includes('FROM `terria_v1_relation`.`projection_buffs`')));
});

test('runProjectionToLocalCoreSync syncs projectile source json columns when both sides expose them', async () => {
  const statements = [];

  const result = await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      domains: ['projectiles'],
      dateTag: '2026-04-28',
      backupSuffix: '20260428120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async () => [
        'id',
        'source_id',
        'internal_name',
        'source_items_json',
        'source_npcs_json',
        'status',
        'deleted'
      ],
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-28.json'
    }
  );

  assert.deepEqual(result.report.domains.projectiles.columnsToSync, [
    'id',
    'source_id',
    'internal_name',
    'source_items_json',
    'source_npcs_json',
    'status',
    'deleted'
  ]);
  const insertSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`projectiles`'));
  assert.match(insertSql, /`source_items_json`, `source_npcs_json`/);
  assert.match(insertSql, /SELECT `id`, `source_id`, `internal_name`, `source_items_json`, `source_npcs_json`, `status`, `deleted` FROM `terria_v1_relation`\.`projection_projectiles`/);
});

test('runProjectionToLocalCoreSync syncs item and npc relation json columns only when local columns exist', async () => {
  const statements = [];

  const result = await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      domains: ['items', 'npcs'],
      dateTag: '2026-04-29',
      backupSuffix: '20260429120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async (_connection, _database, table) => {
        if (table === 'items' || table === 'projection_items') {
          return ['id', 'internal_name', 'source_npcs_json', 'status', 'deleted'];
        }
        if (table === 'npcs') {
          return ['id', 'internal_name', 'loot_items_json', 'shop_items_json', 'status', 'deleted'];
        }
        if (table === 'projection_npcs') {
          return [
            'id',
            'internal_name',
            'loot_items_json',
            'shop_items_json',
            'source_items_json',
            'status',
            'deleted'
          ];
        }
        return [];
      },
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-29.json'
    }
  );

  assert.deepEqual(result.report.domains.items.columnsToSync, [
    'id',
    'internal_name',
    'source_npcs_json',
    'status',
    'deleted'
  ]);
  assert.deepEqual(result.report.domains.npcs.columnsToSync, [
    'id',
    'internal_name',
    'loot_items_json',
    'shop_items_json',
    'status',
    'deleted'
  ]);
  const itemInsertSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`items`'));
  const npcInsertSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npcs`'));
  assert.match(itemInsertSql, /`source_npcs_json`/);
  assert.match(npcInsertSql, /`loot_items_json`, `shop_items_json`/);
  assert.doesNotMatch(npcInsertSql, /`source_items_json`/);
});

test('runProjectionToLocalCoreSync preserves local-owned item and npc fields during apply', async () => {
  const statements = [];

  const result = await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      domains: ['items', 'npcs'],
      dateTag: '2026-04-29',
      backupSuffix: '20260429123000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async (_connection, _database, table) => {
        if (table === 'items' || table === 'projection_items') {
          return [
            'id',
            'internal_name',
            'name',
            'category_id',
            'description',
            'game_period_id',
            'game_model_id',
            'last_synced_at',
            'source_npcs_json',
            'tooltip',
            'created_at',
            'updated_at',
            'status',
            'deleted'
          ];
        }
        if (table === 'npcs' || table === 'projection_npcs') {
          return [
            'id',
            'internal_name',
            'name',
            'category_id',
            'game_period_id',
            'game_model_id',
            'boss_group_id',
            'boss_role',
            'behavior_notes',
            'banner_item_id',
            'catch_item_id',
            'loot_items_json',
            'shop_items_json',
            'source_items_json',
            'created_at',
            'updated_at',
            'status',
            'deleted'
          ];
        }
        return [];
      },
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-29.json'
    }
  );

  const itemSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`items`'));
  const npcSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npcs`'));

  assert.equal(result.report.domains.items.syncStrategy, 'upsert_preserve_local');
  assert.equal(result.report.domains.npcs.syncStrategy, 'upsert_preserve_local');
  assert.deepEqual(result.report.domains.items.skippedProtectedColumns, [
    'category_id',
    'created_at',
    'description',
    'game_model_id',
    'game_period_id',
    'last_synced_at',
    'tooltip',
    'updated_at'
  ]);
  assert.deepEqual(result.report.domains.npcs.skippedProtectedColumns, [
    'banner_item_id',
    'behavior_notes',
    'boss_group_id',
    'boss_role',
    'catch_item_id',
    'category_id',
    'created_at',
    'game_model_id',
    'game_period_id',
    'updated_at'
  ]);
  assert.ok(statements.every((sql) => !/DELETE FROM `terria_v1_local`\.`items`/i.test(sql)));
  assert.ok(statements.every((sql) => !/DELETE FROM `terria_v1_local`\.`npcs`/i.test(sql)));
  assert.match(itemSql, /ON DUPLICATE KEY UPDATE/);
  assert.match(npcSql, /ON DUPLICATE KEY UPDATE/);
  assert.match(itemSql, /`source_npcs_json`/);
  assert.match(npcSql, /`loot_items_json`, `shop_items_json`, `source_items_json`/);
  assert.doesNotMatch(itemSql, /`category_id`|`description`|`game_period_id`|`game_model_id`|`last_synced_at`|`tooltip`|`created_at`|`updated_at`/);
  assert.doesNotMatch(npcSql, /`category_id`|`game_period_id`|`game_model_id`|`boss_group_id`|`boss_role`|`behavior_notes`|`banner_item_id`|`catch_item_id`|`created_at`|`updated_at`/);
});

test('runProjectionToLocalCoreSync apply refuses to replace populated local tables from empty projection tables', async () => {
  const statements = [];

  await assert.rejects(
    runProjectionToLocalCoreSync(
      {
        apply: true,
        localDatabase: 'terria_v1_local',
        relationDatabase: 'terria_v1_relation',
        domains: ['items'],
        dateTag: '2026-04-29',
        backupSuffix: '20260429121500'
      },
      {
        executeLocal: async (fn) => fn({
          query: async (sql) => {
            statements.push(sql);
            return [{ affectedRows: 1 }];
          }
        }),
        listColumns: async () => ['id', 'internal_name', 'status', 'deleted'],
        countRows: async (_connection, _database, table) => (table === 'items' ? 6146 : 0),
        writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-04-29.json'
      }
    ),
    /Refusing to replace terria_v1_local\.items from empty terria_v1_relation\.projection_items/
  );

  assert.ok(statements.every((sql) => !/DELETE FROM|INSERT INTO `terria_v1_local`\.`items`/i.test(sql)));
});

test('runProjectionToLocalCoreSync apply preserves local-owned boss fields and maps buff image to image_cached_url', async () => {
  const statements = [];

  const result = await runProjectionToLocalCoreSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      domains: ['bosses', 'buffs'],
      dateTag: '2026-05-08',
      backupSuffix: '20260508120000'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [{ affectedRows: 1 }];
        }
      }),
      listColumns: async (_connection, _database, table) => {
        if (table === 'boss_groups' || table === 'projection_bosses') {
          return [
            'id',
            'code',
            'name_en',
            'name_zh',
            'image_url',
            'progression_order',
            'summon_method',
            'created_at',
            'updated_at',
            'status',
            'deleted'
          ];
        }
        if (table === 'buffs') {
          return [
            'id',
            'internal_name',
            'english_name',
            'name_zh',
            'image_cached_url',
            'image_original_url',
            'image_content_type',
            'image_last_verified_at',
            'source_items_json',
            'immune_npcs_json',
            'immune_npc_sample_json',
            'source_evidence_json',
            'buff_type'
          ];
        }
        if (table === 'projection_buffs') {
          return [
            'id',
            'internal_name',
            'english_name',
            'name_zh',
            'image',
            'buff_type',
            'source_items_json',
            'immune_npcs_json',
            'immune_npc_sample_json',
            'source_evidence_json'
          ];
        }
        return [];
      },
      countRows: async () => 1,
      writeReport: async () => 'reports/relation/projection-to-local-core-sync-2026-05-08.json'
    }
  );

  assert.equal(result.report.domains.bosses.syncStrategy, 'upsert_preserve_local');
  assert.deepEqual(result.report.domains.bosses.skippedProtectedColumns, ['created_at', 'summon_method', 'updated_at']);
  assert.equal(result.report.domains.buffs.syncStrategy, 'upsert_preserve_local');
  assert.deepEqual(result.report.domains.buffs.skippedProtectedColumns, [
    'immune_npc_sample_json',
    'immune_npcs_json',
    'source_evidence_json',
    'source_items_json'
  ]);
  assert.ok(result.report.domains.buffs.columnMappings.some(([localColumn, projectionColumn]) => localColumn === 'image_cached_url' && projectionColumn === 'image'));
  const bossSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`boss_groups`'));
  const buffSql = statements.find((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`buffs`'));
  assert.match(bossSql, /ON DUPLICATE KEY UPDATE/);
  assert.match(buffSql, /`image_cached_url`/);
  assert.match(buffSql, /SELECT `id`, `internal_name`, `english_name`, `name_zh`, `buff_type`, `image` FROM `terria_v1_relation`\.`projection_buffs`/);
  assert.doesNotMatch(buffSql, /`source_items_json`|`immune_npcs_json`|`immune_npc_sample_json`|`source_evidence_json`/);
});
