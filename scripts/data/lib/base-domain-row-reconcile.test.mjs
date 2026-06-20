import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRowSnapshot,
  rowsEqual,
  reconcileChildRows,
} from './base-domain-row-reconcile.mjs';

test('rowsEqual treats null and empty string as different row values', () => {
  assert.equal(rowsEqual({ name: null }, { name: '' }), false);
});

test('rowsEqual compares JSON values by parsed structure instead of key order', () => {
  assert.equal(
    rowsEqual(
      { raw_json: '{"a":1,"b":{"c":2,"d":[3,4]}}' },
      { raw_json: '{"b":{"d":[3,4],"c":2},"a":1}' },
      { jsonColumns: ['raw_json'] }
    ),
    true
  );
});

test('rowsEqual treats numeric strings and numbers as equal only for numeric columns', () => {
  assert.equal(rowsEqual({ damage: '12.50' }, { damage: 12.5 }, { numericColumns: ['damage'] }), true);
  assert.equal(rowsEqual({ internal_name: '12' }, { internal_name: 12 }), false);
});

test('buildRowSnapshot includes only requested columns and normalizes configured JSON columns', () => {
  assert.deepEqual(
    buildRowSnapshot(
      { id: 1, raw_json: '{"b":2,"a":1}', updated_at: 'ignored' },
      ['raw_json', 'missing'],
      { jsonColumns: ['raw_json'] }
    ),
    {
      raw_json: { a: 1, b: 2 },
      missing: null,
    }
  );
});

test('reconcileChildRows returns add, update, remove, and noop child row sets', () => {
  const result = reconcileChildRows({
    existingRows: [
      { id: 10, item_id: 100, sort_order: 1, quantity: '1' },
      { id: 11, item_id: 101, sort_order: 2, quantity: '2' },
      { id: 12, item_id: 102, sort_order: 3, quantity: '3' },
    ],
    targetRows: [
      { item_id: 100, sort_order: 1, quantity: 1 },
      { item_id: 101, sort_order: 2, quantity: 5 },
      { item_id: 103, sort_order: 4, quantity: 1 },
    ],
    keyColumns: ['item_id', 'sort_order'],
    compareColumns: ['quantity'],
    numericColumns: ['quantity'],
  });

  assert.deepEqual(result.add.map((entry) => entry.target), [
    { item_id: 103, sort_order: 4, quantity: 1 },
  ]);
  assert.deepEqual(result.update.map((entry) => ({ existingId: entry.existing.id, target: entry.target })), [
    { existingId: 11, target: { item_id: 101, sort_order: 2, quantity: 5 } },
  ]);
  assert.deepEqual(result.remove.map((entry) => entry.existing.id), [12]);
  assert.deepEqual(result.noop.map((entry) => entry.existing.id), [10]);
});
