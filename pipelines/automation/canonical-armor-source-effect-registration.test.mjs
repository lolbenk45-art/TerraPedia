import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';

const operationId = 'canonical-armor-source-effect-publication';
const repoRoot = path.resolve(import.meta.dirname, '../..');

test('source-effect publication is registered as a bounded write operation', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-source-effect-publication.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, artifactDate: '2026-10-06', resultLabel: 'retry-01' });
  assert.deepEqual(manifest.command, ['node', 'pipelines/relation/run-armor-source-effect-publication.mjs',
    `--operation-id=${operationId}`, '--result-label=retry-01', '--apply=true']);
  assert.deepEqual(manifest.inputPaths, [`reports/authorization/canonical/${operationId}.retry-01.proposal.json`]);
  assert.deepEqual(manifest.ownershipKeys, [
    'relation.relation_equipment_effect_attributes.set_effect_sources',
    'relation.relation_equipment_effect_attributes.armor_attribute_cell_sources',
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest });
});
