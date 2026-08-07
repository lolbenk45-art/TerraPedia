import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  CANONICAL_EXECUTABLE_OPERATION_IDS,
  buildCanonicalOperationExecutionManifest,
  assertCanonicalOperationExecutionManifestContract,
  writeCanonicalOperationExecutionManifest,
} from './canonical-operation-execution-manifest.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './build-canonical-cutover-authorization.mjs';
import {
  SHIMMER_IMPORT_PROVIDER_SCOPE,
  shimmerImportBindingFromInputContract,
  writeCanonicalShimmerImportInputContract,
} from './canonical-shimmer-import-input-contract.mjs';
import { publishShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import {
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionProposal,
} from '../relation/item-image-projection-contract.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const npcT1ConfigDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-config-'));
const npcT1ConfigPath = path.join(npcT1ConfigDirectory, 'local-stack.json');
const NPC_T1_SERVER_FINGERPRINT = Object.freeze({
  host: '127.0.0.1',
  port: 13306,
  serverUuid: 'npc-t1-server-uuid',
  databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
});
fs.writeFileSync(npcT1ConfigPath, `${JSON.stringify({
  database: { host: '127.0.0.1', port: 13306 },
  redis: { port: 6379 },
  npcT1ServerFingerprint: NPC_T1_SERVER_FINGERPRINT,
})}\n`, { mode: 0o600 });
const npcT1ConfigHash = `sha256:${createHash('sha256').update(fs.readFileSync(npcT1ConfigPath)).digest('hex')}`;

after(() => fs.rmSync(npcT1ConfigDirectory, { recursive: true, force: true }));

const IMAGE_SYNC_OPTIONS = Object.freeze({
  itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
  managedObjectOrigin: 'http://127.0.0.1:19100',
});

function manifestOptions(operationId) {
  if (['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance'].includes(operationId)) {
    return {
      npcT1ConfigPath,
      npcT1RedisDb: 9,
      npcT1RunId: 'npc-t1-20260730-01',
    };
  }
  if (operationId === 'canonical-item-image-projection-missing-row-insert') {
    return {
      itemImageProjectionMissingRowInsertAttemptRoot:
        `reports/authorization/canonical/item-image-projection-missing-row-insert/${'b'.repeat(64)}`,
    };
  }
  if (operationId === 'canonical-item-base-entity-restoration') {
    return {
      itemCanonicalBaseEntityRestorationAttemptRoot:
        `reports/authorization/canonical/item-canonical-base-entity-restoration/${'c'.repeat(64)}`,
    };
  }
  if (operationId === 'canonical-npc-t2-cutover-verification') {
    return {
      backendApiBase: 'http://127.0.0.1:18191',
      npcT2AttemptRoot:
        `reports/authorization/canonical/canonical-npc-t2-cutover-verification/${'d'.repeat(64)}`,
    };
  }
  return operationId === 'canonical-image-sync' ? { ...IMAGE_SYNC_OPTIONS } : {};
}

test('manifest builder covers 41 governed operations and keeps NPC apply explicitly fail closed', () => {
  const shimmerFixture = createShimmerManifestFixture();
  assert.equal(CANONICAL_CUTOVER_OPERATION_IDS.length, 41);
  assert.equal(CANONICAL_EXECUTABLE_OPERATION_IDS.length, 40);
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS['canonical-npc-apply'], null);
  assert.deepEqual(
    Object.entries(CANONICAL_OPERATION_ENTRYPOINTS)
      .filter(([, entrypoint]) => entrypoint === null)
      .map(([operationId]) => operationId),
    ['canonical-npc-apply'],
  );
  assert.deepEqual(
    CANONICAL_EXECUTABLE_OPERATION_IDS,
    CANONICAL_CUTOVER_OPERATION_IDS.filter((operationId) => (
      CANONICAL_OPERATION_ENTRYPOINTS[operationId] !== null
    )),
  );

  try {
    for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
      if (operationId === 'canonical-item-image-projection-apply') continue;
      const operationRepoRoot = operationId === 'canonical-shimmer-import'
        ? shimmerFixture.repoRoot
        : repoRoot;
      const manifest = buildCanonicalOperationExecutionManifest({
        repoRoot: operationRepoRoot,
        operationId,
        artifactDate: '2026-07-28',
        npcLimit: 25,
        ...(operationId === 'canonical-image-sync' || operationId === 'canonical-boss-import'
          ? { backendApiBase: 'http://127.0.0.1:18191/api' }
          : {}),
        ...manifestOptions(operationId),
      });
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.operationId, operationId);
      assert.equal(manifest.command[0], 'node');
      assert.equal(manifest.command[1], CANONICAL_OPERATION_ENTRYPOINTS[operationId]);
      assert.ok(manifest.codeBundleEntries.length >= 2, operationId);
      assert.ok(manifest.codeBundleEntries.some((entry) => entry.path === manifest.command[1]));
      assert.ok(manifest.codeBundleEntries.some((entry) => (
        entry.path === 'scripts/data/automation/run-authorized-canonical-operation.mjs'
      )), `${operationId}: authorized runner`);
      for (const entry of manifest.codeBundleEntries) {
        const bytes = fs.readFileSync(path.join(operationRepoRoot, entry.path));
        const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        assert.equal(entry.contentHash, expected, `${operationId}:${entry.path}`);
      }
    }
  } finally {
    shimmerFixture.cleanup();
  }
});

test('NPC T2 manifest binds one no-write attempt and the exact formal evidence', () => {
  const attemptRoot = `reports/authorization/canonical/canonical-npc-t2-cutover-verification/${'d'.repeat(64)}`;
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-t2-cutover-verification',
    artifactDate: '2026-08-06',
    backendApiBase: 'http://127.0.0.1:18191',
    npcT2AttemptRoot: attemptRoot,
  });

  assert.equal(manifest.noWrite, true);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.databases, {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  });
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-npc-apply.input.json',
    'reports/authorization/canonical/canonical-npc-apply.completion.json',
    'reports/authorization/canonical/canonical-npc-base-maint.completion.json',
    'reports/canonical-migration/canonical-npc-t1-acceptance.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    `${attemptRoot}/result.json`,
    'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json',
  ]);
  assert.ok(manifest.command.includes('--no-write=true'));
  assert.ok(manifest.command.includes('--apiBase=http://127.0.0.1:18191'));
  assert.ok(manifest.command.includes(`--output=${attemptRoot}/result.json`));
});

test('image sync manifest freezes the local reuse evidence bundle and managed origin', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-01',
    backendApiBase: 'http://127.0.0.1:18191',
    itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
    managedObjectOrigin: 'http://127.0.0.1:19100',
  });

  assert.ok(manifest.command.includes(
    '--local-evidence=reports/audit/item-image-source-promotion-abc.bundle.json'
  ));
  assert.ok(manifest.command.includes('--managed-object-origin=http://127.0.0.1:19100'));
  assert.ok(manifest.inputPaths.includes('reports/audit/item-image-source-promotion-abc.bundle.json'));
  // The frozen evidence path is content addressed, never a mutable pointer.
  assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
});

test('image sync manifest freezes the legacy-origin probe-only repair boundary', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-04',
    backendApiBase: 'http://127.0.0.1:18188/api',
    itemImagePromotionBundlePath: 'reports/audit/item-image-source-promotion-abc.bundle.json',
    managedObjectOrigin: 'http://127.0.0.1:19100',
    legacyOriginRepair: true,
    legacyOrigin: 'http://localhost:9000',
    expectedLegacyCount: 331,
  });

  assert.ok(manifest.command.includes('--legacy-origin-repair=true'));
  assert.ok(manifest.command.includes('--legacy-origin=http://localhost:9000'));
  assert.ok(manifest.command.includes('--expected-legacy-count=331'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
});

test('image sync manifest refuses a missing local reuse evidence bundle', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot: process.cwd(),
      operationId: 'canonical-image-sync',
      artifactDate: '2026-08-01',
      backendApiBase: 'http://127.0.0.1:18191',
      managedObjectOrigin: 'http://127.0.0.1:19100',
    }),
    /itemImagePromotionBundlePath is required/i
  );
});

test('image sync manifest binds the item image promotion result as an input', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-image-sync',
    artifactDate: '2026-08-01',
    backendApiBase: 'http://127.0.0.1:18191',
    ...IMAGE_SYNC_OPTIONS,
  });

  assert.deepEqual(manifest.inputPaths, [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
    'reports/audit/item-image-source-promotion-abc.bundle.json',
  ]);
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-image-sync'], [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
  ]);
});

test('item image promotion manifest binds the content-addressed bundle contract', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: process.cwd(),
    operationId: 'canonical-item-image-source-promotion',
    artifactDate: '2026-08-01',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'scripts/data/transform/promote-item-image-sources.mjs',
    '--input-contract=reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'data/standardized/items.standardized.json',
    'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
  ]);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, false);
  // The command must never name a mutable latest pointer; the bundle reaches it
  // only through the hash-bound contract.
  assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
  assert.ok(manifest.codeBundleEntries.some((entry) => (
    entry.path === 'scripts/data/transform/promote-item-image-sources.mjs'
  )));
});

test('item image verification manifest binds the frozen backend child and request cap', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-source-verification',
    artifactDate: '2026-07-31',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    '--mode=apply',
    '--steps=item-image-source-verification',
    '--output=reports/backend-refresh/history/canonical-item-image-source-verification.json',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-item-image-source-verification.input.json',
  ]);
  assert.deepEqual(manifest.reportPaths, [
    'reports/audit/item-image-source-verification.round-04-2026-08-01.json',
    'reports/backend-refresh/history/canonical-item-image-source-verification.json',
  ]);
  assert.deepEqual(manifest.progressPaths, [
    'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/item-image-source-verification.child-status.json',
  ]);
  assert.deepEqual(manifest.bounds, {
    unresolvedIdentityCount: 9,
    batchSize: 8,
    maxRequests: 9,
    serial: true,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
  assert.ok(manifest.codeBundleEntries.some((entry) => (
    entry.path === 'scripts/data/fetch/fetch-item-image-source-verification.mjs'
  )));
});

test('shimmer generation manifest binds the frozen source contract, data inputs, monitor progress, and request cap', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-shimmer-generation',
    artifactDate: '2026-08-01',
  });

  assert.deepEqual(manifest.command, [
    'node',
    'scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    '--input-contract=reports/authorization/canonical/canonical-shimmer-generation.input.json',
    '--page=Shimmer',
    '--api=https://terraria.wiki.gg/zh/api.php',
    '--progress-path=data/generated/domain-source-shimmer-progress.latest.json',
    '--report-output=reports/wiki-shimmer-generation-2026-08-01.md',
  ]);
  assert.equal(manifest.actionId, 'domain-source-shimmer');
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-shimmer-generation.input.json',
    'data/standardized/items.standardized.json',
    'data/standardized/npcs.standardized.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    'data/generated/shimmer/wiki-shimmer-current-generation.json',
  ]);
  assert.deepEqual(manifest.reportPaths, ['reports/wiki-shimmer-generation-2026-08-01.md']);
  assert.deepEqual(manifest.progressPaths, [
    'data/generated/domain-source-shimmer-progress.latest.json',
  ]);
  assert.deepEqual(manifest.sources, ['https://terraria.wiki.gg/zh/api.php']);
  assert.deepEqual(manifest.bounds, {
    pageTitle: 'Shimmer',
    rawRequests: 3,
    langlinkBatchSize: 8,
    maxLanglinkRequests: 128,
    maxRequests: 131,
    serial: true,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.networkAccess, true);
  const codePaths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
  for (const expectedPath of [
    'scripts/data/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    'scripts/data/fetch/fetch-wiki-shimmer-page.mjs',
    'scripts/data/fetch/fetch-wiki-shimmer-langlinks.mjs',
    'scripts/data/transform/shimmer-generation-builder.mjs',
    'scripts/data/maint/shimmer-structured-parser.mjs',
    'scripts/data/transform/shimmer-generation-contract.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
    'scripts/data/automation/authorized-operation-context.mjs',
    'scripts/data/automation/build-canonical-cutover-authorization.mjs',
  ]) {
    assert.ok(codePaths.has(expectedPath), expectedPath);
  }
});

test('shimmer import manifest passes only the private exact input contract to the importer', () => {
  const fixture = createShimmerManifestFixture();

  try {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      artifactDate: '2026-08-03',
    });

    assert.deepEqual(manifest.command, [
      'node',
      'scripts/data/import/import-wiki-shimmer-to-db.mjs',
      '--input-contract=reports/authorization/canonical/canonical-shimmer-import.input.json',
      '--apply=true',
      '--output=reports/authorization/canonical/canonical-shimmer-import.result.json',
      '--database=terria_v1_local',
    ]);
    assert.deepEqual(manifest.inputPaths, [
      'reports/authorization/canonical/canonical-shimmer-import.input.json',
    ]);
    assert.deepEqual(manifest.outputPaths, [
      'reports/authorization/canonical/canonical-shimmer-import.result.json',
    ]);
    assert.deepEqual(manifest.reportPaths, []);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.deepEqual(manifest.shimmerImport, fixture.binding);
    assert.ok(manifest.command.every((token) => !String(token).includes('latest')));
    assert.ok(manifest.command.every((token) => !String(token).startsWith('--raw=')));
    assert.ok(manifest.command.every((token) => !String(token).startsWith('--input=')));

    assert.doesNotThrow(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      manifest,
    }));
    assert.throws(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-shimmer-import',
      manifest: {
        ...manifest,
        shimmerImport: {
          ...manifest.shimmerImport,
          previewSha256: `sha256:${'f'.repeat(64)}`,
        },
      },
    }), /contract drifted/i);

    const codePaths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
    for (const expectedPath of [
      'scripts/data/import/import-wiki-shimmer-to-db.mjs',
      'scripts/data/automation/canonical-shimmer-import-input-contract.mjs',
      'scripts/data/automation/authorized-operation-context.mjs',
      'scripts/data/automation/build-canonical-cutover-authorization.mjs',
      'scripts/data/transform/shimmer-generation-contract.mjs',
      'scripts/data/transform/shimmer-generation-builder.mjs',
      'scripts/data/maint/shimmer-structured-parser.mjs',
    ]) {
      assert.ok(codePaths.has(expectedPath), expectedPath);
    }
  } finally {
    fixture.cleanup();
  }
});

function createShimmerManifestFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-manifest-'));
  const sourceScripts = path.join(repoRoot, 'scripts');
  fs.symlinkSync(sourceScripts, path.join(fixtureRoot, 'scripts'), 'dir');
  const publication = publishShimmerGeneration({
    rawBytes: Buffer.from(JSON.stringify({ pageTitle: 'Shimmer', html: '<table></table>' })),
    shards: {
      context: { entity: 'wiki_shimmer_context_importable', records: [{ code: 'SHIMMER' }] },
      itemTransforms: { entity: 'wiki_shimmer_item_transforms_importable', records: [] },
      decraftRules: { entity: 'wiki_shimmer_decraft_rules_importable', records: [] },
      entityTransforms: { entity: 'wiki_shimmer_entity_transforms_importable', records: [] },
      npcTransforms: { entity: 'wiki_shimmer_npc_transforms_importable', records: [] },
      titleResolution: { entity: 'wiki_shimmer_title_resolution', records: [] },
    },
    standardizedInputs: {
      items: { path: 'data/standardized/items.standardized.json', sha256: `sha256:${'a'.repeat(64)}` },
      npcs: { path: 'data/standardized/npcs.standardized.json', sha256: `sha256:${'b'.repeat(64)}` },
    },
    langlinkEvidenceBytes: Buffer.from(JSON.stringify({ records: [] })),
    producerCodeSha256: `sha256:${'c'.repeat(64)}`,
    tableRoleVersion: 'shimmer-table-roles/1',
    generatedAt: '2026-08-04T00:00:00.000Z',
    generationRoot: path.join(fixtureRoot, 'data/generated/shimmer/generations'),
    pointerPath: path.join(fixtureRoot, 'data/generated/shimmer/wiki-shimmer-current-generation.json'),
    runId: 'manifest-test',
  });
  const inputContract = writeCanonicalShimmerImportInputContract({
    repoRoot: fixtureRoot,
    inputContract: {
      schemaVersion: 1,
      operationId: 'canonical-shimmer-import',
      generationId: publication.manifest.generationId,
      manifestPath: path.relative(fixtureRoot, publication.manifestPath).replaceAll('\\', '/'),
      manifestSha256: publication.manifest.manifestSha256,
      dataBundleSha256: publication.manifest.dataBundleSha256,
      previewSha256: `sha256:${'d'.repeat(64)}`,
      targetFingerprintSha256: `sha256:${'e'.repeat(64)}`,
      providerScope: {
        provider: SHIMMER_IMPORT_PROVIDER_SCOPE.provider,
        sourcePage: SHIMMER_IMPORT_PROVIDER_SCOPE.sourcePage,
        tables: [...SHIMMER_IMPORT_PROVIDER_SCOPE.tables],
      },
    },
  });
  return {
    binding: shimmerImportBindingFromInputContract(inputContract.contract),
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
    repoRoot: fixtureRoot,
  };
}

test('NPC item relation lineage repair manifest binds historical predecessors and a distinct result', () => {
  const operationId = 'canonical-npc-item-relation-lineage-repair';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
  });

  assert.deepEqual(manifest.command, [
    'node', 'scripts/data/npc-canonical/npc-owner-phase-apply.mjs',
    `--operation-id=${operationId}`,
    '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
    `--output=reports/authorization/canonical/${operationId}.result.json`,
    '--apply=true',
  ]);
  assert.deepEqual(manifest.inputPaths, [
    'reports/authorization/canonical/canonical-npc-apply.input.json',
    'reports/authorization/canonical/canonical-npc-landing-apply.result.json',
    'reports/authorization/canonical/canonical-npc-facts-maint-apply.result.json',
    'reports/authorization/canonical/canonical-npc-item-relations-apply.result.json',
  ]);
  assert.deepEqual(manifest.outputPaths, [
    `reports/authorization/canonical/${operationId}.result.json`,
  ]);
  assert.deepEqual(manifest.ownershipKeys, [
    'relation.item_source_facts.items',
    'relation.item_source_details.items',
  ]);
  assert.deepEqual(manifest.requiredOperationIds, [
    'canonical-npc-landing-apply',
    'canonical-npc-facts-maint-apply',
    'canonical-npc-item-relations-apply',
  ]);
  assert.equal(manifest.executionClass, 'formal_npc_relation_lineage_repair');
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('NPC owner retry manifest binds a validated distinct result label', () => {
  const operationId = 'canonical-npc-nonboss-loot-projection-apply';
  const resultLabel = 'owner-scope-repair-20260730-01';
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
    resultLabel,
  });
  const resultPath = `reports/authorization/canonical/${operationId}.${resultLabel}.result.json`;

  assert.equal(manifest.resultLabel, resultLabel);
  assert.ok(manifest.command.includes(`--output=${resultPath}`));
  assert.deepEqual(manifest.outputPaths, [resultPath]);
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId,
    artifactDate: '2026-07-30',
    resultLabel: '../replacement',
  }), /result label/i);
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-loot-import',
    artifactDate: '2026-07-30',
    resultLabel,
  }), /NPC owner operation/i);
});

test('NPC base maint manifests bind exact source, landing result, owner partition, and no network access', () => {
  const expected = {
    'canonical-npc-base-maint-nontown-apply': 'maint.maint_npcs.npcs',
    'canonical-npc-base-maint-town-apply': 'maint.maint_npcs.town',
  };
  for (const [operationId, ownershipKey] of Object.entries(expected)) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-30',
    });
    assert.deepEqual(manifest.command, [
      'node', 'scripts/data/npc-canonical/npc-base-maint-apply.mjs',
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=reports/authorization/canonical/${operationId}.result.json`,
      '--apply=true',
    ]);
    assert.deepEqual(manifest.inputPaths, [
      'reports/authorization/canonical/canonical-npc-apply.input.json',
      'reports/authorization/canonical/canonical-npc-landing-apply.result.json',
      'data/standardized/npcs.standardized.json',
    ]);
    assert.deepEqual(manifest.ownershipKeys, [ownershipKey]);
    assert.deepEqual(manifest.requiredOperationIds, ['canonical-npc-landing-apply']);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
    assert.ok(manifest.codeBundleEntries.some((entry) => (
      entry.path === 'scripts/data/npc-canonical/npc-base-maint-apply.mjs'
    )));
    assert.ok(manifest.codeBundleEntries.some((entry) => (
      entry.path === 'scripts/data/maint/sync-landing-to-maint.mjs'
    )));
  }
});

test('NPC T1 manifest freezes the private config identity and isolated-resource boundary', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-t1-acceptance',
    artifactDate: '2026-07-30',
    ...manifestOptions('canonical-npc-t1-acceptance'),
  });
  assert.deepEqual(manifest.command, [
    'node',
    'scripts/data/automation/run-live-automation-acceptance.mjs',
    '--profile=t1',
    '--scope=npc-canonical',
    `--config-path=${npcT1ConfigPath}`,
    `--config-sha256=${npcT1ConfigHash}`,
    '--redis-db=9',
    '--run-id=npc-t1-20260730-01',
    '--max-rows=2',
    '--output=reports/canonical-migration/canonical-npc-t1-acceptance.json',
  ]);
  assert.deepEqual(manifest.isolatedAcceptance, {
    configPath: npcT1ConfigPath,
    configSha256: npcT1ConfigHash,
    redisLogicalDb: 9,
    runId: 'npc-t1-20260730-01',
    serverFingerprint: NPC_T1_SERVER_FINGERPRINT,
  });
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('recipe T1 manifest freezes a bounded offline fixture', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-recipe-t1-acceptance'], [
    'scripts/data/recipe/fixtures/recipe-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-recipe-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.deepEqual(manifest.inputPaths, [
    'scripts/data/recipe/fixtures/recipe-t1.sample.json',
  ]);
  assert.equal(manifest.networkAccess, false);
});

test('boss T1 manifest freezes joint boss and loot fixtures offline', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-boss-t1-acceptance'], [
    'scripts/data/boss/fixtures/boss-t1.sample.json',
    'scripts/data/boss/fixtures/boss-loot-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-boss-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--scope=boss-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('projectile T1 manifest freezes the item-only fixture and explicit isolated boundary', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-projectile-t1-acceptance'], [
    'scripts/data/projectile/fixtures/projectile-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-projectile-t1-acceptance',
    artifactDate: '2026-08-07',
    ...manifestOptions('canonical-projectile-t1-acceptance'),
  });

  assert.ok(manifest.command.includes('--scope=projectile-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.ok(manifest.command.includes('--output=reports/canonical-migration/canonical-projectile-t1-acceptance.json'));
  assert.deepEqual(manifest.inputPaths, [
    'scripts/data/projectile/fixtures/projectile-t1.sample.json',
  ]);
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('buff T1 manifest freezes the two-record fixture and explicit isolated boundary', () => {
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS['canonical-buff-t1-acceptance'], [
    'scripts/data/buff/fixtures/buff-t1.sample.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-buff-t1-acceptance',
    artifactDate: '2026-08-08',
    ...manifestOptions('canonical-buff-t1-acceptance'),
  });
  assert.ok(manifest.command.includes('--scope=buff-canonical'));
  assert.ok(manifest.command.includes('--max-rows=25'));
  assert.ok(manifest.command.includes('--output=reports/canonical-migration/canonical-buff-t1-acceptance.json'));
  assert.equal(manifest.databaseWrites, false);
  assert.equal(manifest.isolatedResourceWrites, true);
  assert.equal(manifest.networkAccess, false);
});

test('manifest CLI accepts the exact NPC T1 private-config arguments', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-t1-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      'scripts/data/automation/canonical-operation-execution-manifest.mjs',
      `--repo-root=${repoRoot}`,
      '--operation-id=canonical-npc-t1-acceptance',
      '--artifact-date=2026-07-30',
      `--npc-t1-config-path=${npcT1ConfigPath}`,
      '--npc-t1-redis-db=9',
      '--npc-t1-run-id=npc-t1-20260730-01',
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(manifest.operationId, 'canonical-npc-t1-acceptance');
    assert.equal(manifest.isolatedAcceptance.configSha256, npcT1ConfigHash);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('manifest CLI preserves the exact legacy-origin repair arguments', () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-image-sync-manifest-cli-'));
  const outputPath = path.join(outputDirectory, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      'scripts/data/automation/canonical-operation-execution-manifest.mjs',
      `--repo-root=${repoRoot}`,
      '--operation-id=canonical-image-sync',
      '--artifact-date=2026-08-04',
      '--backend-api-base=http://127.0.0.1:18188/api',
      '--item-image-promotion-bundle-path=reports/audit/item-image-source-promotion-abc.bundle.json',
      '--managed-object-origin=http://127.0.0.1:19100',
      '--legacy-origin-repair=true',
      '--legacy-origin=http://localhost:9000',
      '--expected-legacy-count=331',
      `--output=${outputPath}`,
    ], { cwd: repoRoot, encoding: 'utf8' });
    const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.deepEqual(manifest.command.slice(-6), [
      '--managed-object-origin=http://127.0.0.1:19100',
      '--legacy-origin-repair=true',
      '--legacy-origin=http://localhost:9000',
      '--expected-legacy-count=331',
      '--output=reports/workflow-image-sync-2026-08-04.json',
      '--progress-path=reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json',
    ]);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('bootstrap, recipe, and NPC manifests freeze exact safety-critical arguments', () => {
  const bootstrap = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'automation-biomes-l0-bootstrap',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(bootstrap.command, [
    'node',
    'scripts/data/automation/bootstrap-automation-policy.mjs',
    '--input=reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
    '--output=reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json',
    '--apply=true',
  ]);
  assert.deepEqual(bootstrap.inputPaths, [
    'reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
  ]);
  assert.equal(bootstrap.databaseWrites, true);
  assert.equal(bootstrap.networkAccess, false);

  const recipe = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-crawler',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(recipe.bounds, { seedPageCount: 2, maxDepth: 1, serial: true });
  assert.deepEqual(recipe.progressPaths, [
    'reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
    'data/generated/wiki-sync-progress.latest.json',
  ]);
  assert.equal(recipe.databaseWrites, false);
  assert.equal(recipe.networkAccess, true);

  const recipeApply = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-recipe-apply',
    artifactDate: '2026-07-28',
  });
  assert.deepEqual(recipeApply.inputPaths, ['data/generated/wiki-zh-recipe-pages.latest.json']);

  const npc = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-crawler',
    artifactDate: '2026-07-28',
    npcLimit: 25,
  });
  assert.ok(npc.command.includes('--limit=25'));
  assert.ok(npc.command.includes('--targets-file=reports/authorization/canonical/canonical-npc-crawler.targets.json'));
  assert.deepEqual(npc.bounds, { targetLimit: 25, serial: true });
  assert.equal(npc.databaseWrites, false);
  assert.equal(npc.networkAccess, true);
});

test('formal child executors bind the exact packet verifier into their code bundles', () => {
  for (const operationId of [
    'automation-biomes-l0-bootstrap',
    'canonical-schema-v56-v58',
    'canonical-item-group-bootstrap',
    'automation-biomes-l1-policy-promotion',
    'automation-biomes-l2-promotion',
    'automation-biomes-scheduler-activation',
  ]) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
    });
    const paths = manifest.codeBundleEntries.map((entry) => entry.path);
    assert.ok(paths.includes('scripts/data/automation/authorized-operation-context.mjs'), operationId);
    assert.ok(paths.includes('scripts/data/automation/build-canonical-cutover-authorization.mjs'), operationId);
  }
});

test('schema manifest binds every role schema module executed after Flyway', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-schema-v56-v58',
    artifactDate: '2026-07-28',
  });
  const paths = manifest.codeBundleEntries.map((entry) => entry.path);
  assert.ok(paths.includes('scripts/data/maint/maint-schema.mjs'));
  assert.ok(paths.includes('scripts/data/relation/relation-schema.mjs'));
});

test('boss manifest binds the backend managed-image upload contract it executes', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-boss-import',
    artifactDate: '2026-07-29',
    backendApiBase: 'http://127.0.0.1:18192/api',
  });
  const paths = manifest.codeBundleEntries.map((entry) => entry.path);
  for (const expectedPath of [
    'back/src/main/java/com/terraria/skills/controller/FileStorageController.java',
    'back/src/main/java/com/terraria/skills/service/ObjectStorageService.java',
    'back/src/main/java/com/terraria/skills/service/UserAvatarValidator.java',
    'back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java',
  ]) {
    assert.ok(paths.includes(expectedPath), expectedPath);
  }
});

test('every manifest binds all repository-local static imports of its code bundle', () => {
  const shimmerFixture = createShimmerManifestFixture();
  try {
    for (const operationId of CANONICAL_EXECUTABLE_OPERATION_IDS) {
      if (operationId === 'canonical-item-image-projection-apply') continue;
      const operationRepoRoot = operationId === 'canonical-shimmer-import'
        ? shimmerFixture.repoRoot
        : repoRoot;
      const manifest = buildCanonicalOperationExecutionManifest({
        repoRoot: operationRepoRoot,
        operationId,
        artifactDate: '2026-07-28',
        npcLimit: 25,
        ...(operationId === 'canonical-image-sync' || operationId === 'canonical-boss-import'
          ? { backendApiBase: 'http://127.0.0.1:18191/api' }
          : {}),
        ...manifestOptions(operationId),
      });
      const paths = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
      const missing = [];
      for (const relativePath of paths) {
        if (!relativePath.endsWith('.mjs')) continue;
        const source = fs.readFileSync(path.join(operationRepoRoot, relativePath), 'utf8');
        for (const specifier of staticRelativeImports(source)) {
          let importedPath = path.posix.normalize(path.posix.join(
            path.posix.dirname(relativePath),
            specifier,
          ));
          if (!path.posix.extname(importedPath)) importedPath += '.mjs';
          if (fs.existsSync(path.join(operationRepoRoot, importedPath)) && !paths.has(importedPath)) {
            missing.push(importedPath);
          }
        }
      }
      assert.deepEqual([...new Set(missing)], [], operationId);
    }
  } finally {
    shimmerFixture.cleanup();
  }
});

test('formal cutover and activation manifests freeze exact safety-critical arguments', () => {
  const expected = {
    'canonical-schema-v56-v58': [
      'node', 'scripts/data/automation/run-canonical-schema-migration.mjs',
      '--output=reports/authorization/canonical/canonical-schema-v56-v58.result.json',
      '--apply=true',
    ],
    'canonical-item-group-bootstrap': [
      'node', 'scripts/data/item-groups/item-group-canonical-action.mjs',
      '--action-id=item-group-canonical-apply',
      '--input=reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
      '--output=reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
      '--progress-path=reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json',
    ],
    'automation-biomes-l1-policy-promotion': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l1-policy-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l1-policy-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l1-policy-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-first-l1': [
      'node', 'scripts/data/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-first-l1',
      '--input=reports/authorization/canonical/automation-biomes-first-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-first-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-second-l1': [
      'node', 'scripts/data/automation/run-biomes-automation-operation.mjs',
      '--operation-id=automation-biomes-second-l1',
      '--input=reports/authorization/canonical/automation-biomes-second-l1.bundle.json',
      '--output=reports/authorization/canonical/automation-biomes-second-l1.result.json',
      '--apply=true',
    ],
    'automation-biomes-l2-promotion': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-l2-promotion',
      '--input=reports/authorization/canonical/automation-biomes-l2-promotion.input.json',
      '--output=reports/authorization/canonical/automation-biomes-l2-promotion.result.json',
      '--apply=true',
    ],
    'automation-biomes-scheduler-activation': [
      'node', 'scripts/data/automation/run-automation-policy-decision.mjs',
      '--operation-id=automation-biomes-scheduler-activation',
      '--input=reports/authorization/canonical/automation-biomes-scheduler-activation.input.json',
      '--output=reports/authorization/canonical/automation-biomes-scheduler-activation.result.json',
      '--apply=true',
    ],
  };
  for (const [operationId, command] of Object.entries(expected)) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
    });
    assert.deepEqual(manifest.command, command, operationId);
    assert.equal(manifest.databaseWrites, true, operationId);
    assert.equal(manifest.networkAccess, false, operationId);
  }
  assert.throws(() => buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-npc-apply',
    artifactDate: '2026-07-28',
  }), /no governed executor.*canonical-npc-apply/i);
});

test('image and boss manifests require and freeze the active backend API base', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-image-sync',
      artifactDate: '2026-07-28',
    }),
    /backendApiBase.*required/i,
  );
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-boss-import',
      artifactDate: '2026-07-28',
    }),
    /backendApiBase.*required/i,
  );
  for (const operationId of ['canonical-image-sync', 'canonical-boss-import']) {
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId,
      artifactDate: '2026-07-28',
      backendApiBase: 'http://127.0.0.1:18191/api',
      ...manifestOptions(operationId),
    });
    assert.ok(manifest.command.includes('--apiBase=http://127.0.0.1:18191/api'));
  }
});

test('manifest builder refuses invalid NPC limits', () => {
  assert.throws(
    () => buildCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-npc-crawler',
      npcLimit: 0,
    }),
    /npcLimit.*exactly 25/i,
  );
});

test('manifest writer atomically emits one private operation artifact', () => {
  const outputDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-canonical-manifest-test-'));
  const outputPath = path.join(outputDir, 'recipe.json');
  try {
    const manifest = writeCanonicalOperationExecutionManifest({
      repoRoot,
      operationId: 'canonical-recipe-crawler',
      artifactDate: '2026-07-28',
      outputPath,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), manifest);
    assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
    assert.deepEqual(fs.readdirSync(outputDir), ['recipe.json']);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

function staticRelativeImports(source) {
  const imports = [];
  for (const pattern of [
    /(?:import\s+(?:[^'\"]*?\s+from\s+)?|export\s+[^'\"]*?\s+from\s+)['\"](\.[^'\"]+)['\"]/g,
    /import\s*\(\s*['\"](\.[^'\"]+)['\"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

test('the item image lineage code bundle pins every module the apply loads', () => {
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    artifactDate: '2026-08-01',
  });

  const pinned = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
  // The bundle is resolved through the import graph, so the staged writers and
  // the runtime-config resolver are pinned without being listed by hand. This
  // locks that in: the approval has to cover the code that touches the tables,
  // not just the orchestrator named in the catalog.
  for (const required of [
    'scripts/data/relation/apply-item-image-lineage.mjs',
    'scripts/data/relation/item-image-lineage-adapter.mjs',
    'scripts/data/relation/item-image-lineage-db.mjs',
  ]) {
    assert.ok(pinned.has(required), `${required} must be pinned by the code bundle`);
  }
});

test('item image lineage manifest binds one fresh attempt root', () => {
  const attemptRoot = 'reports/authorization/canonical/item-image-lineage-apply/'
    + 'a'.repeat(64);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot,
    operationId: 'canonical-item-image-lineage-apply',
    artifactDate: '2026-08-05',
    itemImageLineageAttemptRoot: attemptRoot,
  });

  assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
  assert.deepEqual(manifest.outputPaths, [
    `${attemptRoot}/snapshot.json`,
    `${attemptRoot}/result.json`,
  ]);
  assert.deepEqual(manifest.command, [
    'node',
    'scripts/data/relation/apply-item-image-lineage.mjs',
    `--input-contract=${attemptRoot}/input.json`,
    '--apply=true',
    `--snapshot=${attemptRoot}/snapshot.json`,
    `--result=${attemptRoot}/result.json`,
  ]);
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.equal(manifest.itemImageLineageAttempt.attemptRoot, attemptRoot);
});

test('item image projection manifest binds one decision-derived attempt root', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const manifest = buildProjectionManifest(fixture);
    const { attemptRoot } = fixture.paths;
    assert.deepEqual(manifest.inputPaths, [`${attemptRoot}/input.json`]);
    assert.deepEqual(manifest.outputPaths, [`${attemptRoot}/result.json`]);
    assert.deepEqual(manifest.itemImageProjectionAttempt, {
      attemptId: fixture.paths.attemptId,
      attemptRoot,
      manifestPath: fixture.paths.manifestPath,
      requestPath: fixture.paths.requestPath,
      packetPath: fixture.paths.packetPath,
      permitPath: fixture.paths.permitPath,
      resultPath: fixture.paths.resultPath,
      inputBinding: projectionInputBinding(fixture.input),
    });
    assert.deepEqual(manifest.command, [
      'node',
      'scripts/data/relation/apply-item-image-projection.mjs',
      `--input-contract=${attemptRoot}/input.json`,
      '--apply=true',
      `--output=${attemptRoot}/result.json`,
    ]);
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);

    const pinned = new Set(manifest.codeBundleEntries.map((entry) => entry.path));
    assert.deepEqual([...pinned].sort(), [
      'scripts/data/automation/authorized-operation-context.mjs',
      'scripts/data/automation/automation-database-contract.mjs',
      'scripts/data/automation/build-canonical-cutover-authorization.mjs',
      'scripts/data/automation/canonical-operation-catalog.mjs',
      'scripts/data/automation/canonical-operation-execution-manifest.mjs',
      'scripts/data/automation/canonical-shimmer-import-input-contract.mjs',
      'scripts/data/automation/policy-set-hash.mjs',
      'scripts/data/automation/run-authorized-canonical-operation.mjs',
      'scripts/data/automation/table-ownership-matrix.mjs',
      'scripts/data/lib/mysql-module.mjs',
      'scripts/data/lib/private-repository-path.mjs',
      'scripts/data/lib/project-root.mjs',
      'scripts/data/maint/maint-schema.mjs',
      'scripts/data/npc-canonical/npc-apply-ownership-preparation.mjs',
      'scripts/data/relation/apply-item-image-projection.mjs',
      'scripts/data/relation/build-item-image-projection-proposal.mjs',
      'scripts/data/relation/item-image-lineage-db.mjs',
      'scripts/data/relation/item-image-projection-contract.mjs',
      'scripts/data/relation/item-image-projection-db.mjs',
      'scripts/data/relation/managed-image-url-policy.mjs',
      'scripts/data/relation/projection-schema.mjs',
      'scripts/data/relation/relation-schema.mjs',
      'scripts/data/transform/shimmer-generation-contract.mjs',
      'scripts/lib/local-runtime-config.mjs',
    ].sort());
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest rejects attempt aliases and input-derived identity drift', () => {
  const fixture = createProjectionManifestFixture();
  const sibling = createProjectionManifestFixture({
    decisionIdentity: 'canonical-item-image-projection-proposal-read-20990101-02',
  });
  try {
    for (const attemptRoot of [
      `${fixture.paths.attemptRoot}/child`,
      `${fixture.paths.attemptRoot}/../${fixture.paths.attemptId}`,
      sibling.paths.attemptRoot,
      path.resolve(fixture.repoRoot, fixture.paths.attemptRoot),
    ]) {
      assert.throws(
        () => buildProjectionManifest(fixture, { attemptRoot }),
        /attempt|input.*root|relative|projection input contract/i,
      );
    }
  } finally {
    fixture.cleanup();
    sibling.cleanup();
  }
});

test('item image projection manifest rejects every dynamic import expression form', () => {
  for (const expression of [
    "import('./unbound.mjs')",
    "import('/tmp/unbound.mjs')",
    "import('unbound-package')",
    'import(specifier)',
    'import(`./${specifier}.mjs`)',
    '`${import(specifier)}`',
  ]) {
    const fixture = createProjectionManifestFixture();
    try {
      const entrypoint = path.join(
        fixture.repoRoot,
        'scripts/data/relation/apply-item-image-projection.mjs',
      );
      fs.appendFileSync(entrypoint, `\nvoid ${expression};\n`);
      assert.throws(() => buildProjectionManifest(fixture), /forbids dynamic import/i, expression);
    } finally {
      fixture.cleanup();
    }
  }
});

test('item image projection supplied manifest verification rechecks dynamic imports', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const manifest = buildProjectionManifest(fixture);
    const relativeEntrypoint = 'scripts/data/relation/apply-item-image-projection.mjs';
    const entrypoint = path.join(fixture.repoRoot, relativeEntrypoint);
    fs.appendFileSync(entrypoint, "\nvoid import('./unbound.mjs');\n");
    const codeBundleEntries = manifest.codeBundleEntries.map((entry) => (
      entry.path === relativeEntrypoint
        ? {
            ...entry,
            contentHash: `sha256:${createHash('sha256').update(fs.readFileSync(entrypoint)).digest('hex')}`,
          }
        : entry
    ));
    assert.throws(() => assertCanonicalOperationExecutionManifestContract({
      repoRoot: fixture.repoRoot,
      operationId: 'canonical-item-image-projection-apply',
      manifest: { ...manifest, codeBundleEntries },
    }), /forbids dynamic import/i);
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest writer requires the exact private no-overwrite attempt path', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const exactOutput = path.join(fixture.repoRoot, fixture.paths.manifestPath);
    const manifest = writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath: exactOutput,
    });
    assert.equal(manifest.itemImageProjectionAttempt.manifestPath, fixture.paths.manifestPath);
    assert.equal(fs.statSync(exactOutput).mode & 0o777, 0o600);
    assert.throws(() => writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath: exactOutput,
    }), /already exists|overwrite/i);

    for (const outputPath of [
      path.join(fixture.repoRoot, 'execution-manifest.json'),
      path.join(fixture.repoRoot, fixture.paths.attemptRoot, 'nested', 'execution-manifest.json'),
    ]) {
      assert.throws(() => writeCanonicalOperationExecutionManifest({
        ...projectionManifestOptions(fixture),
        outputPath,
      }), /execution-manifest\.json|attempt root|exact/i);
      assert.equal(fs.existsSync(outputPath), false);
    }
  } finally {
    fixture.cleanup();
  }
});

test('item image projection manifest writer rejects a retained failed attempt before creating a replacement', () => {
  const fixture = createProjectionManifestFixture();
  try {
    const resultPath = path.join(fixture.repoRoot, fixture.paths.resultPath);
    fs.mkdirSync(path.dirname(resultPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(resultPath, JSON.stringify({
      operationId: 'canonical-item-image-projection-apply',
      status: 'failed',
      apply: true,
    }) + '\n', { mode: 0o600 });
    const outputPath = path.join(fixture.repoRoot, fixture.paths.manifestPath);
    assert.throws(() => writeCanonicalOperationExecutionManifest({
      ...projectionManifestOptions(fixture),
      outputPath,
    }), /retained failed attempt|result.*already exists|retry/i);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fixture.cleanup();
  }
});

function createProjectionManifestFixture({
  decisionIdentity = 'canonical-item-image-projection-proposal-read-20990101-01',
} = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-projection-manifest-'));
  fs.cpSync(path.join(repoRoot, 'scripts'), path.join(fixtureRoot, 'scripts'), { recursive: true });
  const paths = buildItemImageProjectionAttemptPaths(decisionIdentity);
  const hash = `sha256:${'a'.repeat(64)}`;
  const managedPrefix = 'http://127.0.0.1:9000/terrapedia-images/items/';
  const target = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'projection-manifest-server',
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
  };
  const proposal = buildItemImageProjectionProposal({
    generatedAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2099-01-02T00:00:00.000Z',
    proposalAuthorization: {
      path: paths.proposalReadOwnerInputPath,
      sha256: hash,
      decisionIdentity,
      authorizationHash: hash,
    },
    lineage: {
      inputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      inputContractSha256: hash,
      resultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      resultSha256: hash,
      bundlePath: 'reports/audit/item-image-lineage.bundle.json',
      bundleSha256: hash,
      applySnapshotPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      applySnapshotSha256: hash,
      authorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      authorizationPacketSha256: hash,
      decisionIdentity: 'canonical-item-image-lineage-apply-20990101-01',
      packetHash: hash,
      dispatchPermitHash: hash,
      completedRowCount: 1,
    },
    lineageKeys: ['Wood'],
    target,
    snapshotPath: paths.snapshotPath,
    snapshotSha256: hash,
    managedUrlPolicy: {
      sourcePath: 'scripts/data/relation/managed-image-url-policy.mjs',
      sourceSha256: hash,
      resolvedPrefixesSha256: hashValue([managedPrefix]),
    },
    managedUrlPrefixes: [managedPrefix],
    relationRows: [{
      recordKey: 'relation-wood',
      internalName: 'Wood',
      cachedUrl: '/terrapedia-images/items/wood.png',
      role: 'icon',
      isPrimary: 1,
      status: 1,
      deleted: 0,
    }],
    projectionRows: [{
      id: 1,
      relationRecordKey: 'relation-wood',
      internalName: 'Wood',
      image: '/legacy/wood.png',
      status: 1,
      deleted: 0,
    }],
  });
  const input = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: hash,
  });
  const inputPath = path.join(fixtureRoot, paths.inputPath);
  fs.mkdirSync(path.dirname(inputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(inputPath, 0o600);
  return {
    repoRoot: fixtureRoot,
    paths,
    input,
    cleanup: () => fs.rmSync(fixtureRoot, { recursive: true, force: true }),
  };
}

function projectionManifestOptions(fixture) {
  return {
    repoRoot: fixture.repoRoot,
    operationId: 'canonical-item-image-projection-apply',
    artifactDate: '2099-01-01',
    itemImageProjectionAttemptRoot: fixture.paths.attemptRoot,
  };
}

function buildProjectionManifest(fixture, { attemptRoot = fixture.paths.attemptRoot } = {}) {
  return buildCanonicalOperationExecutionManifest({
    ...projectionManifestOptions(fixture),
    itemImageProjectionAttemptRoot: attemptRoot,
  });
}

function projectionInputBinding(input) {
  return {
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    attemptId: input.attemptId,
    attemptRoot: input.attemptRoot,
    proposalAuthorization: input.proposalAuthorization,
    proposalPath: input.proposalPath,
    proposalSha256: input.proposalSha256,
    snapshotPath: input.snapshotPath,
    snapshotSha256: input.snapshotSha256,
    lineage: input.lineage,
    target: input.target,
    managedUrlPolicy: input.managedUrlPolicy,
    managedUrlPrefixes: input.managedUrlPrefixes,
    keys: input.keys,
    keySetSha256: input.keySetSha256,
    relationRowsSha256: input.relationRowsSha256,
    projectionBeforeSha256: input.projectionBeforeSha256,
    projectionAfterSha256: input.projectionAfterSha256,
    targetRowCount: input.targetRowCount,
    changedRowCount: input.changedRowCount,
  };
}

function hashValue(value) {
  const stable = (candidate) => Array.isArray(candidate)
    ? candidate.map(stable)
    : candidate && typeof candidate === 'object'
      ? Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, stable(candidate[key])]))
      : candidate;
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}
