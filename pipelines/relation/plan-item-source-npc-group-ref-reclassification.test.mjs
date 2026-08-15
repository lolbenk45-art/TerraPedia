import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildNpcGroupRefReclassificationPlan,
  classifyNpcGroupSource,
  parseNpcGroupRefReclassificationArgs,
  runNpcGroupRefReclassification
} from './plan-item-source-npc-group-ref-reclassification.mjs';

function source(overrides = {}) {
  return {
    id: 1,
    item_id: 1,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: null,
    source_ref_name: 'Mimics',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql({ sources }) {
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
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length / 3 }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseNpcGroupRefReclassificationArgs requires confirmation and bulk guard for apply', () => {
  assert.throws(
    () => parseNpcGroupRefReclassificationArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseNpcGroupRefReclassificationArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
});

test('classifyNpcGroupSource maps reviewed ambiguous NPC family labels', () => {
  assert.deepEqual(classifyNpcGroupSource('Mimics', 'drop'), { sourceRefType: 'npc_group', reason: 'ambiguous_npc_family_or_group' });
  assert.deepEqual(classifyNpcGroupSource('Zombie', 'drop'), { sourceRefType: 'npc_group', reason: 'ambiguous_npc_family_or_group' });
  assert.deepEqual(classifyNpcGroupSource('The Twins', 'drop'), { sourceRefType: 'npc_group', reason: 'ambiguous_npc_family_or_group' });
  assert.equal(classifyNpcGroupSource('Forest tree', 'drop'), null);
  assert.equal(classifyNpcGroupSource('Demolitionist and Skeleton Merchant for', 'shop'), null);
});

test('buildNpcGroupRefReclassificationPlan only updates active unresolved NPC drop rows', () => {
  const plan = buildNpcGroupRefReclassificationPlan({
    sourceRows: [
      source({ id: 1, source_ref_name: 'Mimics' }),
      source({ id: 2, source_ref_name: 'Zombie' }),
      source({ id: 3, source_ref_name: 'Forest tree' }),
      source({ id: 4, source_ref_name: 'Mimics', source_ref_id: 85 })
    ]
  });

  assert.deepEqual(plan.updates.map((row) => [row.id, row.newSourceRefType, row.reason]), [
    [1, 'npc_group', 'ambiguous_npc_family_or_group'],
    [2, 'npc_group', 'ambiguous_npc_family_or_group']
  ]);
  assert.equal(plan.summary.rowsToUpdate, 2);
  assert.equal(plan.summary.validationErrors, 0);
});

test('runNpcGroupRefReclassification dry-run does not update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-group-dry-'));
  const mysql = createMockMysql({ sources: [source({ id: 1, source_ref_name: 'Mimics' })] });

  const report = await runNpcGroupRefReclassification({
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

test('runNpcGroupRefReclassification apply updates only source_ref_type and source_ref_id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-group-apply-'));
  const mysql = createMockMysql({ sources: [source({ id: 1, source_ref_name: 'Mimics' })] });

  const report = await runNpcGroupRefReclassification({
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
