import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  buildCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';

test('missing-row insert is a distinct formal operation with an attempt-scoped manifest', () => {
  const operationId = 'canonical-item-image-projection-missing-row-insert';
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], []);
  assert.equal(
    CANONICAL_OPERATION_ENTRYPOINTS[operationId],
    'scripts/data/relation/apply-item-image-projection-missing-row-insert.mjs',
  );
  const attemptRoot = `reports/authorization/canonical/item-image-projection-missing-row-insert/${'a'.repeat(64)}`;
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId,
    itemImageProjectionMissingRowInsertAttemptRoot: attemptRoot,
  });
  assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
  assert.deepEqual(manifest.outputPaths, [`${attemptRoot}/result.json`]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
});
