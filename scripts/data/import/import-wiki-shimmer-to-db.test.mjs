import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { importShimmerItemTransforms } from './import-wiki-shimmer-to-db.mjs';

test('shimmer importer resolves mysql2 through the repository module loader', () => {
  const source = fs.readFileSync(new URL('./import-wiki-shimmer-to-db.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ loadMysqlModule \} from '\.\.\/lib\/mysql-module\.mjs'/);
  assert.match(source, /const mysql = loadMysqlModule\(\)/);
  assert.doesNotMatch(source, /createRequire|require\('mysql2\/promise'\)/);
});

test('importShimmerItemTransforms skips source scope rewrite when projection is unchanged', async () => {
  const record = shimmerItemRecord();
  const conn = createFakeConnection({
    existingRows: [existingShimmerItemRow(record)],
  });
  const stats = { created: 0, replaced: 0, skipped: 0 };

  await importShimmerItemTransforms(conn, 'SHIMMER', [record], stats, true);

  assert.equal(stats.created, 0);
  assert.equal(stats.replaced, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM shimmer_item_transforms\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO shimmer_item_transforms\b/i.test(call.sql)), false);
});

test('importShimmerItemTransforms rewrites source scope when projection changes', async () => {
  const record = shimmerItemRecord({ outputNameEn: 'Changed Torch' });
  const conn = createFakeConnection({
    existingRows: [existingShimmerItemRow(shimmerItemRecord())],
  });
  const stats = { created: 0, replaced: 0, skipped: 0 };

  await importShimmerItemTransforms(conn, 'SHIMMER', [record], stats, true);

  assert.equal(stats.created, 1);
  assert.equal(stats.replaced, 1);
  assert.equal(stats.skipped, 0);
  assert.equal(conn.calls.filter((call) => /\bDELETE FROM shimmer_item_transforms\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bINSERT INTO shimmer_item_transforms\b/i.test(call.sql)).length, 1);
});

function shimmerItemRecord(overrides = {}) {
  return {
    inputKind: 'item',
    inputNameEn: 'Torch',
    inputNameZh: '火把',
    inputInternalName: 'Torch',
    outputKind: 'item',
    outputNameEn: 'Aether Torch',
    outputNameZh: '以太火把',
    outputInternalName: 'AetherTorch',
    conditions: [],
    notes: null,
    sourcePage: '微光',
    sourceRevisionTimestamp: '2026-06-20T01:02:03Z',
    ...overrides,
  };
}

function existingShimmerItemRow(record) {
  return {
    contextCode: 'SHIMMER',
    inputKind: record.inputKind,
    inputNameEn: record.inputNameEn,
    inputNameZh: record.inputNameZh,
    inputInternalName: record.inputInternalName,
    outputKind: record.outputKind,
    outputNameEn: record.outputNameEn,
    outputNameZh: record.outputNameZh,
    outputInternalName: record.outputInternalName,
    conditionsJson: JSON.stringify(record.conditions),
    notes: record.notes,
    sourceProvider: 'wiki_zh',
    sourcePage: record.sourcePage,
    sourceRevisionTimestamp: '2026-06-20 01:02:03',
    sortOrder: 1,
    status: 1,
    deleted: 0,
  };
}

function createFakeConnection({ existingRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT\s+.+\s+FROM\s+shimmer_item_transforms\b/is.test(sql)) {
        return [existingRows];
      }
      if (/SELECT COUNT\(\*\) AS c\s+FROM\s+shimmer_item_transforms\b/is.test(sql)) {
        return [[{ c: existingRows.length }]];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}
