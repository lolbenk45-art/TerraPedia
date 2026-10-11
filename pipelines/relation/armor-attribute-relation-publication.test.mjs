import test from 'node:test';
import assert from 'node:assert/strict';

import { comparableArmorAttributeRelationRow } from './armor-attribute-relation-publication.mjs';

test('readback comparison treats database defaults and DECIMAL strings as proposal values', () => {
  const proposalRow = {
    record_key: 'attribute-row',
    item_id: 954,
    confidence: 1,
    raw_json: '{"schemaVersion":"test"}',
  };
  const databaseRow = {
    ...proposalRow,
    confidence: '1.0000',
    status: 1,
    deleted: 0,
  };

  assert.deepEqual(
    comparableArmorAttributeRelationRow(proposalRow),
    comparableArmorAttributeRelationRow(databaseRow),
  );
});
