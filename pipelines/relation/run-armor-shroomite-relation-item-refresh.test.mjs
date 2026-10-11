import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID,
  buildArmorShroomiteRelationItemRefreshPaths,
} from './run-armor-shroomite-relation-item-refresh.mjs';

test('runner binds normalized result labels to proposal, prepared, and result artifacts', () => {
  const paths = buildArmorShroomiteRelationItemRefreshPaths('repair-01');
  assert.deepEqual(paths, {
    proposalPath: `reports/authorization/canonical/${ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID}.repair-01.proposal.json`,
    preparedPath: `reports/authorization/canonical/${ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID}.repair-01.prepared.json`,
    resultPath: `reports/authorization/canonical/${ARMOR_SHROOMITE_RELATION_ITEM_REFRESH_OPERATION_ID}.repair-01.result.json`,
  });
  assert.throws(() => buildArmorShroomiteRelationItemRefreshPaths('../escape'), /label|normalized/i);
  assert.throws(() => buildArmorShroomiteRelationItemRefreshPaths(''), /label|normalized/i);
});

test('runner rejects an apply request without an authorization context before opening MySQL', async () => {
  const { applyArmorShroomiteRelationItemRefresh } = await import('./run-armor-shroomite-relation-item-refresh.mjs');
  let opened = false;
  await assert.rejects(() => applyArmorShroomiteRelationItemRefresh({
    repoRoot: process.cwd(),
    resultLabel: 'missing-auth',
    env: {},
    mysqlModule: { createConnection: async () => { opened = true; throw new Error('must not open'); } },
  }), /authorization|context|packet|decision/i);
  assert.equal(opened, false);
});
