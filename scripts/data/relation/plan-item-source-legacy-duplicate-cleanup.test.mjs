import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLegacyDuplicateCleanupPlan,
  parseItemSourceLegacyDuplicateCleanupArgs,
  runItemSourceLegacyDuplicateCleanup
} from './plan-item-source-legacy-duplicate-cleanup.mjs';

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
    source_npc_type: 17,
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
      if (/SELECT \*/i.test(sql)) {
        assert.equal(params.some(Array.isArray), false);
        const ids = params;
        return [rows.filter((entry) => ids.includes(entry.id))];
      }
      if (/UPDATE `?item_acquisition_sources`?/i.test(sql)) {
        assert.equal(params.some(Array.isArray), false);
        const ids = params;
        return [{ affectedRows: ids.length }];
      }
      return [[]];
    }
  };
  return {
    module: { createConnection: async () => connection },
    connection
  };
}

test('parseItemSourceLegacyDuplicateCleanupArgs requires confirmation for apply', () => {
  assert.throws(
    () => parseItemSourceLegacyDuplicateCleanupArgs(['--apply=true']),
    /requires --confirm-local-compat=true/
  );

  const parsed = parseItemSourceLegacyDuplicateCleanupArgs([
    '--item-ids=8,965',
    '--apply=true',
    '--confirm-local-compat=true'
  ]);
  assert.equal(parsed.apply, true);
  assert.deepEqual(parsed.itemIds, [8, 965]);
});

test('buildLegacyDuplicateCleanupPlan selects exact and canonical NPC duplicates only', () => {
  const rows = [
    row({ id: 192157, source_ref_id: 17, source_ref_name: 'Merchant', source_npc_type: 17 }),
    row({ id: 198600, source_ref_id: 17, source_ref_name: 'Merchant', source_npc_type: 17, source_page: 'Torches' }),
    row({ id: 192522, item_id: 932, item_name: 'Bone Wand', source_type: 'drop', source_ref_id: 31, source_ref_name: 'Angry Bones', source_npc_type: 31 }),
    row({ id: 198517, item_id: 932, item_name: 'Bone Wand', source_type: 'drop', source_ref_id: -14, source_ref_name: 'Angry Bones', source_npc_type: 31, source_page: 'Block-placing wands' }),
    row({ id: 192158, source_type: 'drop', source_ref_id: 591, source_ref_name: 'Zombie', source_npc_type: 591 }),
    row({ id: 198599, source_type: 'drop', source_ref_id: -55, source_ref_name: 'Zombie', source_npc_type: 223, source_page: 'Torches' }),
    row({ id: 197323, item_id: 832, source_type: 'resource', source_ref_type: 'biome_wikitext', source_ref_id: null, source_ref_name: 'From Chests' }),
    row({ id: 198528, item_id: 832, source_type: 'drop', source_ref_type: 'world', source_ref_id: null, source_ref_name: 'Forest tree', source_page: 'Block-placing wands' })
  ];

  const plan = buildLegacyDuplicateCleanupPlan(rows, {
    reviewedRowMinId: 198517,
    reviewedSourcePages: ['Torches', 'Block-placing wands']
  });

  assert.deepEqual(plan.rowsToSoftDelete.map((entry) => entry.id), [192157, 192522]);
  assert.deepEqual(plan.rowsToSoftDelete.map((entry) => entry.coverageReason), ['exact_ref_id', 'canonical_npc_type']);
  assert.deepEqual(plan.unsafeOverlaps.map((entry) => entry.id), [192158]);
});

test('runItemSourceLegacyDuplicateCleanup dry-run writes a report without updating rows', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-legacy-cleanup-dry-'));
  const rows = [
    row({ id: 192157 }),
    row({ id: 198600, source_page: 'Torches' })
  ];
  const mysql = createMockMysql(rows);

  const report = await runItemSourceLegacyDuplicateCleanup({
    itemIds: [8],
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

test('runItemSourceLegacyDuplicateCleanup apply soft-deletes explicit planned ids and reports rollback sql', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-legacy-cleanup-apply-'));
  const rows = [
    row({ id: 192157 }),
    row({ id: 198600, source_page: 'Torches' })
  ];
  const mysql = createMockMysql(rows);

  const report = await runItemSourceLegacyDuplicateCleanup({
    itemIds: [8],
    backupDir: path.join(root, 'backup'),
    apply: true,
    confirmLocalCompat: true
  }, {
    mysqlModule: mysql.module,
    now: new Date('2026-06-11T00:00:00.000Z')
  });

  assert.equal(report.summary.softDeleted, 1);
  assert.match(report.rollbackSql, /UPDATE `item_acquisition_sources` SET\s+`status` = CASE `id` WHEN 192157 THEN 1 END/);
  const updateCall = mysql.connection.calls.find((call) => String(call[1]).startsWith('UPDATE `item_acquisition_sources`'));
  assert.ok(updateCall);
  assert.match(updateCall[1], /WHERE `id` IN \(\?\)/);
  assert.deepEqual(updateCall[2], [192157]);
});
