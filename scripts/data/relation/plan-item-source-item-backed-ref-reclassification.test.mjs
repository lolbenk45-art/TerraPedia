import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemBackedRefReclassificationPlan,
  classifyItemBackedSource,
  parseItemBackedRefReclassificationArgs,
  runItemBackedRefReclassification
} from './plan-item-source-item-backed-ref-reclassification.mjs';

function source(overrides = {}) {
  return {
    id: 1,
    item_id: 391,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: null,
    source_ref_name: 'Gold Chest',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function item(overrides = {}) {
  return {
    id: 306,
    name: 'Gold Chest',
    internal_name: 'GoldChest',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql({ sources, items }) {
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/SELECT \* FROM `?item_acquisition_sources`? WHERE `?id`? IN/i.test(sql)) return [sources.filter((row) => params.includes(row.id))];
      if (/FROM `?item_acquisition_sources`?/i.test(sql)) return [sources];
      if (/FROM `?items`?/i.test(sql)) return [items];
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length / 4 }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseItemBackedRefReclassificationArgs requires confirmation and bulk guard for apply', () => {
  assert.throws(
    () => parseItemBackedRefReclassificationArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseItemBackedRefReclassificationArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
});

test('classifyItemBackedSource maps names to item-backed source contracts', () => {
  assert.deepEqual(classifyItemBackedSource('Gold Chest'), { sourceType: 'container', sourceRefType: 'container' });
  assert.deepEqual(classifyItemBackedSource('Azure Crate'), { sourceType: 'crate', sourceRefType: 'crate' });
  assert.deepEqual(classifyItemBackedSource('Treasure Bag (Moon Lord)'), { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag' });
  assert.deepEqual(classifyItemBackedSource('Goodie Bag'), { sourceType: 'container', sourceRefType: 'container' });
  assert.deepEqual(classifyItemBackedSource('Can Of Worms'), { sourceType: 'container', sourceRefType: 'container' });
  assert.deepEqual(classifyItemBackedSource('Pigronata'), { sourceType: 'container', sourceRefType: 'container' });
});

test('buildItemBackedRefReclassificationPlan resolves exact and stripped item names', () => {
  const plan = buildItemBackedRefReclassificationPlan({
    sourceRows: [
      source({ id: 1, source_ref_name: 'Gold Chest' }),
      source({ id: 2, source_ref_name: 'Gold Chest (Dungeon) (page does not exist)' }),
      source({ id: 3, source_ref_name: 'Zombie' })
    ],
    itemRows: [
      item({ id: 306, name: 'Gold Chest', internal_name: 'GoldChest' })
    ]
  });

  assert.deepEqual(plan.updates.map((row) => [row.id, row.newSourceRefType, row.newSourceRefId]), [
    [1, 'container', 306],
    [2, 'container', 306]
  ]);
  assert.equal(plan.blocked.length, 1);
});

test('runItemBackedRefReclassification dry-run does not update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-backed-dry-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1, source_ref_name: 'Gold Chest' })],
    items: [item({ id: 306, name: 'Gold Chest' })]
  });

  const report = await runItemBackedRefReclassification({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.rowsToUpdate, 1);
  assert.equal(report.summary.updatedRows, 0);
  assert.equal(mysql.connection.calls.some((call) => String(call[1]).startsWith('UPDATE')), false);
});

test('runItemBackedRefReclassification apply updates only source contract fields', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-backed-apply-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1, source_ref_name: 'Gold Chest' })],
    items: [item({ id: 306, name: 'Gold Chest' })]
  });

  const report = await runItemBackedRefReclassification({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true,
    allowBulk: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.updatedRows, 1);
  assert.match(report.rollbackSql, /`source_ref_type` = CASE `id` WHEN 1 THEN 'npc' END/);
});
