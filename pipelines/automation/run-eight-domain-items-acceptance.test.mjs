import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  EIGHT_DOMAIN_ITEMS_DEPENDENCY_MANIFEST_RELATIVE_PATH,
  EIGHT_DOMAIN_ITEMS_SOURCE_MANIFEST_RELATIVE_PATH,
  buildRelationSourceLandingEntry,
  buildItemsAcceptanceEvidence,
  buildItemsApiRoutes,
  buildItemsImportInput,
  normalizeMysqlSchemaNames,
  sourceEvidenceKey,
  runEightDomainItemsAcceptance,
} from './run-eight-domain-items-acceptance.mjs';

function hashJson(value) {
  const canonical = (input) => Array.isArray(input)
    ? input.map(canonical)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.keys(input).sort().map((key) => [key, canonical(input[key])]))
      : input;
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function sourceManifest() {
  const rows = {
    biomes: [{ code: 'forest', nameEn: 'Forest' }],
    itemBiomes: [{ itemInternalName: 'Item2', biomeCode: 'forest', relationType: 'found_in', sortOrder: 0 }],
    itemImages: [{ itemInternalName: 'Item2', role: 'icon' }],
    itemSources: [{ itemInternalName: 'Item2', sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Zombie' }],
    recipes: [{ resultInternalName: 'Item2', ingredients: [] }],
  };
  const base = {
    schemaVersion: 1,
    manifestKind: 'eight_domain_items_source',
    runId: 'e8pr-items-20261017-v1',
    selectedIds: [2, 4],
    selectedIdsSha256: `sha256:${'b'.repeat(64)}`,
    selectedCount: 2,
    selectedItems: [{ id: 2, internalName: 'Item2', name: 'Item 2' }, { id: 4, internalName: 'Item4', name: 'Item 4' }],
    selectedPages: [{ itemInternalName: 'Item2', pageId: 1002, revisionTimestamp: '2026-10-01T00:00:00Z' }, { itemInternalName: 'Item4', pageId: 1004, revisionTimestamp: '2026-10-01T00:00:00Z' }],
    sourceFiles: [{ path: 'data/standardized/items.standardized.json', sha256: `sha256:${'a'.repeat(64)}`, recordCount: 6131 }],
    landing: { sourceId: 6470, sourceKey: 'wiki.module.iteminfo', sourcePage: 'Module:Iteminfo/data', contentHash: `sha256:${'c'.repeat(64)}`, rowSha256: `sha256:${'d'.repeat(64)}` },
    itemRelations: {
      selectedRows: rows,
      selectedRecordCounts: { biomes: 1, itemBiomes: 1, itemImages: 1, itemSources: 1, recipes: 1 },
      selectedRowsSha256: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, hashJson(value)])),
      relationBundleSha256: hashJson({ ...rows, snapshots: [] }),
      recipeDependencyItemIds: [],
      npcReferenceNames: ['Zombie'],
      excludedSnapshots: { declaredRecordCount: 6138, missingPartCount: 31, missingRecordCount: 6138 },
    },
  };
  return { ...base, manifestSha256: hashJson(base) };
}

test('Items CLI binds its run to the latest closed source and dependency manifest versions', () => {
  assert.equal(EIGHT_DOMAIN_ITEMS_SOURCE_MANIFEST_RELATIVE_PATH,
    '.local/tmp/eight-domain-production-readiness/20261017/source-manifests/items.selection-manifest.v3.json');
  assert.equal(EIGHT_DOMAIN_ITEMS_DEPENDENCY_MANIFEST_RELATIVE_PATH,
    '.local/tmp/eight-domain-production-readiness/20261017/source-manifests/items.dependencies.v3.json');
});

test('Items relation landing binds the exact selected relation rows and run identity', () => {
  const source = sourceManifest();
  const landing = buildRelationSourceLandingEntry({ source, context: { manifest: { runKey: 'e8p_547b4e28fb4004a0' } } });
  assert.equal(landing.datasetType, 'item_relations_bundle_raw');
  assert.equal(landing.sourceKey, 'generated.item_relations_bundle:e8p_547b4e28fb4004a0');
  assert.equal(landing.payload.itemSources.length, source.itemRelations.selectedRows.itemSources.length);
  assert.deepEqual(landing.payload.snapshots, []);
  assert.equal(landing.contentHash, createHash('sha256').update(JSON.stringify(landing.payload)).digest('hex'));
});

test('Item source identity comparison uses fields exposed by the public source DTO', () => {
  const source = {
    sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Azure Crate', sourcePage: 'Platinum Bar',
    quantityText: '6–16', chanceText: '1/72 (1.39%)', conditions: null, biomeCode: null,
  };
  const dto = {
    sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Azure Crate',
    quantityText: '6–16', chanceText: '1/72 (1.39%)', conditions: null, biomeCode: null,
  };
  assert.equal(sourceEvidenceKey(source), sourceEvidenceKey(dto));
});

test('Items preflight normalizes the uppercase schema column returned by MySQL', () => {
  assert.deepEqual(normalizeMysqlSchemaNames([
    { SCHEMA_NAME: 'terria_v1_local' },
    { SCHEMA_NAME: 'terria_v1_maint' },
  ]), ['terria_v1_local', 'terria_v1_maint']);
});

test('Items acceptance evidence distinguishes the T1 maintained result from V2 readiness', () => {
  const evidence = buildItemsAcceptanceEvidence({
    sourceManifest: sourceManifest(),
    allocation: {
      domain: 'items', runId: 'e8pr-items-20261017-v1', runKey: 'e8p_547b4e28fb4004a0', source: { mode: 'repository-frozen' },
      mysql: { host: '127.0.0.1', port: 13306, serverUuid: 'test', databases: { local: 'local', maint: 'maint', relation: 'relation' } },
      redis: { host: '127.0.0.1', port: 16380, logicalDb: 1 }, api: { host: '127.0.0.1', port: 18280 },
    },
    codeBundle: { bundleSha256: `sha256:${'1'.repeat(64)}`, baseCommit: 'a'.repeat(40), fileCount: 12 },
    preflight: { status: 'ready', checkedAt: '2026-10-21T00:00:00.000Z', mysql: {}, redis: {}, minio: {}, api: {}, activeCrawlerWriters: 0, jarSha256: `sha256:${'2'.repeat(64)}`, formalDatabaseWrites: false, schemaOrAccountWrites: false },
    execution: { status: 'passed', cleanupPassed: true, acceptance: { maintainedChainStatus: 'passed', v2AutomaticIngestionStatus: 'blocked' } },
  });
  assert.equal(evidence.formalDatabaseWrites, false);
  assert.equal(evidence.maintainedChainStatus, 'passed');
  assert.equal(evidence.v2AutomaticIngestionStatus, 'blocked');
  assert.equal(evidence.cleanupPassed, true);
  assert.equal(evidence.preflight.status, 'ready');
  assert.equal(evidence.apiReadbackStatus, null);
  assert.equal(evidence.codeBundle.bundleSha256, `sha256:${'1'.repeat(64)}`);
});

test('Items import input verifies relation hashes and explicitly excludes snapshots', () => {
  const source = sourceManifest();
  const input = buildItemsImportInput(source);
  assert.deepEqual(input.itemsDataset.records.map((row) => row.id), [2, 4]);
  assert.deepEqual(input.relationsDataset.records.snapshots, []);
  assert.equal(input.relationsDataset.records.itemSources.length, 1);
  assert.equal(input.relationBundleSha256, source.itemRelations.relationBundleSha256);
  const { manifestSha256, ...body } = source;
  const tampered = { ...body, itemRelations: { ...source.itemRelations, selectedRows: { ...source.itemRelations.selectedRows, recipes: [] } } };
  assert.throws(() => buildItemsImportInput({ ...tampered, manifestSha256: hashJson(tampered) }), /relation.*hash|bundle.*hash/i);
});

test('Items API route manifest contains only registered consumer/admin read routes', () => {
  const routes = buildItemsApiRoutes(sourceManifest());
  assert.deepEqual(routes.map((route) => route.routeId), [
    'public-item-detail', 'item-detail', 'public-item-sources', 'public-item-images', 'admin-item-recipes',
  ]);
  assert.equal(routes.at(-1).params.id, '2');
});

test('Items runner rejects source or dependency drift before provisioning or API start', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e8pr-items-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'items.json');
  const fixtureSource = { ...sourceManifest(), sourceFiles: [] };
  fs.writeFileSync(sourcePath, `${JSON.stringify(fixtureSource)}\n`, { mode: 0o600 });
  const digest = `sha256:${createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')}`;
  let runLiveCalled = false;
  let apiStarted = false;
  await assert.rejects(() => runEightDomainItemsAcceptance({
    sourceManifestPath: sourcePath,
    sourceManifestSha256: `sha256:${'e'.repeat(64)}`,
    dependencyManifest: { schemaVersion: 1 },
    dependencyManifestPath: path.join(root, 'deps.json'),
    dependencyManifestSha256: `sha256:${'f'.repeat(64)}`,
    targetDatabases: {
      local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
      maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
      relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
    },
    runLiveImpl: async () => { runLiveCalled = true; },
    startApiImpl: async () => { apiStarted = true; },
  }), /source manifest hash|source manifest file hash/i);
  assert.equal(runLiveCalled, false);
  assert.equal(apiStarted, false);
});
