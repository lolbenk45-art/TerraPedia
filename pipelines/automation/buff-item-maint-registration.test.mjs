import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';
import { resolveCanonicalOperationTechnicalInput } from './build-canonical-cutover-authorization.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const operationId = 'canonical-buff-item-maint-insert';
const binding = {
  schemaVersion: 'buff-item-maint-operation-binding/v1', runId: 'buff-items-test-01',
  contractHash: `sha256:${'a'.repeat(64)}`,
  sourceIds: [6148, 6149, 6155, 6161, 6164, 6173],
  fenceTokens: { landing: 'fence:test-landing-01', maint: 'fence:test-maint-01' },
};

test('registers a distinct Item dependency operation with frozen source inputs and recovery outputs', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId), 'six-Item canonical registration is missing');
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/maint/run-buff-item-maint-insert.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'test-01', buffItemMaintInsertBinding: binding });
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.ownershipKeys, [
    'local.source_dataset_landings.items_raw.buff_item_dependency_insert',
    'maint.maint_items.buff_item_dependency_insert',
  ]);
  assert.deepEqual(manifest.buffItemMaintInsert.sourceIds, binding.sourceIds);
  assert.deepEqual(manifest.buffItemMaintInsert.fenceTokens, binding.fenceTokens);
  assert.equal(manifest.inputPaths.length, 6);
  assert.ok(manifest.inputPaths.includes('.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/page-001.json'));
  assert.ok(manifest.inputPaths.includes('reports/authorization/canonical/canonical-buff-item-maint-insert.test-01.proposal.json'));
  assert.ok(manifest.outputPaths.some(file => file.endsWith('.readback.json')));
  assert.ok(manifest.outputPaths.some(file => file.endsWith('.journal.materialized.json')));
  assert.ok(manifest.codeBundleEntries.some(entry => entry.path.endsWith('buff-item-maint-insert-executor.mjs')));
  assertCanonicalOperationExecutionManifestContract({ manifest, repoRoot, operationId });
});

test('rejects missing binding, wrong source IDs, and shared fence tokens', () => {
  for (const mutate of [() => null, row => ({ ...row, sourceIds: [...row.sourceIds, 1] }),
    row => ({ ...row, fenceTokens: { landing: row.fenceTokens.landing, maint: row.fenceTokens.landing } })]) {
    assert.throws(() => buildCanonicalOperationExecutionManifest({ repoRoot, operationId,
      resultLabel: 'test-01', buffItemMaintInsertBinding: mutate(binding) }), /Item.*binding|source.*scope|fence/i);
  }
});

test('exact source/proposal bytes are required by the registered technical bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-item-registration-'));
  try {
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'test-01', buffItemMaintInsertBinding: binding });
    for (const entry of manifest.codeBundleEntries) {
      fs.mkdirSync(path.dirname(path.join(root, entry.path)), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, entry.path), path.join(root, entry.path));
    }
    for (const file of manifest.inputPaths) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), '{}', { mode: 0o600 });
    }
    const before = resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest });
    assert.deepEqual(before.dataEntries.map(entry => entry.path), manifest.inputPaths);
    fs.writeFileSync(path.join(root, manifest.inputPaths[3]), '{"changed":true}', { mode: 0o600 });
    const after = resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest });
    assert.notDeepEqual(before.dataEntries[3].bytes, after.dataEntries[3].bytes);
    fs.unlinkSync(path.join(root, manifest.inputPaths[3]));
    assert.throws(() => resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest }), /missing|ENOENT|exist/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
