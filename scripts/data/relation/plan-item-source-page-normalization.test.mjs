import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemSourcePageNormalizationPlan,
  normalizeWikiSourcePage,
  parseItemSourcePageNormalizationArgs,
  runItemSourcePageNormalization
} from './plan-item-source-page-normalization.mjs';

function sourceRow(overrides = {}) {
  return {
    id: 1,
    item_id: 50,
    source_type: 'shop',
    source_ref_type: 'npc',
    source_ref_id: 123,
    source_ref_name: 'Bound Mechanic',
    quantity_text: null,
    chance_text: null,
    conditions: null,
    source_page: 'https://terraria.wiki.gg/wiki/Mechanic',
    status: 1,
    deleted: 0,
    ...overrides
  };
}

function createMockMysql(rows) {
  const calls = [];
  const connection = {
    calls,
    async beginTransaction() { calls.push(['beginTransaction']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute(sql, params = []) {
      calls.push(['execute', sql, params]);
      if (/SELECT \* FROM `?item_acquisition_sources`? WHERE `?id`? IN/i.test(sql)) return [rows.filter((row) => params.includes(row.id))];
      if (/FROM `?item_acquisition_sources`?/i.test(sql)) return [rows];
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length / 2 }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('normalizeWikiSourcePage converts wiki URLs to title text without changing identity names', () => {
  assert.equal(normalizeWikiSourcePage('https://terraria.wiki.gg/wiki/Tavernkeep'), 'Tavernkeep');
  assert.equal(normalizeWikiSourcePage('https://terraria.wiki.gg/wiki/Unconscious_Man'), 'Unconscious Man');
  assert.equal(normalizeWikiSourcePage('https://terraria.wiki.gg/wiki/Party_Girl'), 'Party Girl');
  assert.equal(normalizeWikiSourcePage('https://terraria.wiki.gg/wiki/Mimics'), 'Mimics');
  assert.equal(normalizeWikiSourcePage('Torch'), 'Torch');
});

test('parseItemSourcePageNormalizationArgs requires local confirmation for apply', () => {
  assert.throws(
    () => parseItemSourcePageNormalizationArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseItemSourcePageNormalizationArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
});

test('buildItemSourcePageNormalizationPlan updates only source_page and reports duplicate prediction', () => {
  const plan = buildItemSourcePageNormalizationPlan([
    sourceRow({ id: 1, source_page: 'https://terraria.wiki.gg/wiki/Mechanic' }),
    sourceRow({ id: 2, source_page: 'https://terraria.wiki.gg/wiki/Party_Girl', source_ref_name: 'Party Girl' }),
    sourceRow({ id: 3, source_page: 'Torch' })
  ]);

  assert.equal(plan.summary.inputRows, 3);
  assert.equal(plan.summary.rowsToUpdate, 2);
  assert.equal(plan.summary.identityDiffCount, 0);
  assert.equal(plan.updates[0].newSourcePage, 'Mechanic');
  assert.deepEqual(plan.updates.map((row) => row.identityDiff), [false, false]);
});

test('runItemSourcePageNormalization dry-run writes backup/report without updating', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-page-dry-'));
  const mysql = createMockMysql([
    sourceRow({ id: 1, source_page: 'https://terraria.wiki.gg/wiki/Mechanic' })
  ]);

  const report = await runItemSourcePageNormalization({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.rowsToUpdate, 1);
  assert.equal(report.summary.updatedRows, 0);
  assert.equal(mysql.connection.calls.some((call) => String(call[1]).startsWith('UPDATE')), false);
  assert.ok(fs.existsSync(report.backupPath));
});

test('runItemSourcePageNormalization apply updates source_page by explicit id', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-page-apply-'));
  const mysql = createMockMysql([
    sourceRow({ id: 1, source_page: 'https://terraria.wiki.gg/wiki/Mechanic' }),
    sourceRow({ id: 2, source_page: 'https://terraria.wiki.gg/wiki/Party_Girl' })
  ]);

  const report = await runItemSourcePageNormalization({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true,
    allowBulk: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.updatedRows, 2);
  assert.ok(report.rollbackSql.includes("WHEN 1 THEN 'https://terraria.wiki.gg/wiki/Mechanic'"));
});
