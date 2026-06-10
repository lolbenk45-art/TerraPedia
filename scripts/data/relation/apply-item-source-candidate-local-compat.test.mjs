import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalCompatRows,
  parseApplyItemSourceCandidateLocalCompatArgs,
  runItemSourceCandidateLocalCompatApply
} from './apply-item-source-candidate-local-compat.mjs';

function samplePlan() {
  return {
    generatedAt: '2026-06-10T00:00:00.000Z',
    readOnly: true,
    mode: 'candidate_import_plan',
    summary: { eligibleCandidates: 1, plannedSourceRows: 2 },
    eligibleCandidates: [{
      itemInternalName: 'MagicMirror',
      itemName: 'Magic Mirror',
      itemResolution: { status: 'resolved', id: 50, internalName: 'MagicMirror', name: 'Magic Mirror' },
      pageTitle: 'Magic Mirrors',
      classification: 'high_confidence',
      plannedSources: [
        {
          sourceType: 'container',
          sourceRefType: 'container',
          sourceRefName: 'Gold Chest',
          quantityText: '1',
          chanceText: '1/6 (16.67%)',
          conditions: null,
          notes: null,
          sourcePage: 'Magic Mirrors',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          sortOrder: 0,
          resolvedRef: { status: 'resolved', id: 306, internalName: 'GoldChest', name: 'Gold Chest' }
        },
        {
          sourceType: 'worldgen',
          sourceRefType: 'world',
          sourceRefName: 'Magic Mirrors worldgen',
          quantityText: null,
          chanceText: null,
          conditions: 'found in Chests',
          notes: null,
          sourcePage: 'Magic Mirrors',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          sortOrder: 1,
          resolvedRef: null
        }
      ]
    }]
  };
}

function createMockMysql({ duplicateIds = [] } = {}) {
  const calls = [];
  const insertedIds = [];
  let nextInsertId = 9000;
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/FROM `?items`?/i.test(sql)) return [[{ id: params[0] }]];
      if (/FROM `?npcs`?/i.test(sql)) return [[{ id: params[0] }]];
      if (/FROM `?item_acquisition_sources`?/i.test(sql) && /^SELECT id/i.test(sql.trim())) {
        return [duplicateIds.length ? duplicateIds.map((id) => ({ id })) : []];
      }
      if (/INSERT INTO `?item_acquisition_sources`?/i.test(sql)) {
        const insertId = nextInsertId++;
        insertedIds.push(insertId);
        return [{ insertId, affectedRows: 1 }];
      }
      if (/SELECT \*/i.test(sql)) return [[]];
      if (/COUNT\(\*\)/i.test(sql)) return [[{ total: 0 }]];
      return [[]];
    },
    async query(sql, params = []) {
      calls.push(['query', sql, params]);
      return this.execute(sql, params);
    }
  };
  return {
    insertedIds,
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseApplyItemSourceCandidateLocalCompatArgs requires confirmation for apply', () => {
  assert.throws(
    () => parseApplyItemSourceCandidateLocalCompatArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  const parsed = parseApplyItemSourceCandidateLocalCompatArgs(['--apply=true', '--confirm-local-compat=true', '--sample=MagicMirror']);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.sample, 'MagicMirror');
});

test('buildLocalCompatRows maps candidate plan rows to local compat rows', () => {
  const result = buildLocalCompatRows(samplePlan(), { sample: 'MagicMirror' });
  assert.equal(result.rows.length, 2);
  assert.equal(result.blocked.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.itemId, row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName, row.quantityMin, row.quantityMax]),
    [
      [50, 'container', 'container', 306, 'Gold Chest', 1, 1],
      [50, 'worldgen', 'world', null, 'Magic Mirrors worldgen', null, null]
    ]
  );
});

test('buildLocalCompatRows maps boss refs as npc-backed boss source rows', () => {
  const plan = samplePlan();
  plan.eligibleCandidates = [{
    itemInternalName: 'BeeHat',
    itemName: 'Bee Hat',
    itemResolution: { status: 'resolved', id: 2108, internalName: 'BeeHat', name: 'Bee Hat' },
    pageTitle: 'Bee set',
    classification: 'high_confidence',
    plannedSources: [{
      sourceType: 'drop',
      sourceRefType: 'boss',
      sourceRefName: 'Queen Bee',
      quantityText: '1',
      chanceText: '11.11%',
      conditions: null,
      notes: null,
      sourcePage: 'Bee set',
      sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
      sortOrder: 0,
      resolvedRef: { status: 'resolved_boss_ref', id: 222, internalName: 'QueenBee', name: 'Queen Bee' }
    }]
  }];

  const result = buildLocalCompatRows(plan, { sample: 'BeeHat' });

  assert.equal(result.blocked.length, 0);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(
    result.rows.map((row) => [row.itemId, row.sourceType, row.sourceRefType, row.sourceRefId, row.sourceRefName]),
    [[2108, 'drop', 'boss', 222, 'Queen Bee']]
  );
});

test('runItemSourceCandidateLocalCompatApply dry-run validates and does not insert', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-dry-'));
  const inputPath = path.join(root, 'plan.json');
  fs.writeFileSync(inputPath, JSON.stringify(samplePlan()));
  const mysql = createMockMysql();

  const report = await runItemSourceCandidateLocalCompatApply({
    inputPath,
    apply: false,
    sample: 'MagicMirror',
    backupDir: path.join(root, 'backup')
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-10T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.plannedRows, 2);
  assert.equal(report.summary.toInsert, 2);
  assert.equal(mysql.insertedIds.length, 0);
});

test('runItemSourceCandidateLocalCompatApply inserts missing rows and reports rollback ids', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-local-apply-'));
  const inputPath = path.join(root, 'plan.json');
  fs.writeFileSync(inputPath, JSON.stringify(samplePlan()));
  const mysql = createMockMysql();

  const report = await runItemSourceCandidateLocalCompatApply({
    inputPath,
    apply: true,
    confirmLocalCompat: true,
    sample: 'MagicMirror',
    backupDir: path.join(root, 'backup')
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-10T00:00:00.000Z')
  });

  assert.equal(report.apply, true);
  assert.equal(report.summary.inserted, 2);
  assert.deepEqual(report.insertedIds, [9000, 9001]);
  assert.match(report.rollbackSql, /DELETE FROM `item_acquisition_sources` WHERE `id` IN \(9000, 9001\);/);
  assert.ok(fs.existsSync(report.backupPath));
});
