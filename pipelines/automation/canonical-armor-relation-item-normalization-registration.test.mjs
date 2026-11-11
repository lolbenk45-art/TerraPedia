import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { assertCanonicalOperationExecutionManifestContract, buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';

test('relation-item normalization is registered as a bounded two-row relation operation', () => {
  const operationId = 'canonical-armor-relation-item-normalization';
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-relation-item-normalization.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: path.resolve(import.meta.dirname, '../..'), operationId, artifactDate: '2026-10-07', resultLabel: 'repair-01',
  });
  assert.deepEqual(manifest.ownershipKeys, ['relation.relation_items.source_id.729,1282.defense_value']);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({ repoRoot: path.resolve(import.meta.dirname, '../..'), operationId, manifest }));
});
