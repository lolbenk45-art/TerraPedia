import test from 'node:test';
import assert from 'node:assert/strict';

import { applyArmorItemLineageRefresh, buildArmorItemLineageRefreshPaths } from './run-armor-item-lineage-refresh.mjs';

test('Iteminfo lineage paths are exact and label-bound', () => {
  assert.deepEqual(buildArmorItemLineageRefreshPaths('retry-01'), {
    proposalPath: 'reports/authorization/canonical/canonical-armor-item-lineage-refresh.retry-01.proposal.json',
    preparedPath: 'reports/authorization/canonical/canonical-armor-item-lineage-refresh.retry-01.prepared.json',
    resultPath: 'reports/authorization/canonical/canonical-armor-item-lineage-refresh.retry-01.result.json',
  });
  for (const label of [null, '', '../retry', 'Retry-01']) assert.throws(() => buildArmorItemLineageRefreshPaths(label), /label/i);
});

test('Iteminfo lineage apply cannot connect without an exact authorization packet', async () => {
  let connections = 0;
  await assert.rejects(applyArmorItemLineageRefresh({
    repoRoot: process.cwd(), resultLabel: 'no-auth', env: {},
    mysqlModule: { async createConnection() { connections += 1; } },
  }), /authorization|manifest|packet/i);
  assert.equal(connections, 0);
});
