import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPrimaryDb,
  resolveImportOptions,
  runBuffImportWithConnection,
} from './import-buffs-to-db.mjs';

test('resolveImportOptions defaults import-buffs-to-db to dry-run mode', () => {
  assert.equal(resolveImportOptions([]).dryRun, true);
});

test('resolveImportOptions lets explicit apply disable dry-run', () => {
  assert.equal(resolveImportOptions(['--apply=true']).dryRun, false);
});

test('import-buffs dry-run rolls back instead of committing transaction writes', async () => {
  const conn = createFakeConnection();

  await runBuffImportWithConnection(conn, {
    dryRun: true,
    buffs: [],
    sourceItems: [],
  });

  assert.deepEqual(conn.transactionCalls, ['beginTransaction', 'rollback']);
  assert.equal(conn.transactionCalls.includes('commit'), false);
});

test('import-buffs dry-run does not run schema DDL', async () => {
  const conn = createFakeConnection();

  await runBuffImportWithConnection(conn, {
    dryRun: true,
    buffs: [],
    sourceItems: [],
  });

  assert.equal(conn.ddlQueries.length, 0);
});

test('import-buffs apply may run schema DDL before writes', async () => {
  const conn = createFakeConnection();

  await runBuffImportWithConnection(conn, {
    dryRun: false,
    buffs: [],
    sourceItems: [],
  });

  assert.ok(conn.ddlQueries.some((sql) => /CREATE TABLE IF NOT EXISTS `buffs`/i.test(sql)));
});

test('import-buffs apply commits transaction writes', async () => {
  const conn = createFakeConnection();

  await runBuffImportWithConnection(conn, {
    dryRun: false,
    buffs: [],
    sourceItems: [],
  });

  assert.deepEqual(conn.transactionCalls, ['beginTransaction', 'commit']);
});

test('assertPrimaryDb blocks non-local import-buffs apply writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', false, false));
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', true, false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true, true));
});

test('import-buffs apply skips unchanged buff_source_items relations', async () => {
  const conn = createFakeConnection({
    existingBuff: { id: 10, source_id: 1, internal_name: 'WellFed' },
    items: [{ id: 20, internal_name: 'Apple', name: 'Apple' }],
    buffSourceItems: [
      {
        id: 30,
        buff_id: 10,
        source_item_id: 100,
        source_item_internal_name: 'Apple',
        source_item_name: 'Apple',
        item_id: 20,
        buff_time: 18000,
        sort_order: 0,
      },
    ],
  });

  const summary = await runBuffImportWithConnection(conn, {
    dryRun: false,
    buffs: [buffRecord()],
    sourceItems: [{ id: 100, internalName: 'Apple', name: 'Apple' }],
  });

  assert.equal(summary.buffSourceItems.inserted, 0);
  assert.equal(summary.buffSourceItems.skipped, 1);
  assert.equal(conn.executeCalls.some((call) => /\bDELETE FROM buff_source_items\b/i.test(call.sql)), false);
  assert.equal(conn.executeCalls.some((call) => /\bINSERT INTO buff_source_items\b/i.test(call.sql)), false);
});

test('import-buffs apply updates changed buff_source_items rows without deleting the whole set', async () => {
  const conn = createFakeConnection({
    existingBuff: { id: 10, source_id: 1, internal_name: 'WellFed' },
    items: [{ id: 20, internal_name: 'Apple', name: 'Apple' }],
    buffSourceItems: [
      {
        id: 30,
        buff_id: 10,
        source_item_id: 100,
        source_item_internal_name: 'Apple',
        source_item_name: 'Apple',
        item_id: 20,
        buff_time: 12000,
        sort_order: 0,
      },
    ],
  });

  const summary = await runBuffImportWithConnection(conn, {
    dryRun: false,
    buffs: [buffRecord()],
    sourceItems: [{ id: 100, internalName: 'Apple', name: 'Apple' }],
  });

  assert.equal(summary.buffSourceItems.updated, 1);
  assert.equal(summary.buffSourceItems.inserted, 0);
  assert.equal(summary.buffSourceItems.removed, 0);
  assert.equal(conn.executeCalls.some((call) => /\bUPDATE buff_source_items\b/i.test(call.sql)), true);
  assert.equal(conn.executeCalls.some((call) => /\bDELETE FROM buff_source_items WHERE buff_id\b/i.test(call.sql)), false);
});

function buffRecord() {
  return {
    id: 1,
    internalName: 'WellFed',
    englishName: 'Well Fed',
    localized: { zh: { name: '吃得好' }, en: { tooltip: 'Minor improvements' } },
    sourceItems: [{ itemId: 100, buffTime: 18000 }],
  };
}

function createFakeConnection({ existingBuff = null, items = [], buffSourceItems = [] } = {}) {
  const transactionCalls = [];
  const ddlQueries = [];
  const executeCalls = [];
  return {
    config: { database: 'terria_v1_local' },
    transactionCalls,
    ddlQueries,
    executeCalls,
    async query(sql) {
      if (/^\s*(CREATE|ALTER)\s+/i.test(sql)) ddlQueries.push(sql);
      if (/SHOW COLUMNS FROM `buffs`/i.test(sql)) {
        return [[
          { Field: 'source_id' },
          { Field: 'internal_name' },
          { Field: 'english_name' },
          { Field: 'name_zh' },
          { Field: 'source_item_count' },
          { Field: 'status' },
          { Field: 'deleted' },
        ]];
      }
      if (/SHOW COLUMNS FROM `buffs` LIKE/i.test(sql)) return [[]];
      if (/SELECT id, internal_name, name FROM items/i.test(sql)) return [items];
      if (/SELECT id, code\s+FROM category/i.test(sql)) return [[]];
      return [[]];
    },
    async execute(sql, params = []) {
      executeCalls.push({ sql, params });
      if (/SELECT id FROM buffs WHERE source_id/i.test(sql)) return [[existingBuff].filter(Boolean)];
      if (/SELECT id FROM buffs WHERE internal_name/i.test(sql)) return [[existingBuff].filter(Boolean)];
      if (/FROM\s+buff_source_items\b/i.test(sql)) return [buffSourceItems];
      if (/INSERT INTO buffs/i.test(sql)) return [{ insertId: existingBuff?.id ?? 10, affectedRows: 1 }];
      return [[]];
    },
    async beginTransaction() {
      transactionCalls.push('beginTransaction');
    },
    async commit() {
      transactionCalls.push('commit');
    },
    async rollback() {
      transactionCalls.push('rollback');
    },
  };
}
