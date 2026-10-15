import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRelationDateValue } from './sync-maint-to-relation.mjs';

test('relation sync normalizes ISO timestamps to MySQL DATETIME values', () => {
  assert.equal(normalizeRelationDateValue('source_revision_timestamp', '2026-04-04T07:46:03.000Z'), '2026-04-04 07:46:03');
  assert.equal(normalizeRelationDateValue('landing_fetched_at', new Date('2026-10-14T05:00:00.000Z')), '2026-10-14 05:00:00');
  assert.equal(normalizeRelationDateValue('raw_json', '2026-04-04T07:46:03.000Z'), '2026-04-04T07:46:03.000Z');
});
