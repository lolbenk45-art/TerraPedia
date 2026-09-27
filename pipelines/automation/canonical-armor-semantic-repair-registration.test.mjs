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
const operationId = 'canonical-armor-semantic-repair';

test('Armor semantic repair is a separately registered, bounded write operation', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-semantic-repair.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, artifactDate: '2026-09-27', resultLabel: 'a63-01' });
  assert.deepEqual(manifest.command, ['node', 'pipelines/relation/run-armor-semantic-repair.mjs',
    '--operation-id=canonical-armor-semantic-repair', '--result-label=a63-01', '--apply=true']);
  assert.deepEqual(manifest.inputPaths, ['reports/authorization/canonical/canonical-armor-semantic-repair.a63-01.proposal.json']);
  assert.deepEqual(manifest.outputPaths, ['reports/authorization/canonical/canonical-armor-semantic-repair.a63-01.result.json']);
  assert.deepEqual(manifest.ownershipKeys, [
    'local.source_dataset_landings.armor_attributes_raw',
    'maint.source_dataset_landings.armor_attributes_raw',
    'maint.maint_armor_attribute_rows',
    'relation.relation_armor_attribute_rows',
    'relation.relation_equipment_effect_attributes.status_deleted',
    'relation.relation_equipment_effect_attributes.insert',
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest }));
});
