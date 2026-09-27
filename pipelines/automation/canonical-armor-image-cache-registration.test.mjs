import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildCanonicalOperationExecutionManifest, assertCanonicalOperationExecutionManifestContract } from './canonical-operation-execution-manifest.mjs';
import { resolveCanonicalOperationTechnicalInput } from './build-canonical-cutover-authorization.mjs';
import { CANONICAL_CUTOVER_OPERATION_IDS, CANONICAL_OPERATION_ENTRYPOINTS } from './canonical-operation-catalog.mjs';
const operationId = 'canonical-armor-image-cache';
const repoRoot = path.resolve(import.meta.dirname, '../..');

test('Armor cache operation binds private frozen source bytes and unique output paths without DB ownership', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/workflow/run-armor-image-cache.mjs');
  assert.throws(() => buildCanonicalOperationExecutionManifest({ repoRoot, operationId }), /label/);
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'cache-01' });
  assert.equal(manifest.databaseWrites, false); assert.equal(manifest.networkAccess, true);
  assert.deepEqual(manifest.inputPaths, [`reports/authorization/canonical/${operationId}.cache-01.proposal.json`]);
  assert.deepEqual(manifest.ownershipKeys, ['managed_objects.armor_source_images']);
  assert.ok(manifest.outputPaths.includes(`reports/authorization/canonical/${operationId}.cache-01.prepared.json`));
  assert.ok(manifest.outputPaths.includes(`reports/authorization/canonical/${operationId}.cache-01.result.json`));
  assert.ok(manifest.codeBundleEntries.some(x => x.path === 'pipelines/workflow/armor-image-cache.mjs'));
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest });
  const forged = structuredClone(manifest); forged.inputPaths = ['data/standardized/items.standardized.json'];
  assert.throws(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest: forged }), /contract|drift|canonical/);
});

test('Armor cache resume manifest binds retained failed result as a second immutable input', () => {
  const resumePath = `reports/authorization/canonical/${operationId}.cache-old.result.json`;
  const manifest = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'cache-resume-01', armorImageCacheResumeResultPath: resumePath });
  assert.deepEqual(manifest.inputPaths, [`reports/authorization/canonical/${operationId}.cache-resume-01.proposal.json`, resumePath]);
  assert.equal(manifest.armorImageCacheResumeResultPath, resumePath);
  assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest });
});

test('cache authorization refuses missing manifest or non-private proposal', () => {
  assert.throws(() => resolveCanonicalOperationTechnicalInput({ repoRoot, operationId }), /manifest/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-cache-registration-'));
  try {
    const template = buildCanonicalOperationExecutionManifest({ repoRoot, operationId, resultLabel: 'cache-02' });
    for (const entry of template.codeBundleEntries) { const dest = path.join(root, entry.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(repoRoot, entry.path), dest); }
    const manifest = buildCanonicalOperationExecutionManifest({ repoRoot: root, operationId, resultLabel: 'cache-02' });
    const dest = path.join(root, manifest.inputPaths[0]); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, '{}\n', { mode: 0o600 });
    const read = () => resolveCanonicalOperationTechnicalInput({ repoRoot: root, operationId, executionManifest: manifest });
    assert.deepEqual(read().dataEntries[0].bytes, Buffer.from('{}\n'));
    fs.chmodSync(dest, 0o644); assert.throws(read, /private|permission/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
