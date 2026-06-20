import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNodeTestArgs, PLAN_A_IDEMPOTENCY_TEST_FILES } from './verify-ingest-idempotency.mjs';

test('buildNodeTestArgs includes the Plan A idempotency regression suite', () => {
  const args = buildNodeTestArgs();

  assert.deepEqual(args.slice(0, 2), ['--test', '--test-reporter=spec']);
  for (const file of [
    'scripts/data/lib/base-domain-row-reconcile.test.mjs',
    'scripts/data/backfill/base-domain-manual-idempotency.test.mjs',
    'scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs',
    'scripts/data/import/import-standardized-to-db.test.mjs',
    'scripts/data/sync/sync-standardized-entities-to-db.test.mjs',
  ]) {
    assert.equal(args.includes(file), true, file);
  }
  assert.equal(PLAN_A_IDEMPOTENCY_TEST_FILES.length > 10, true);
});
