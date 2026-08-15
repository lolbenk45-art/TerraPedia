import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSmokeSummary } from './local-compat-smoke-check.mjs';

test('buildSmokeSummary reports row parity and field blockers by domain', () => {
  const summary = buildSmokeSummary({
    domains: [
      {
        domain: 'npcs',
        localRowCount: 762,
        compatRowCount: 762,
        missingCount: 0,
        extraCount: 0,
        blockingFields: [],
      },
      {
        domain: 'items',
        localRowCount: 6134,
        compatRowCount: 6146,
        missingCount: 3,
        extraCount: 10,
        blockingFields: [],
      },
    ],
  });

  assert.equal(summary.switchableDomains.length, 1);
  assert.equal(summary.switchableDomains[0], 'npcs');
  assert.equal(summary.blockedDomains.length, 1);
  assert.equal(summary.blockedDomains[0], 'items');
});
