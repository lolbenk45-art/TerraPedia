import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildTorchZombieSourceRepairPlan,
  parseTorchZombieSourceRepairArgs,
  runTorchZombieSourceRepair
} from './apply-torch-zombie-source-repair.mjs';

function sourceRow(overrides = {}) {
  return {
    id: 198599,
    item_id: 8,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_id: -55,
    source_ref_name: 'Zombie',
    quantity_min: 5,
    quantity_max: 20,
    quantity_text: '5–20',
    chance_value: null,
    chance_text: '100%',
    conditions: null,
    notes: null,
    source_provider: 'wiki_gg',
    source_page: 'Torches',
    source_revision_timestamp: '2026-05-22T20:22:49.000Z',
    sort_order: 12,
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql() {
  const calls = [];
  let nextInsertId = 200001;
  const sourceRows = [
    sourceRow(),
    sourceRow({ id: 192158, source_ref_id: 591, source_ref_name: 'Zombie', source_page: 'https://terraria.wiki.gg/wiki/Zombie', source_revision_timestamp: null }),
    sourceRow({ id: 192159, source_ref_id: 590, source_ref_name: 'Zombie', source_page: 'https://terraria.wiki.gg/wiki/Zombie', source_revision_timestamp: null })
  ];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/FROM `?item_acquisition_sources`?/.test(sql) && /WHERE `?id`? IN/.test(sql)) {
        return [sourceRows.filter((row) => params.includes(row.id))];
      }
      if (/FROM `?item_acquisition_sources`?/.test(sql) && /source_ref_id/.test(sql) && /LIMIT 1/.test(sql)) {
        return [[]];
      }
      if (/FROM `?items`?/.test(sql)) return [[{ id: params[0] }]];
      if (/FROM `?npcs`?/.test(sql)) return [[{ id: params[0] }]];
      if (/UPDATE `?item_acquisition_sources`?/.test(sql) && /WHERE `?id`? IN/.test(sql)) return [{ affectedRows: params.length }];
      if (/UPDATE `?item_acquisition_sources`?/.test(sql)) return [{ affectedRows: 1 }];
      if (/INSERT INTO `?item_acquisition_sources`?/.test(sql)) return [{ insertId: nextInsertId++, affectedRows: 1 }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseTorchZombieSourceRepairArgs requires confirmation for apply', () => {
  assert.throws(
    () => parseTorchZombieSourceRepairArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  const parsed = parseTorchZombieSourceRepairArgs(['--apply=true', '--confirm-local-compat=true']);
  assert.equal(parsed.apply, true);
});

test('buildTorchZombieSourceRepairPlan targets wrong reviewed row and legacy duplicate rows', () => {
  const plan = buildTorchZombieSourceRepairPlan([
    sourceRow(),
    sourceRow({ id: 192158, source_ref_id: 591, source_ref_name: 'Zombie', source_page: 'https://terraria.wiki.gg/wiki/Zombie', source_revision_timestamp: null }),
    sourceRow({ id: 192159, source_ref_id: 590, source_ref_name: 'Zombie', source_page: 'https://terraria.wiki.gg/wiki/Zombie', source_revision_timestamp: null })
  ]);

  assert.equal(plan.validationErrors.length, 0);
  assert.equal(plan.updateWrongReviewedRow.id, 198599);
  assert.equal(plan.updateWrongReviewedRow.target.sourceRefName, 'Armed Torch Zombie');
  assert.equal(plan.insertRows[0].sourceRefName, 'Torch Zombie');
  assert.deepEqual(plan.softDeleteIds, [192158, 192159]);
});

test('runTorchZombieSourceRepair dry-run does not mutate and writes backup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'torch-zombie-repair-dry-'));
  const mysql = createMockMysql();

  const report = await runTorchZombieSourceRepair({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.toInsert, 1);
  assert.equal(report.summary.toSoftDelete, 2);
  assert.equal(mysql.connection.calls.some((call) => String(call[1]).startsWith('UPDATE')), false);
  assert.ok(fs.existsSync(report.backupPath));
});

test('runTorchZombieSourceRepair applies update insert and soft delete with rollback sql', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'torch-zombie-repair-apply-'));
  const mysql = createMockMysql();

  const report = await runTorchZombieSourceRepair({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.updated, 1);
  assert.equal(report.summary.inserted, 1);
  assert.equal(report.summary.softDeleted, 2);
  assert.deepEqual(report.insertedIds, [200001]);
  assert.match(report.rollbackSql, /UPDATE `item_acquisition_sources` SET `status` = 0, `deleted` = 1 WHERE `id` IN \(200001\);/);
  assert.match(report.rollbackSql, /WHEN 198599 THEN -55/);
});
