import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  assertCanonicalOperationExecutionManifestContract,
  buildCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const operationId = 'canonical-armor-ingestion';
const HASH = (char) => `sha256:${char.repeat(64)}`;
const intentBinding = {
  schemaVersion: 'armor-canonical-operation-binding/v1',
  operationId,
  resultLabel: 'retry-01',
  intentPath: 'reports/authorization/canonical/canonical-armor-ingestion.retry-01.intent.json',
  intentFileSha256: HASH('a'),
  fullChainSha256: HASH('b'),
  serverFingerprint: HASH('c'),
  policySetHash: HASH('d'),
  runId: 'armor-run-01',
  fenceToken: 'armor-fence-01',
  fenceCommit: { generation: 1, marker: 'armor-commit-01' },
};

test('Armor full-chain ingestion is a governed catalog operation with an exact labeled intent path', () => {
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/relation/run-armor-canonical-ingestion.mjs');
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-09-26',
    resultLabel: 'retry-01',
    armorCanonicalIntentBinding: intentBinding,
  });
  assert.deepEqual(manifest.command, [
    'node',
    'pipelines/relation/run-armor-canonical-ingestion.mjs',
    '--operation-id=canonical-armor-ingestion',
    '--result-label=retry-01',
    '--intent=reports/authorization/canonical/canonical-armor-ingestion.retry-01.intent.json',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-armor-ingestion.retry-01.intent.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'reports/authorization/canonical/canonical-armor-ingestion.retry-01.result.json',
    'reports/authorization/canonical/canonical-armor-ingestion.retry-01.journal.json',
  ]);
  assert.deepEqual(manifest.ownershipKeys, [
    'local.source_dataset_landings.armor_sets_raw',
    'local.source_dataset_landings.armor_set_images_raw',
    'maint.maint_armor_sets',
    'maint.maint_armor_set_images',
    'relation.relation_armor_sets',
    'relation.relation_armor_set_items',
    'relation.relation_armor_set_images',
    'relation.projection_armor_sets',
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.armorCanonicalIntent, intentBinding);
  assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({ repoRoot, operationId, manifest }));
});

test('Armor scheduler bridge names the composite adapter and pins its runtime contract', () => {
  const registrySource = fs.readFileSync(
    path.join(repoRoot, 'services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java'),
    'utf8',
  );
  assert.match(registrySource, /pipelines\/automation\/run-armor-automatic-operation\.mjs/);
  assert.match(registrySource, /canonical-armor-ingestion/);
  assert.doesNotMatch(
    registrySource,
    /domain-source-armor-sets[\s\S]{0,1500}pipelines\/automation\/run-base-domain-automatic-operation\.mjs/,
  );
  for (const requiredPath of [
    'pipelines/automation/run-armor-automatic-operation.mjs',
    'pipelines/automation/armor-automatic-dispatch-binding.mjs',
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, requiredPath)), `${requiredPath} must be present in the scheduler bundle`);
  }
});
