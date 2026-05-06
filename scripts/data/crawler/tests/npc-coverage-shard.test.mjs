import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcCoverageShard } from '../src/coverage/build-npc-coverage-shard.mjs';

test('buildNpcCoverageShard filters by priority and sorts by variant count descending before applying limit', () => {
  const result = buildNpcCoverageShard({
    coverageAuditPayload: {
      eligibleBatchTargets: [
        { pageTitle: 'Merchant', priority: 'p0_town', variantCount: 1, standardizedRecords: [{ id: 17 }] },
        { pageTitle: 'Zombie', priority: 'p1_enemy', variantCount: 36, standardizedRecords: new Array(36).fill({ id: 1 }) },
        { pageTitle: 'Skeleton', priority: 'p1_enemy', variantCount: 19, standardizedRecords: new Array(19).fill({ id: 2 }) },
        { pageTitle: 'Hornet', priority: 'p1_enemy', variantCount: 18, standardizedRecords: new Array(18).fill({ id: 3 }) }
      ]
    },
    priority: 'p1_enemy',
    limit: 2
  });

  assert.equal(result.summary.inputTargets, 3);
  assert.equal(result.summary.selectedTargets, 2);
  assert.equal(result.summary.standardizedRowsCovered, 55);
  assert.deepEqual(
    result.eligibleBatchTargets.map((row) => row.pageTitle),
    ['Zombie', 'Skeleton']
  );
});
