import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  assertCanonicalOperationExecutionManifestContract,
  buildCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const operationId = 'canonical-armor-shroomite-relation-item-refresh';

test('Shroomite relation-item refresh is registered as an exact bounded relation-only operation', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-shroomite-relation-item-refresh.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-10-06',
    resultLabel: 'repair-01',
  });
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/relation/run-armor-shroomite-relation-item-refresh.mjs',
    `--operation-id=${operationId}`,
    '--result-label=repair-01',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    `reports/authorization/canonical/${operationId}.repair-01.proposal.json`,
  ]);
  assert.deepEqual(manifest.outputPaths, [
    `reports/authorization/canonical/${operationId}.repair-01.prepared.json`,
    `reports/authorization/canonical/${operationId}.repair-01.result.json`,
  ]);
  assert.deepEqual(manifest.ownershipKeys, ['relation.relation_items.source_id.1546-1550']);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest }));
});
