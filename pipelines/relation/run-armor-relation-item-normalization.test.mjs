import test from 'node:test';
import assert from 'node:assert/strict';

test('normalization runner binds a normalized result label to its artifacts', async () => {
  const { buildArmorRelationItemNormalizationPaths } = await import('./run-armor-relation-item-normalization.mjs');
  assert.deepEqual(buildArmorRelationItemNormalizationPaths('repair-01'), {
    proposalPath: 'reports/authorization/canonical/canonical-armor-relation-item-normalization.repair-01.proposal.json',
    preparedPath: 'reports/authorization/canonical/canonical-armor-relation-item-normalization.repair-01.prepared.json',
    resultPath: 'reports/authorization/canonical/canonical-armor-relation-item-normalization.repair-01.result.json',
  });
  assert.throws(() => buildArmorRelationItemNormalizationPaths('../escape'), /label|normalized/i);
});
