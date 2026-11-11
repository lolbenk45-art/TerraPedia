import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  assertCanonicalOperationExecutionManifestContract,
  buildCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const operationId = 'canonical-buff-npc-infliction-dedup';
const sourcePath = '.local/tmp/buff-npc-infliction-verified-20261003-v6.json';
const binding = {
  schemaVersion: 'buff-npc-infliction-dedup-operation-binding/v1',
  operationId,
  resultLabel: 'test-01',
  runId: 'buff-infliction-dedup-test-01',
  fenceToken: 'fence:test-infliction-dedup-01',
};

test('registers a dedicated exact-scope legacy inflicts retirement operation', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-buff-npc-infliction-dedup.mjs');
  assert.ok(CANONICAL_OPERATION_DATA_PATHS[operationId].includes(sourcePath));

  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    resultLabel: 'test-01',
    buffNpcInflictionDedupBinding: binding,
  });
  assert.equal(manifest.executionClass, 'formal_buff_npc_infliction_dedup');
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.ownershipKeys, ['relation.npc_buff_relations.inflicts.status_deleted']);
  assert.deepEqual(manifest.inputPaths, [
    `reports/authorization/canonical/${operationId}.test-01.proposal.json`,
    sourcePath,
  ]);
  assert.ok(manifest.outputPaths.includes(`reports/authorization/canonical/${operationId}.test-01.readback.json`));
  assert.equal(manifest.buffNpcInflictionDedup.runId, binding.runId);
  assert.equal(manifest.buffNpcInflictionDedup.fenceToken, binding.fenceToken);
  assert.ok(manifest.codeBundleEntries.some(entry => entry.path === 'pipelines/relation/buff-npc-infliction-dedup.mjs'));
  assert.ok(manifest.codeBundleEntries.some(entry => entry.path === 'pipelines/relation/relation-trace.mjs'));
  assertCanonicalOperationExecutionManifestContract({ manifest, repoRoot, operationId });
});

test('rejects missing or cross-operation inflicts-dedup runtime bindings', () => {
  for (const value of [null, { ...binding, operationId: 'canonical-buff-npc-secondary-apply' },
    { ...binding, fenceToken: '' }]) {
    assert.throws(() => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      resultLabel: 'test-01',
      buffNpcInflictionDedupBinding: value,
    }), /infliction dedup.*binding/i);
  }
});
