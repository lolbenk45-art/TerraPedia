import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildShimmerFailureArtifact,
  buildShimmerPrivatePaths,
  scopeCounts,
  writeShimmerDependencyManifestFile,
  findActiveShimmerWriters,
  buildShimmerLocalSourceManifest,
  buildShimmerDependencyManifest,
  validateShimmerApiResponse,
} from './run-shimmer-full-recrawl-canonical-isolated.mjs';

test('Shimmer source manifest binds the fixed current generation and all six scopes', () => {
  const { sourceManifest: manifest } = buildShimmerLocalSourceManifest({ repoRoot: process.cwd() });
  assert.equal(manifest.sourceMode, 'local-offline-authorized');
  assert.equal(manifest.wikiUnchanged, false);
  assert.equal(manifest.generationId, '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761');
  assert.equal(manifest.dataBundleSha256, 'sha256:68801601cfaad72b0e3827ee5f8390037b90c306b9e73ee9547c169f9c6464bb');
  assert.deepEqual(manifest.scopeCounts, {
    worldContexts: 1,
    entitySourceSnapshots: 7,
    shimmerItemTransforms: 279,
    shimmerDecraftRules: 248,
    shimmerEntityTransforms: 121,
    shimmerNpcTransforms: 29,
  });
  assert.equal(manifest.referenceInventory.itemReferenceCount, 1034);
  assert.equal(manifest.referenceInventory.itemNameCount, 438);
  assert.equal(manifest.referenceInventory.npcReferenceCount, 180);
  assert.equal(manifest.referenceInventory.itemGroupReferences, 279);
  assert.equal(manifest.referenceInventory.noneReferences, 4);
  assert.equal(manifest.referenceInventory.npcNameCount, 72);
});

test('Shimmer private source, state, and dependency manifests are isolated by runKey', () => {
  const first = buildShimmerPrivatePaths({ runKey: 'e8p_1111111111111111' });
  const second = buildShimmerPrivatePaths({ runKey: 'e8p_2222222222222222' });
  assert.notEqual(first.sourceManifest, second.sourceManifest);
  assert.notEqual(first.sourceState, second.sourceState);
  assert.notEqual(first.dependencyManifest, second.dependencyManifest);
  assert.match(first.sourceManifest, /shimmer\.current-pin\.e8p_1111111111111111\.json$/);
});

test('Shimmer scope counts accept both raw SQL and importer-normalized readback shapes', () => {
  const expected = {
    worldContexts: 1,
    entitySourceSnapshots: 7,
    shimmerItemTransforms: 279,
    shimmerDecraftRules: 248,
    shimmerEntityTransforms: 121,
    shimmerNpcTransforms: 29,
  };
  const normalized = {
    worldContext: { id: 1, code: 'SHIMMER' },
    snapshots: Array.from({ length: 7 }, () => ({})),
    shimmerTables: {
      shimmer_item_transforms: Array.from({ length: 279 }, () => ({})),
      shimmer_decraft_rules: Array.from({ length: 248 }, () => ({})),
      shimmer_entity_transforms: Array.from({ length: 121 }, () => ({})),
      shimmer_npc_transforms: Array.from({ length: 29 }, () => ({})),
    },
  };
  assert.deepEqual(scopeCounts(normalized), expected);
});

test('Shimmer dependency manifest uses only exact returned local Item and NPC IDs', () => {
  const source = buildShimmerLocalSourceManifest({ repoRoot: process.cwd() });
  const manifest = buildShimmerDependencyManifest({
    source,
    databases: {
      local: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_local',
      maint: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_maint',
      relation: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_relation',
    },
    localItemRows: source.referenceInventory.itemNames.map((internal_name, index) => ({ id: index + 1, internal_name, name: 'source-item', name_zh: null, status: 1, deleted: 0 })),
    localNpcRows: source.referenceInventory.npcNames.map((internal_name, index) => {
      const id = new Map([['BigRainZombie', -55], ['BigPantlessSkeleton', -53], ['BigCrimslime', -25], ['Slimer2', -2]]).get(internal_name) ?? index + 1;
      return { id, source_id: id, internal_name, name: 'source-npc', name_zh: null, status: 1, deleted: 0 };
    }),
  });
  assert.equal(manifest.manifest.dependencies.length, 2);
  assert.equal(manifest.manifest.dependencies[0].target.table, 'items');
  assert.equal(manifest.manifest.dependencies[0].keyValues.length, 438);
  assert.equal(manifest.manifest.dependencies[1].target.table, 'npcs');
  assert.ok(manifest.manifest.dependencies[1].columns.includes('source_id'));
  assert.equal(manifest.manifest.dependencies[1].keyValues.length, 72);
  assert.deepEqual(
    manifest.manifest.dependencies[1].keyValues.filter(({ id }) => id < 0).map(({ id }) => id).sort((a, b) => a - b),
    [-55, -53, -25, -2],
  );
  assert.equal(manifest.resolution.missingItemNames.length, 0);
  assert.equal(manifest.resolution.missingNpcNames.length, 0);
  assert.deepEqual(manifest.resolution.signedNpcIdentities, [
    { id: -25, internalName: 'BigCrimslime' },
    { id: -53, internalName: 'BigPantlessSkeleton' },
    { id: -55, internalName: 'BigRainZombie' },
    { id: -2, internalName: 'Slimer2' },
  ]);
  assert.throws(() => buildShimmerDependencyManifest({
    source,
    databases: {
      local: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_local',
      maint: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_maint',
      relation: 'terria_v1_automation_acceptance_e8p_8deac87b8d22c5c3_relation',
    },
    localItemRows: [{ id: 1, internal_name: 'not-in-generation', name: 'wrong', name_zh: null, image: null, status: 1, deleted: 0 }],
    localNpcRows: [],
  }), /outside the exact source reference set/);
});

test('Shimmer dependency artifact records canonical identity separately from private file bytes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'shimmer-dependency-'));
  const manifestPath = path.join(directory, 'dependencies.json');
  const manifest = { schemaVersion: 1, domain: 'shimmer', runId: 'e8pr-test', dependencies: [] };
  try {
    const identity = writeShimmerDependencyManifestFile({ manifest, dependencyPath: manifestPath });
    assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).runId, manifest.runId);
    assert.match(identity.manifestSha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(identity.fileSha256, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(identity.fileSha256, identity.manifestSha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Shimmer API dataset responses bind count and first stable row identity', () => {
  const acceptance = { apiExpected: {
    generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
    dataBundleSha256: 'sha256:68801601cfaad72b0e3827ee5f8390037b90c306b9e73ee9547c169f9c6464bb',
    expectedCounts: { itemTransforms: 279 },
    firstRows: { itemTransforms: { id: 10, inputInternalName: 'LifeCrystal' } },
  } };
  const result = validateShimmerApiResponse({
    routeId: 'public-shimmer-item-transforms',
    payload: { success: true, data: [{ id: 10, inputInternalName: 'LifeCrystal' }], pagination: { total: 279 } },
    acceptance,
  });
  assert.equal(result.identityVerified, true);
  assert.throws(() => validateShimmerApiResponse({
    routeId: 'admin-shimmer-item-transforms',
    payload: { success: true, data: [{ id: 11, inputInternalName: 'Wrong' }], pagination: { total: 279 } },
    acceptance,
  }), /stable identity/);
});

test('Shimmer writer detection ignores the current process and its launching shell', () => {
  const rows = [
    '100 1 /bin/bash -lc node pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs --run=true',
    '101 100 node pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs --run=true',
    '102 1 node pipelines/fetch/fetch-wiki-shimmer-page.mjs',
  ].join('\n');
  assert.deepEqual(findActiveShimmerWriters({ processRows: rows, selfPid: 101 }), [102]);
});

test('Shimmer failure evidence keeps post-commit failure separate from rollback and release status', () => {
  const source = buildShimmerLocalSourceManifest({ repoRoot: process.cwd() });
  const artifact = buildShimmerFailureArtifact({
    source,
    sourceManifestSha256: `sha256:${'a'.repeat(64)}`,
    preflight: { status: 'ready' },
    formalFingerprintsBefore: { shimmer: 'before' },
    formalFingerprintsAfter: { shimmer: 'after' },
    cleanup: { passed: true },
    acceptanceDirectory: '.local/tmp/shimmer-failed-attempt',
    error: new Error('independent API readback mismatch'),
  });
  assert.equal(artifact.status, 'failed');
  assert.equal(artifact.maintainedChainStatus, 'failed');
  assert.equal(artifact.formalFingerprintsUnchanged, false);
  assert.equal(artifact.imageBinaryStatus, 'not-applicable');
  assert.equal(artifact.execution.failure.message, 'independent API readback mismatch');
  const aggregate = buildShimmerFailureArtifact({
    source,
    error: new AggregateError([new Error('dependency lookup failed'), new Error('cleanup failed')], 'T1 failed'),
  });
  assert.deepEqual(aggregate.execution.failure.errors.map(({ message }) => message), ['dependency lookup failed', 'cleanup failed']);
  assert.equal(artifact.execution.acceptanceDirectory, '.local/tmp/shimmer-failed-attempt');
});

test('Shimmer CLI refuses to start without the explicit run flag', () => {
  const runnerPath = path.resolve('pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs');
  const result = spawnSync(process.execPath, [runnerPath], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--run=true/);
});
