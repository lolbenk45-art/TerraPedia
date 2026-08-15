import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileBossLootRows } from './import-boss-loot-to-db.mjs';

test('reconcileBossLootRows skips unchanged boss loot rows without delete or insert', async () => {
  const conn = createFakeConnection({
    existingRows: [
      {
        id: 100,
        npc_id: 7,
        item_id: 20,
        source_item_id: null,
        drop_source_kind: 'direct_boss',
        quantity_min: 1,
        quantity_max: 1,
        quantity_text: null,
        chance_value: 0.25,
        chance_text: '25%',
        conditions: null,
        notes: null,
        sort_order: 1,
        status: 1,
        deleted: 0,
      },
    ],
  });

  const summary = { insertedLootRows: 0, updatedLootRows: 0, removedLootRows: 0, skippedLootRows: 0 };

  await reconcileBossLootRows(conn, 7, [
    {
      npcId: 7,
      itemId: 20,
      sourceItemId: null,
      dropSourceKind: 'direct_boss',
      quantityMin: 1,
      quantityMax: 1,
      quantityText: null,
      chanceValue: 0.25,
      chanceText: '25%',
      conditions: null,
      notes: null,
      sortOrder: 1,
    },
  ], summary);

  assert.equal(summary.insertedLootRows, 0);
  assert.equal(summary.updatedLootRows, 0);
  assert.equal(summary.removedLootRows, 0);
  assert.equal(summary.skippedLootRows, 1);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM npc_loot_entries WHERE npc_id = \?/i.test(call.sql)), false);
  assert.equal(conn.calls.some((call) => /\bINSERT INTO npc_loot_entries\b/i.test(call.sql)), false);
});

test('reconcileBossLootRows updates changed boss loot rows without deleting owner scope', async () => {
  const conn = createFakeConnection({
    existingRows: [
      {
        id: 100,
        npc_id: 7,
        item_id: 20,
        source_item_id: null,
        drop_source_kind: 'direct_boss',
        quantity_min: 1,
        quantity_max: 1,
        quantity_text: null,
        chance_value: 0.25,
        chance_text: '25%',
        conditions: null,
        notes: null,
        sort_order: 1,
        status: 1,
        deleted: 0,
      },
    ],
  });

  const summary = { insertedLootRows: 0, updatedLootRows: 0, removedLootRows: 0, skippedLootRows: 0 };

  await reconcileBossLootRows(conn, 7, [
    {
      npcId: 7,
      itemId: 20,
      sourceItemId: null,
      dropSourceKind: 'direct_boss',
      quantityMin: 1,
      quantityMax: 2,
      quantityText: '1-2',
      chanceValue: 0.25,
      chanceText: '25%',
      conditions: null,
      notes: null,
      sortOrder: 1,
    },
  ], summary);

  assert.equal(summary.insertedLootRows, 0);
  assert.equal(summary.updatedLootRows, 1);
  assert.equal(summary.removedLootRows, 0);
  assert.equal(summary.skippedLootRows, 0);
  assert.equal(conn.calls.some((call) => /\bDELETE FROM npc_loot_entries WHERE npc_id = \?/i.test(call.sql)), false);
  assert.equal(conn.calls.filter((call) => /\bUPDATE npc_loot_entries\b/i.test(call.sql)).length, 1);
});

test('reconcileBossLootRows excludes npc-drop rows from the boss-owned reconcile scope', async () => {
  const conn = createFakeConnection({
    existingRows: [
      {
        id: 100,
        npc_id: 7,
        item_id: 20,
        source_item_id: null,
        drop_source_kind: 'direct_boss',
        quantity_min: 1,
        quantity_max: 1,
        quantity_text: null,
        chance_value: 0.25,
        chance_text: '25%',
        conditions: null,
        notes: null,
        sort_order: 1,
        status: 1,
        deleted: 0,
      },
      {
        id: 101,
        npc_id: 7,
        item_id: 21,
        source_item_id: 21,
        drop_source_kind: 'npc_drop',
        quantity_min: 1,
        quantity_max: 1,
        quantity_text: '1',
        chance_value: 0.1,
        chance_text: '10%',
        conditions: null,
        notes: null,
        sort_order: 0,
        status: 1,
        deleted: 0,
      },
    ],
  });

  const summary = { insertedLootRows: 0, updatedLootRows: 0, removedLootRows: 0, skippedLootRows: 0 };

  await reconcileBossLootRows(conn, 7, [
    {
      npcId: 7,
      itemId: 20,
      sourceItemId: null,
      dropSourceKind: 'direct_boss',
      quantityMin: 1,
      quantityMax: 1,
      quantityText: null,
      chanceValue: 0.25,
      chanceText: '25%',
      conditions: null,
      notes: null,
      sortOrder: 1,
    },
  ], summary);

  assert.equal(summary.removedLootRows, 0);
  assert.equal(conn.calls.some((call) => /DELETE FROM npc_loot_entries/i.test(call.sql)), false);
  assert.match(conn.calls[0].sql, /drop_source_kind\s+IN\s*\(\s*'direct_boss'\s*,\s*'treasure_bag'\s*\)/i);
});

function createFakeConnection({ existingRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM\s+npc_loot_entries\b/i.test(sql)) {
        const rows = /drop_source_kind\s+IN\s*\(/i.test(sql)
          ? existingRows.filter((row) => ['direct_boss', 'treasure_bag'].includes(row.drop_source_kind))
          : existingRows;
        return [rows];
      }
      return [{ affectedRows: 1, insertId: 200 }];
    },
  };
}
