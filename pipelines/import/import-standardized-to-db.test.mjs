import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPrimaryDb,
  resolveImportOptions,
  runStandardizedImportWithConnection,
} from './import-standardized-to-db.mjs';

test('resolveImportOptions defaults import-standardized-to-db to dry-run mode', () => {
  assert.equal(resolveImportOptions([]).dryRun, true);
});

test('resolveImportOptions lets explicit apply disable dry-run', () => {
  assert.equal(resolveImportOptions(['--apply=true']).dryRun, false);
});

test('import-standardized dry-run rolls back instead of committing transaction writes', async () => {
  const conn = createFakeConnection();

  await runStandardizedImportWithConnection(conn, {
    dryRun: true,
    datasets: emptyDatasets(),
    redisConfig: {},
  });

  assert.deepEqual(conn.transactionCalls, ['beginTransaction', 'rollback']);
  assert.equal(conn.transactionCalls.includes('commit'), false);
});

test('import-standardized dry-run does not run schema DDL', async () => {
  const conn = createFakeConnection();

  await runStandardizedImportWithConnection(conn, {
    dryRun: true,
    datasets: emptyDatasets(),
    redisConfig: {},
  });

  assert.equal(conn.ddlQueries.length, 0);
});

test('import-standardized apply may run schema DDL before writes', async () => {
  const conn = createFakeConnection();

  await runStandardizedImportWithConnection(conn, {
    dryRun: false,
    datasets: emptyDatasets(),
    redisConfig: {},
  });

  assert.ok(conn.ddlQueries.some((sql) => /ALTER TABLE item_acquisition_sources/i.test(sql)));
});

test('import-standardized apply commits transaction writes', async () => {
  const conn = createFakeConnection();

  await runStandardizedImportWithConnection(conn, {
    dryRun: false,
    datasets: emptyDatasets(),
    redisConfig: {},
  });

  assert.deepEqual(conn.transactionCalls, ['beginTransaction', 'commit']);
});

test('assertPrimaryDb blocks non-local import-standardized apply writes unless explicitly allowed', () => {
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', false, false));
  assert.throws(
    () => assertPrimaryDb('terria_v1_maint', true, false),
    /Refusing to write to non-primary database/
  );
  assert.doesNotThrow(() => assertPrimaryDb('terria_v1_maint', true, true));
});

test('import-standardized apply skips unchanged existing item rows', async () => {
  const existingItem = standardizedDbItem();
  const conn = createFakeConnection({
    categories: [{ id: 7, code: 'MATERIAL' }],
    items: [existingItem],
  });

  const report = await runStandardizedImportWithConnection(conn, {
    dryRun: false,
    datasets: {
      manifest: null,
      itemsDataset: { records: [standardizedItemRecord()] },
      relationsDataset: { records: {} },
      wikiBiomesDataset: null,
    },
    redisConfig: {},
  });

  assert.equal(report.summary.items.updated, 0);
  assert.equal(report.summary.items.skipped, 1);
  assert.equal(conn.executeCalls.some((call) => /\bUPDATE items\b/i.test(call.sql)), false);
});

test('import-standardized apply updates changed existing item rows', async () => {
  const conn = createFakeConnection({
    categories: [{ id: 7, code: 'MATERIAL' }],
    items: [standardizedDbItem({ tooltip: 'stale tooltip' })],
  });

  const report = await runStandardizedImportWithConnection(conn, {
    dryRun: false,
    datasets: {
      manifest: null,
      itemsDataset: { records: [standardizedItemRecord()] },
      relationsDataset: { records: {} },
      wikiBiomesDataset: null,
    },
    redisConfig: {},
  });

  assert.equal(report.summary.items.updated, 1);
  assert.equal(report.summary.items.skipped, 0);
  assert.equal(conn.executeCalls.some((call) => /\bUPDATE items\b/i.test(call.sql)), true);
});

function emptyDatasets() {
  return {
    manifest: null,
    itemsDataset: { records: [] },
    relationsDataset: { records: {} },
    wikiBiomesDataset: null,
  };
}

function standardizedItemRecord() {
  return {
    name: 'Wood',
    internalName: 'Wood',
    image: 'https://example.invalid/wood.png',
    categoryCode: 'MATERIAL',
    description: 'Basic material',
    stats: {
      damage: 0,
      defense: 0,
      knockback: 0,
      useTime: 10,
      width: 16,
      height: 16,
    },
    economy: {
      buy: 0,
      sell: 1,
    },
    tooltip: 'Used for crafting',
    rarityId: 1,
    gamePeriodId: 2,
    gameModelId: 3,
    stack: {
      isStackable: true,
      stackSize: 9999,
    },
    status: 1,
  };
}

function standardizedDbItem(overrides = {}) {
  return {
    id: 100,
    internal_name: 'Wood',
    name: 'Wood',
    name_zh: null,
    image: 'https://example.invalid/wood.png',
    category_id: 7,
    description: 'Basic material',
    damage: 0,
    defense: 0,
    knockback: 0,
    use_time: 10,
    width: 16,
    height: 16,
    buy: 0,
    sell: 1,
    tooltip: 'Used for crafting',
    rarity_id: 1,
    game_period_id: 2,
    game_model_id: 3,
    is_stackable: 1,
    stack_size: 9999,
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function createFakeConnection({ categories = [], items = [] } = {}) {
  const transactionCalls = [];
  const ddlQueries = [];
  const executeCalls = [];
  return {
    transactionCalls,
    ddlQueries,
    executeCalls,
    async query(sql) {
      if (/^\s*(CREATE|ALTER)\s+/i.test(sql)) ddlQueries.push(sql);
      if (/SELECT id, code FROM category/i.test(sql)) return [categories];
      if (/SELECT COALESCE\(MAX\(sort\), 0\) AS max_sort/i.test(sql)) return [[{ max_sort: 0 }]];
      if (/FROM\s+items\s+WHERE\s+deleted\s+=\s+0/i.test(sql)) return [items];
      if (/SELECT id, code FROM biomes/i.test(sql)) return [[]];
      if (/COUNT\(DISTINCT item_id\)/i.test(sql)) return [[{ item_count: 0 }]];
      if (/^UPDATE items i\s+JOIN/i.test(sql)) return [{ affectedRows: 0 }];
      if (/ROW_NUMBER\(\) OVER/i.test(sql)) return [{ affectedRows: 0 }];
      return [[]];
    },
    async execute(sql, params = []) {
      executeCalls.push({ sql, params });
      if (/INSERT INTO category/i.test(sql)) {
        const code = params[2] ?? params[1];
        const existing = categories.find((category) => category.code === code);
        return [{ insertId: existing?.id ?? 1000, affectedRows: 1 }];
      }
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
