import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { readbackArmorBusinessTables } from './run-armor-full-recrawl-canonical-isolated.mjs';

function client(rowsByTable) {
  return {
    async query(sql) {
      const table = /(?:FROM|from) `([^`]+)`/.exec(sql)?.[1];
      const rows = rowsByTable[table] ?? [];
      if (/COUNT\(\*\)/i.test(sql)) return [[{ count: rows.length }]];
      return [rows];
    },
  };
}

test('Armor isolated readback records every maintained and projected business table with stable hashes', async () => {
  const maintRows = {
    maint_armor_sets: [{ id: 1, text_key: 'ArmorSetBonus.Test', deleted: 0 }],
    maint_armor_set_images: [{ id: 2, text_key: 'ArmorSetBonus.Test', source_file_title: 'Test.png', deleted: 0 }],
  };
  const relationRows = {
    relation_armor_sets: [{ id: 3, record_key: 'set-1', deleted: 0 }],
    relation_armor_set_items: [{ id: 4, record_key: 'item-1', deleted: 0 }],
    relation_armor_set_images: [{ id: 5, record_key: 'image-1', deleted: 0 }],
    projection_armor_sets: [{ id: 6, record_key: 'projection-1', deleted: 0 }],
  };

  const result = await readbackArmorBusinessTables(client(relationRows), client(maintRows));
  const expectedTables = { ...maintRows, ...relationRows };
  for (const [table, rows] of Object.entries(expectedTables)) {
    const role = table.startsWith('maint_') ? 'maint' : 'relation';
    const key = `${role}.${table}`;
    assert.equal(result.counts[key], rows.length);
    assert.equal(result.rowHashes[key], createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
  }
});
