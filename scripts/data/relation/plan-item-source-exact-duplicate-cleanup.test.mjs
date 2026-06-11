import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildExactDuplicateCleanupPlan,
  parseItemSourceExactDuplicateCleanupArgs,
  runItemSourceExactDuplicateCleanup
} from './plan-item-source-exact-duplicate-cleanup.mjs';

function row(overrides = {}) {
  return {
    id: 100,
    item_id: 8,
    item_name: 'Torch',
    item_internal_name: 'Torch',
    source_type: 'shop',
    source_ref_type: 'npc',
    source_ref_id: 17,
    source_ref_name: 'Merchant',
    quantity_text: null,
    chance_text: null,
    conditions: null,
    notes: null,
    source_page: 'https://terraria.wiki.gg/wiki/Merchant',
    source_revision_timestamp: null,
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
      if (/SELECT s\.\*/i.test(sql)) return [rows];
      if (/SELECT \*/i.test(sql)) return [rows.filter((entry) => params.includes(entry.id))];
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) return [{ affectedRows: params.length }];
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseItemSourceExactDuplicateCleanupArgs requires confirmation and allow bulk for apply', () => {
  assert.throws(
    () => parseItemSourceExactDuplicateCleanupArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );
  assert.throws(
    () => parseItemSourceExactDuplicateCleanupArgs(['--apply=true', '--confirm-local-compat=true']),
    /requires --allow-bulk=true/
  );
  const parsed = parseItemSourceExactDuplicateCleanupArgs(['--apply=true', '--confirm-local-compat=true', '--allow-bulk=true']);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.allowBulk, true);
});

test('buildExactDuplicateCleanupPlan keeps the richer non-url row and excludes biome wikitext', () => {
  const plan = buildExactDuplicateCleanupPlan([
    row({ id: 100, notes: null, source_page: 'https://terraria.wiki.gg/wiki/Merchant' }),
    row({ id: 101, notes: 'Sold by the Merchant.', source_page: 'Torch', source_revision_timestamp: '2026-05-01T00:00:00Z' }),
    row({ id: 200, source_ref_type: 'biome_wikitext', source_ref_id: null, source_ref_name: 'From terrain', source_page: 'Forest' }),
    row({ id: 201, source_ref_type: 'biome_wikitext', source_ref_id: null, source_ref_name: 'From terrain', source_page: 'Jungle' }),
    row({ id: 300, source_ref_id: 20, source_ref_name: 'Dryad', conditions: 'night' }),
    row({ id: 301, source_ref_id: 20, source_ref_name: 'Dryad', conditions: 'day' })
  ]);

  assert.equal(plan.summary.duplicateGroups, 1);
  assert.deepEqual(plan.rowsToSoftDelete.map((entry) => entry.id), [100]);
  assert.equal(plan.groups[0].keepId, 101);
  assert.deepEqual(plan.skippedGroups.map((entry) => entry.reason), ['biome_wikitext']);
});

test('runItemSourceExactDuplicateCleanup dry-run writes report without updating', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-exact-dry-'));
  const mysql = createMockMysql([
    row({ id: 100 }),
    row({ id: 101, source_page: 'Torch', notes: 'Sold by the Merchant.' })
  ]);

  const report = await runItemSourceExactDuplicateCleanup({
    outputPath: path.join(root, 'report.json'),
    backupDir: path.join(root, 'backup'),
    apply: false
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.apply, false);
  assert.equal(report.summary.rowsToSoftDelete, 1);
  assert.equal(mysql.connection.calls.some((call) => String(call[1]).startsWith('UPDATE')), false);
  assert.ok(fs.existsSync(report.backupPath));
});

test('runItemSourceExactDuplicateCleanup apply soft-deletes duplicate ids and reports rollback sql', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-exact-apply-'));
  const mysql = createMockMysql([
    row({ id: 100 }),
    row({ id: 101, source_page: 'Torch', notes: 'Sold by the Merchant.' })
  ]);

  const report = await runItemSourceExactDuplicateCleanup({
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true,
    allowBulk: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.softDeleted, 1);
  assert.match(report.rollbackSql, /UPDATE `item_acquisition_sources` SET `status` = CASE `id` WHEN 100 THEN 1 END/);
});
