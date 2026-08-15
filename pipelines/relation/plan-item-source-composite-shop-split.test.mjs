import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCompositeShopSplitPlan,
  classifyCompositeShopSource,
  parseCompositeShopSplitArgs,
  runCompositeShopSplit
} from './plan-item-source-composite-shop-split.mjs';

function source(overrides = {}) {
  return {
    id: 1,
    item_id: 166,
    source_type: 'shop',
    source_ref_type: 'npc',
    source_ref_id: null,
    source_ref_name: 'Demolitionist and Skeleton Merchant for',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function npc(overrides = {}) {
  return {
    id: 38,
    name: 'Demolitionist',
    internal_name: 'Demolitionist',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql({ sources, npcs }) {
  const calls = [];
  let nextInsertId = 9000;
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/^UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: 1 }];
      if (/^INSERT INTO `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: 1, insertId: nextInsertId++ }];
      if (/SELECT \* FROM `?item_acquisition_sources`? WHERE `?id`? IN/i.test(sql)) return [sources.filter((row) => params.includes(row.id))];
      if (/FROM `?item_acquisition_sources`?/i.test(sql)) return [sources];
      if (/FROM `?npcs`?/i.test(sql)) return [npcs];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseCompositeShopSplitArgs requires confirmation and bulk guard for apply', () => {
  assert.throws(() => parseCompositeShopSplitArgs(['--apply=true']), /requires --confirm-local-compat=true/);
  assert.throws(() => parseCompositeShopSplitArgs(['--apply=true', '--confirm-local-compat=true']), /requires --allow-bulk=true/);
});

test('classifyCompositeShopSource maps reviewed composite shop names', () => {
  assert.deepEqual(classifyCompositeShopSource('Demolitionist and Skeleton Merchant for'), ['Demolitionist', 'Skeleton Merchant']);
  assert.deepEqual(classifyCompositeShopSource('Witch Doctor and Arms Dealer'), ['Witch Doctor', 'Arms Dealer']);
  assert.deepEqual(classifyCompositeShopSource('her for'), ['Party Girl']);
  assert.deepEqual(classifyCompositeShopSource('the'), ['Mechanic', 'Steampunker']);
  assert.equal(classifyCompositeShopSource('Mimics'), null);
});

test('buildCompositeShopSplitPlan resolves composite shop into update plus insert target', () => {
  const plan = buildCompositeShopSplitPlan({
    sourceRows: [
      source({ id: 1 }),
      source({ id: 2, source_ref_type: 'unknown', source_ref_name: 'her for' })
    ],
    npcRows: [
      npc({ id: 38, name: 'Demolitionist' }),
      npc({ id: 453, name: 'Skeleton Merchant' }),
      npc({ id: 208, name: 'Party Girl' })
    ]
  });

  assert.equal(plan.summary.rowsToSplit, 2);
  assert.deepEqual(plan.splits[0].updateTarget, { sourceRefName: 'Demolitionist', sourceRefId: 38 });
  assert.deepEqual(plan.splits[0].insertTargets, [{ sourceRefName: 'Skeleton Merchant', sourceRefId: 453 }]);
  assert.deepEqual(plan.splits[1].updateTarget, { sourceRefName: 'Party Girl', sourceRefId: 208 });
  assert.deepEqual(plan.splits[1].insertTargets, []);
  assert.equal(plan.summary.validationErrors, 0);
});

test('runCompositeShopSplit dry-run does not update or insert', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-shop-dry-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1 })],
    npcs: [npc({ id: 38, name: 'Demolitionist' }), npc({ id: 453, name: 'Skeleton Merchant' })]
  });

  const report = await runCompositeShopSplit({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.rowsToSplit, 1);
  assert.equal(report.summary.updatedRows, 0);
  assert.equal(report.summary.insertedRows, 0);
  assert.equal(mysql.connection.calls.some((call) => /^UPDATE|^INSERT/.test(String(call[1]))), false);
});

test('runCompositeShopSplit apply updates original row and inserts extra target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-shop-apply-'));
  const mysql = createMockMysql({
    sources: [source({ id: 1 })],
    npcs: [npc({ id: 38, name: 'Demolitionist' }), npc({ id: 453, name: 'Skeleton Merchant' })]
  });

  const report = await runCompositeShopSplit({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true,
    allowBulk: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.updatedRows, 1);
  assert.equal(report.summary.insertedRows, 1);
  assert.deepEqual(report.insertedIds, [9000]);
  assert.match(report.rollbackSql, /WHEN 1 THEN 'Demolitionist and Skeleton Merchant for'/);
  assert.match(report.rollbackSql, /UPDATE `item_acquisition_sources` SET `status` = 0, `deleted` = 1 WHERE `id` IN \(9000\)/);
});
