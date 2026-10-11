import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { resolveCanonicalOperationTechnicalInput } from './build-canonical-cutover-authorization.mjs';
import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';

const operationId = 'canonical-armor-secondary-projection';
const repoRoot = path.resolve(import.meta.dirname, '../..');
test('secondary authorization requires a manifest and binds exact private proposal bytes', () => {
  assert.throws(() => resolveCanonicalOperationTechnicalInput({ repoRoot, operationId }), /manifest/i);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-secondary-binding-'));
  try {
    const template = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'binding-01' });
    for (const entry of template.codeBundleEntries) {
      const target = path.join(root, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, entry.path), target);
    }
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: root, operationId, resultLabel: 'binding-01' });
    const target = path.join(root, manifest.inputPaths[0]);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const bytes = Buffer.from('{"scope":"frozen-selected-members"}\n');
    fs.writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
    const resolve = () => resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest });
    const input = resolve();
    assert.deepEqual(input.dataEntries.map(entry => entry.path), manifest.inputPaths);
    assert.deepEqual(input.dataEntries[0].bytes, bytes);
    fs.chmodSync(target, 0o644);
    assert.throws(resolve, /private|permission/i);
    fs.unlinkSync(target);
    assert.throws(resolve, /missing|ENOENT|ordinary/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('secondary operation owns member and verified set-effect projection partitions', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-secondary-projection.mjs');
  assert.throws(() => buildCanonicalOperationExecutionManifest({ repoRoot, operationId }), /label/i);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, artifactDate: '2026-09-26', resultLabel: 'retry-01' });
  assert.deepEqual(manifest.command, ['node', 'pipelines/relation/run-armor-secondary-projection.mjs',
    '--operation-id=canonical-armor-secondary-projection', '--result-label=retry-01', '--apply=true']);
  assert.deepEqual(manifest.inputPaths, [`reports/authorization/canonical/${operationId}.retry-01.proposal.json`]);
  assert.deepEqual(manifest.outputPaths, [`reports/authorization/canonical/${operationId}.retry-01.prepared.json`,
    `reports/authorization/canonical/${operationId}.retry-01.result.json`]);
  assert.deepEqual(manifest.ownershipKeys, ['relation.projection_item_armor_attributes.armor_members',
    'relation.projection_equipment_effect_attributes.armor_member_item_cells',
    'relation.projection_equipment_effect_attributes.armor_set_effects']);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest });
  const forged = structuredClone(manifest); forged.ownershipKeys.push('local.items');
  assert.throws(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: forged }), /ownership|contract|drift|canonical/i);
});
