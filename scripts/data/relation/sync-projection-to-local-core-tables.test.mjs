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

test('buildInsertProjectionSql only copies columns shared by local and projection tables', () => {
  const sql = buildInsertProjectionSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    localTable: 'items',
    projectionTable: 'projection_items',
    columns: ['id', 'name', 'internal_name', 'created_at']
  });

  assert.match(sql, /INSERT INTO `terria_v1_local`\.`items` \(`id`, `name`, `internal_name`, `created_at`\)/);
  assert.match(sql, /SELECT `id`, `name`, `internal_name`, `created_at` FROM `terria_v1_relation`\.`projection_items`/);
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

test('runProjectionToLocalCoreSync apply backs up and replaces only the four core local tables', async () => {
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

  for (const table of ['items', 'npcs', 'projectiles', 'buffs']) {
    assert.ok(statements.some((sql) => sql.includes(`CREATE TABLE \`terria_v1_local\`.\`${table}_relation_backup_20260426120000\` LIKE \`terria_v1_local\`.\`${table}\``)));
    assert.ok(statements.some((sql) => sql.includes(`INSERT INTO \`terria_v1_local\`.\`${table}_relation_backup_20260426120000\` SELECT * FROM \`terria_v1_local\`.\`${table}\``)));
    assert.ok(statements.some((sql) => sql.includes(`DELETE FROM \`terria_v1_local\`.\`${table}\``)));
  }
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_items`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_npcs`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_projectiles`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_buffs`')));
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
  assert.ok(statements.every((sql) => !sql.includes('`buffs_relation_backup_20260426120000`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_npcs`')));
  assert.ok(statements.some((sql) => sql.includes('FROM `terria_v1_relation`.`projection_projectiles`')));
  assert.ok(statements.every((sql) => !sql.includes('FROM `terria_v1_relation`.`projection_items`')));
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
