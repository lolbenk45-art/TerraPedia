import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const operationId = 'canonical-armor-missing-attribute-source';

test('missing-attribute source is registered with a private proposal and owner decision gate', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/maint/run-armor-missing-attribute-source.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'retry-01' });
  assert.deepEqual(manifest.command, ['node', 'pipelines/maint/run-armor-missing-attribute-source.mjs',
    `--operation-id=${operationId}`, '--result-label=retry-01', '--apply=true']);
  assert.deepEqual(manifest.inputPaths, [`reports/authorization/canonical/${operationId}.retry-01.proposal.json`]);
  assert.deepEqual(manifest.outputPaths, [`reports/authorization/canonical/${operationId}.retry-01.prepared.json`,
    `reports/authorization/canonical/${operationId}.retry-01.result.json`]);
  assert.deepEqual(manifest.ownershipKeys, [
    'maint.source_dataset_landings.armor_attributes_raw',
    'maint.maint_armor_attribute_rows.missing_attribute_owners',
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.equal(manifest.missingAttributeSource.executionReady, false);
  assert.equal(manifest.missingAttributeSource.ownerDecisionPath,
    `reports/authorization/canonical/${operationId}.retry-01.owner-decision.json`);
  assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest }));
});
