import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildNonNpcRefReclassificationPlan,
  classifyNonNpcSource,
  parseNonNpcRefReclassificationArgs,
  runNonNpcRefReclassification
} from './plan-item-source-non-npc-ref-reclassification.mjs';

function source(overrides = {}) {
  return {
    id: 1,
    item_id: 1,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: null,
    source_ref_name: 'Forest tree',
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

test('parseNonNpcRefReclassificationArgs requires confirmation and bulk guard for apply', () => {
  assert.throws(
    () => parseNonNpcRefReclassificationArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseNonNpcRefReclassificationArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
});

test('classifyNonNpcSource maps reviewed non-NPC sources out of NPC domain', () => {
  assert.deepEqual(classifyNonNpcSource('Forest tree', 'drop'), { sourceRefType: 'world', reason: 'tree_source' });
  assert.deepEqual(classifyNonNpcSource('Pearlwood Palm tree', 'drop'), { sourceRefType: 'world', reason: 'tree_source' });
  assert.deepEqual(classifyNonNpcSource('Giant Glowing Mushroom', 'drop'), { sourceRefType: 'world', reason: 'environment_source' });
  assert.deepEqual(classifyNonNpcSource('Crimson Heart', 'drop'), { sourceRefType: 'world', reason: 'heart_or_orb_source' });
  assert.deepEqual(classifyNonNpcSource('Shadow Orb', 'drop'), { sourceRefType: 'world', reason: 'heart_or_orb_source' });
  assert.deepEqual(classifyNonNpcSource('Celestial Pillars', 'drop'), { sourceRefType: 'world', reason: 'world_object_source' });
  assert.deepEqual(classifyNonNpcSource('seed:getfixedboi', 'shop'), { sourceRefType: 'world', reason: 'world_seed_condition_source' });
  assert.deepEqual(classifyNonNpcSource('Mechdusa', 'drop'), { sourceRefType: 'boss_group', reason: 'boss_lane_reference_source' });
  assert.equal(classifyNonNpcSource('Zombie', 'drop'), null);
});

test('buildNonNpcRefReclassificationPlan updates only active unresolved NPC rows', () => {
  const plan = buildNonNpcRefReclassificationPlan({
    sourceRows: [
      source({ id: 1, source_ref_name: 'Forest tree' }),
      source({ id: 2, source_ref_name: 'Zombie' }),
      source({ id: 3, source_ref_name: 'Crimson Heart' }),
      source({ id: 4, source_ref_type: 'unknown', source_ref_name: 'Mechdusa' }),
      source({ id: 5, source_ref_name: 'Forest tree', source_ref_id: 123 })
    ]
  });

  assert.deepEqual(plan.updates.map((row) => [row.id, row.newSourceRefType, row.reason]), [
    [1, 'world', 'tree_source'],
    [3, 'world', 'heart_or_orb_source'],
    [4, 'boss_group', 'boss_lane_reference_source']
  ]);
  assert.equal(plan.summary.rowsToUpdate, 3);
  assert.equal(plan.summary.validationErrors, 0);
});

test('runNonNpcRefReclassification dry-run does not update', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'non-npc-dry-'));
  const mysql = createMockMysql({ sources: [source({ id: 1, source_ref_name: 'Forest tree' })] });

  const report = await runNonNpcRefReclassification({
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

test('runNonNpcRefReclassification apply updates only source_ref_type and source_ref_id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'non-npc-apply-'));
  const mysql = createMockMysql({ sources: [source({ id: 1, source_ref_name: 'Forest tree' })] });

  const report = await runNonNpcRefReclassification({
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
