import assert from 'node:assert/strict';
import test from 'node:test';

import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';

test('base entity restoration is a separate five-row governed database operation', () => {
  const operationId = 'canonical-item-base-entity-restoration';
  const attemptRoot = `reports/authorization/canonical/item-canonical-base-entity-restoration/${'a'.repeat(64)}`;
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'scripts/data/relation/apply-item-canonical-base-entity-restoration.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: process.cwd(), operationId, itemCanonicalBaseEntityRestorationAttemptRoot: attemptRoot });
  assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
  assert.deepEqual(manifest.outputPaths, [`${attemptRoot}/result.json`]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
});
