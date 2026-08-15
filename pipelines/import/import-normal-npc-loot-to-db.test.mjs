import test from 'node:test';
import assert from 'node:assert/strict';

import { syncNormalNpcLootPlans } from './import-normal-npc-loot-to-db.mjs';

test('syncNormalNpcLootPlans skips broad delete when managed npc loot projection is unchanged', async () => {
  const plans = [
    {
      npc: { id: 7 },
      rows: [normalLootRow()],
    },
  ];
  const conn = createFakeConnection({ existingRows: [{ npcId: 7, ...normalLootRow() }] });
  const summary = {
    replacedLootRows: 0,
    insertedLootRows: 0,
    skippedLootRows: 0,
    skippedManagedScope: false,
  };

  await syncNormalNpcLootPlans(conn, plans, summary, { dryRun: false });

  assert.equal(summary.skippedManagedScope, true);
  assert.equal(summary.skippedLootRows, 1);
  assert.equal(summary.replacedLootRows, 0);
  assert.equal(summary.insertedLootRows, 0);
  assert.equal(conn.calls.some((call) => /^\s*DELETE\s+nle\b/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO npc_loot_entries\b/i.test(call.sql)), false);
});

test('syncNormalNpcLootPlans rewrites managed npc loot scope when projection changes', async () => {
  const plans = [
    {
      npc: { id: 7 },
      rows: [{ ...normalLootRow(), chanceText: '50%', chanceValue: 0.5 }],
    },
  ];
  const conn = createFakeConnection({ existingRows: [{ npcId: 7, ...normalLootRow() }] });
  const summary = {
    replacedLootRows: 0,
    insertedLootRows: 0,
    skippedLootRows: 0,
    skippedManagedScope: false,
  };

  await syncNormalNpcLootPlans(conn, plans, summary, { dryRun: false });

  assert.equal(summary.skippedManagedScope, false);
  assert.equal(summary.replacedLootRows, 1);
  assert.equal(summary.insertedLootRows, 1);
  assert.equal(conn.calls.filter((call) => /^\s*DELETE\s+nle\b/i.test(call.sql)).length, 1);
  assert.equal(conn.calls.filter((call) => /\bINSERT INTO npc_loot_entries\b/i.test(call.sql)).length, 1);
});

function normalLootRow() {
  return {
    itemId: 20,
    sourceItemId: null,
    dropSourceKind: 'npc_drop',
    quantityMin: 1,
    quantityMax: 1,
    quantityText: null,
    chanceValue: 0.25,
    chanceText: '25%',
    conditions: null,
    notes: null,
    sortOrder: 1,
  };
}

function createFakeConnection({ existingRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+npc_loot_entries\s+nle\b/i.test(sql) && /\bORDER BY\b/i.test(sql)) {
        return [existingRows];
      }
      if (/COUNT\(\*\)\s+AS total/i.test(sql)) {
        return [[{ total: existingRows.length }]];
      }
      return [[]];
    },
    async execute(sql, params = []) {
      calls.push({ sql, params });
      return [{ affectedRows: 1, insertId: 200 }];
    },
  };
}
