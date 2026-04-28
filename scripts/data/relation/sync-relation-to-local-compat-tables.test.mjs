import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRelationCompatSyncSql,
  parseArgs,
  runRelationToLocalCompatSync
} from './sync-relation-to-local-compat-tables.mjs';

test('parseArgs defaults to dry-run relation compat sync', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation',
    dateTag: null
  });
});

test('buildRelationCompatSyncSql rebuilds only owned local compatibility tables', () => {
  const sql = buildRelationCompatSyncSql({
    localDatabase: 'terria_v1_local',
    relationDatabase: 'terria_v1_relation'
  });

  assert.deepEqual(Object.keys(sql), [
    'item_acquisition_sources',
    'npc_loot_entries',
    'npc_shop_entries',
    'npc_shop_conditions'
  ]);
  assert.match(sql.item_acquisition_sources.deleteSql, /DELETE FROM `terria_v1_local`\.`item_acquisition_sources`/);
  assert.match(sql.item_acquisition_sources.insertSql, /INSERT INTO `terria_v1_local`\.`item_acquisition_sources`/);
  assert.match(sql.item_acquisition_sources.insertSql, /FROM `terria_v1_relation`\.`item_source_facts` f/);
  assert.match(sql.npc_loot_entries.insertSql, /FROM `terria_v1_relation`\.`item_npc_loot_relations` r/);
  assert.match(sql.npc_shop_entries.insertSql, /FROM `terria_v1_relation`\.`item_npc_shop_relations` r/);
  assert.match(sql.npc_shop_conditions.insertSql, /FROM `terria_v1_relation`\.`item_npc_shop_relations` r/);
  assert.match(sql.npc_loot_entries.insertSql, /SELECT\s+n\.id,\s+i\.id,\s+i\.id,/);
  assert.match(sql.npc_shop_entries.insertSql, /SELECT\s+n\.id,\s+i\.id,\s+i\.id,/);
  assert.doesNotMatch(sql.npc_loot_entries.insertSql, /\bi\.source_id\b/);
  assert.doesNotMatch(sql.npc_shop_entries.insertSql, /\bi\.source_id\b/);
  assert.match(sql.npc_shop_conditions.insertSql, /se\.price_text COLLATE utf8mb4_unicode_ci <=> r\.price_text COLLATE utf8mb4_unicode_ci/);
  assert.doesNotMatch(JSON.stringify(sql), /item_npc_shop_candidates|item_npc_loot_candidates/);
});

test('runRelationToLocalCompatSync dry-run reports row counts and samples without mutating', async () => {
  const statements = [];
  let reportPayload = null;

  const result = await runRelationToLocalCompatSync(
    {
      apply: false,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-29'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          return [[{ total: 2 }]];
        }
      }),
      sampleRows: async (_connection, tableName) => [{ tableName, id: 1 }],
      writeReport: async (payload) => {
        reportPayload = payload;
        return 'reports/relation/relation-to-local-compat-sync-2026-04-29.json';
      }
    }
  );

  assert.equal(result.report.apply, false);
  assert.equal(result.report.tables.item_acquisition_sources.plannedRows, 2);
  assert.equal(result.report.tables.npc_loot_entries.sampleRows[0].tableName, 'npc_loot_entries');
  assert.equal(reportPayload.summary.totalPlannedRows, 8);
  assert.ok(statements.every((sql) => !/DELETE FROM|INSERT INTO/i.test(sql)));
});

test('runRelationToLocalCompatSync apply deletes and rebuilds owned tables in dependency order', async () => {
  const statements = [];

  await runRelationToLocalCompatSync(
    {
      apply: true,
      localDatabase: 'terria_v1_local',
      relationDatabase: 'terria_v1_relation',
      dateTag: '2026-04-29'
    },
    {
      executeLocal: async (fn) => fn({
        query: async (sql) => {
          statements.push(sql);
          if (/SELECT COUNT\(\*\)/i.test(sql)) return [[{ total: 1 }]];
          return [{ affectedRows: 1 }];
        }
      }),
      sampleRows: async () => [],
      writeReport: async () => 'reports/relation/relation-to-local-compat-sync-2026-04-29.json'
    }
  );

  const deleteOrder = statements
    .filter((sql) => sql.startsWith('DELETE FROM `terria_v1_local`'))
    .map((sql) => sql.match(/`terria_v1_local`\.`([^`]+)`/)?.[1]);
  assert.deepEqual(deleteOrder, [
    'npc_shop_conditions',
    'npc_shop_entries',
    'npc_loot_entries',
    'item_acquisition_sources'
  ]);
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`item_acquisition_sources`')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npc_loot_entries`')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npc_shop_entries`')));
  assert.ok(statements.some((sql) => sql.startsWith('INSERT INTO `terria_v1_local`.`npc_shop_conditions`')));
});
