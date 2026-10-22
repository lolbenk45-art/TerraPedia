import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as runner from './run-full-recrawl-canonical-isolated.mjs';
import { buildLocalNpcSourceBinding } from './npc-hybrid-source-selection.mjs';

const {
  buildNpcLocalSourceFromFailedProbe,
  createNpcOfflineAcceptanceExecutor,
  buildNpcOfflineSourceManifest,
  buildNpcDependencyManifest,
  executeNpcOfflineMaintainedChain,
  sha256File,
} = runner;

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-offline-source-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const records = Array.from({ length: 762 }, (_, index) => ({
    id: index - 65,
    internalName: `Npc${index}`,
    name: `NPC ${index}`,
    flags: { friendly: index < 39 },
    extras: { townNPC: index < 39 },
  }));
  const standardized = { entity: 'npcs', generatedAt: '2026-03-28T11:24:36.383Z', upstreamMeta: { sourceRevisionTimestamp: '2026-02-13T13:47:32Z', wikiVersion: '1.4.5.1' }, records };
  const meta = { entity: 'npcs', totalRecords: 762 };
  const map = { count: 762, records: Object.fromEntries(records.map((record) => [record.id, { id: record.id, internalName: record.internalName }])) };
  const paths = {
    standardizedPath: path.join(root, 'npcs.standardized.json'),
    viewMetaPath: path.join(root, '_meta.json'),
    mapPath: path.join(root, 'npc-standardized-map.json'),
  };
  fs.writeFileSync(paths.standardizedPath, JSON.stringify(standardized));
  fs.writeFileSync(paths.viewMetaPath, JSON.stringify(meta));
  fs.writeFileSync(paths.mapPath, JSON.stringify(map));
  return { root, standardized, paths };
}

test('NPC offline source manifest binds user authorization, failed probe, full count and disjoint partitions', (t) => {
  const fixture = makeFixture(t);
  const localSource = {
    ...fixture.paths,
    wikiManifestRecord: { pageId: 18065, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: 'a'.repeat(64) },
  };
  const sourceManifest = buildNpcOfflineSourceManifest({
    localSource,
    failedProbe: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      phase: 'wiki-revision-probe',
      artifactPath: '.local/tmp/npc/source-decision.json',
      artifactSha256: `sha256:${'b'.repeat(64)}`,
      reason: 'HTTP 502 Bad Gateway',
      localBinding: buildLocalNpcSourceBinding(localSource),
    },
    authorization: 'user-directed-local-offline',
    runId: 'e8pr-npcs-20261017-v1',
    runKey: 'e8p_e6e949c02488c2b0',
  });
  assert.equal(sourceManifest.sourceMode, 'local-offline-authorized');
  assert.equal(sourceManifest.recordCount, 762);
  assert.deepEqual(sourceManifest.partitionCounts, { non_town: 723, town: 39 });
  assert.equal(sourceManifest.wikiUnchanged, false);
  assert.equal(sourceManifest.sourceRevisionTimestamp, '2026-02-13T13:47:32Z');
});

test('NPC runtime file hash uses the same sha256 binding format as execution manifests', (t) => {
  const fixture = makeFixture(t);
  const expected = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(fixture.paths.standardizedPath)).digest('hex')}`;
  assert.equal(sha256File(fixture.paths.standardizedPath), expected);
});

test('NPC offline source identity comes only from the frozen failed probe artifact', (t) => {
  const fixture = makeFixture(t);
  const probedLocalSource = {
    ...fixture.paths,
    wikiManifestRecord: {
      sourceKey: 'wiki.module.npcinfo',
      pageId: 18065,
      revisionTimestamp: '2026-02-13T13:47:32Z',
      contentHash: 'a'.repeat(64),
    },
  };
  const localBinding = buildLocalNpcSourceBinding(probedLocalSource);
  const localSource = buildNpcLocalSourceFromFailedProbe({
    localSourcePaths: fixture.paths,
    failedProbeArtifact: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      phase: 'wiki-revision-probe',
      localBinding,
    },
  });
  assert.equal(localSource.wikiManifestRecord.pageId, 18065);
  assert.equal(localSource.wikiManifestRecord.contentHash, 'a'.repeat(64));
  assert.equal(localSource.wikiManifestRecord.revisionTimestamp, '2026-02-13T13:47:32Z');
  assert.throws(() => buildNpcLocalSourceFromFailedProbe({
    localSourcePaths: fixture.paths,
    failedProbeArtifact: { status: 'probe_unavailable', actionId: 'domain-source-npcs' },
  }), /frozen Wiki identity/i);
});

test('NPC offline source manifest rejects a probe artifact outside the private run tree', (t) => {
  const fixture = makeFixture(t);
  const localSource = {
    ...fixture.paths,
    wikiManifestRecord: { pageId: 18065, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: 'a'.repeat(64) },
  };
  assert.throws(() => buildNpcOfflineSourceManifest({
    localSource,
    failedProbe: {
      status: 'probe_unavailable', actionId: 'domain-source-npcs', phase: 'wiki-revision-probe',
      artifactPath: '/tmp/source-decision.json', artifactSha256: `sha256:${'b'.repeat(64)}`,
      localBinding: buildLocalNpcSourceBinding(localSource),
    },
    authorization: 'user-directed-local-offline', runId: 'e8pr-npcs-20261017-v1', runKey: 'e8p_e6e949c02488c2b0',
  }), /private/i);
});

test('NPC offline source manifest rejects local source drift from the failed probe binding', (t) => {
  const fixture = makeFixture(t);
  const localSource = {
    ...fixture.paths,
    wikiManifestRecord: { pageId: 18065, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: 'a'.repeat(64) },
  };
  const probedLocalBinding = buildLocalNpcSourceBinding(localSource);
  assert.throws(() => buildNpcOfflineSourceManifest({
    localSource,
    failedProbe: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      phase: 'wiki-revision-probe',
      artifactPath: '.local/tmp/npc/source-decision.json',
      artifactSha256: `sha256:${'b'.repeat(64)}`,
      localBinding: { ...probedLocalBinding, standardizedSha256: `sha256:${'c'.repeat(64)}` },
    },
    authorization: 'user-directed-local-offline',
    runId: 'e8pr-npcs-20261017-v1',
    runKey: 'e8p_e6e949c02488c2b0',
  }), /local NPC source differs from the source captured by the failed Wiki probe/i);
});

test('NPC offline source manifest must match every frozen execution source hash', () => {
  assert.equal(typeof runner.assertNpcOfflineSourcePins, 'function');
  const sourceManifest = {
    sourceFiles: [
      { path: 'data/standardized/npcs.standardized.json', sha256: `sha256:${'a'.repeat(64)}`, recordCount: 762 },
      { path: 'data/standardized-view/npcs/_meta.json', sha256: `sha256:${'b'.repeat(64)}`, recordCount: 762 },
      { path: 'data/generated/npc-standardized-map.json', sha256: `sha256:${'c'.repeat(64)}`, recordCount: 762 },
    ],
  };
  const executionManifest = { sourceHashes: Object.fromEntries(sourceManifest.sourceFiles.map(({ path: filePath, sha256 }) => [filePath, sha256])) };
  assert.equal(runner.assertNpcOfflineSourcePins({ sourceManifest, executionManifest }), true);
  assert.throws(() => runner.assertNpcOfflineSourcePins({
    sourceManifest,
    executionManifest: { sourceHashes: { ...executionManifest.sourceHashes, 'data/generated/npc-standardized-map.json': `sha256:${'d'.repeat(64)}` } },
  }), /execution manifest source hash mismatch/i);
});

test('NPC Redis lease paths follow the fixed execution manifest shared resource root', () => {
  assert.equal(typeof runner.resolveNpcRedisLeasePaths, 'function');
  const paths = runner.resolveNpcRedisLeasePaths({
    redis: {
      dataRoot: '.local/tmp/eight-domain-production-readiness/20261017/redis',
      authSecretFile: '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.auth',
    },
  });
  assert.equal(paths.leasePath, path.join(process.cwd(), '.local/tmp/eight-domain-production-readiness/20261017/redis/resource-lease.json'));
  assert.equal(paths.authPath, path.join(process.cwd(), '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.auth'));
  assert.throws(() => runner.resolveNpcRedisLeasePaths({
    redis: {
      dataRoot: '.local/tmp/eight-domain-production-readiness/20261017/redis',
      authSecretFile: '.local/tmp/other/redis.auth',
    },
  }), /inside the fixed Redis resource root/i);
});

test('NPC runtime artifact binding records a stale global JAR pin only with a verified run bundle', () => {
  assert.equal(typeof runner.buildNpcRuntimeArtifactBinding, 'function');
  const codeBundle = {
    bundleSha256: `sha256:${'a'.repeat(64)}`,
    baseCommit: '43d6fabf7e806a459b58aba3feadd04edee8a630',
    files: Array.from({ length: 10 }, () => ({})),
  };
  const binding = runner.buildNpcRuntimeArtifactBinding({
    executionManifest: { installation: { backendJarSha256: `sha256:${'b'.repeat(64)}` } },
    codeBundle,
    codeBundleVerification: { status: 'verified', bundleSha256: codeBundle.bundleSha256 },
    apiJarSha256: `sha256:${'c'.repeat(64)}`,
  });
  assert.equal(binding.fixedManifestApiJarPinStatus, 'stale');
  assert.equal(binding.apiJarSha256, `sha256:${'c'.repeat(64)}`);
  assert.throws(() => runner.buildNpcRuntimeArtifactBinding({
    executionManifest: { installation: { backendJarSha256: `sha256:${'b'.repeat(64)}` } },
    codeBundle,
    codeBundleVerification: { status: 'unverified', bundleSha256: codeBundle.bundleSha256 },
    apiJarSha256: `sha256:${'c'.repeat(64)}`,
  }), /verified code bundle and API JAR hashes/i);
});

test('NPC dependency manifest includes only exact Item IDs and local category lookup rows', () => {
  const databases = {
    local: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_local',
    maint: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_maint',
    relation: 'terria_v1_automation_acceptance_e8p_e6e949c02488c2b0_relation',
  };
  const itemColumns = [
    'id', 'name', 'name_zh', 'internal_name', 'image', 'category_id', 'description', 'damage', 'defense',
    'knockback', 'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'rarity_id', 'game_period_id',
    'game_model_id', 'is_stackable', 'stack_size', 'status', 'deleted',
  ];
  const categoryColumns = [
    'id', 'parent_id', 'name', 'code', 'top_type', 'sort', 'description', 'icon', 'status', 'creator_id', 'deleted',
  ];
  const itemRow = Object.assign(Object.fromEntries(itemColumns.map((column) => [column, null])), {
    id: 11, internal_name: 'Banner', name: 'Banner', status: 1, deleted: 0,
  });
  const categoryRows = [
    [352, 'CATEGORY_NPC'],
    [354, 'CATEGORY_NPC_ENEMY'],
    [355, 'CATEGORY_NPC_FRIENDLY'],
    [356, 'CATEGORY_NPC_FRIENDLY_TOWN'],
    [357, 'CATEGORY_NPC_FRIENDLY_OTHER'],
  ].map(([id, code]) => Object.assign(Object.fromEntries(categoryColumns.map((column) => [column, null])), {
    id, parent_id: 0, name: code, code, status: 1, deleted: 0,
  }));
  const manifest = buildNpcDependencyManifest({
    runId: 'e8pr-npcs-20261017-v1',
    runKey: 'e8p_e6e949c02488c2b0',
    databases,
    itemRows: [itemRow],
    categoryRows,
  });
  assert.equal(manifest.domain, 'npcs');
  assert.deepEqual(manifest.dependencies.map((entry) => [entry.target.table, entry.expectedRowCount]), [
    ['items', 1], ['category', 5],
  ]);
  assert.equal(manifest.dependencies[1].purpose, 'npc-category-lookup-dependencies');
});

test('NPC API readback routes bind the run-local representative NPC identity', () => {
  assert.equal(typeof runner.buildNpcApiRoutes, 'function');
  assert.deepEqual(runner.buildNpcApiRoutes({ npcDatabaseId: 1 }), [
    { routeId: 'public-npc-aggregate', params: { id: '1' } },
    { routeId: 'admin-npcs', params: {} },
    { routeId: 'admin-npc-detail', params: { id: '1' } },
  ]);
});

test('NPC isolated acceptance exports the maintained-chain executor wired by the API lifecycle', () => {
  assert.equal(typeof executeNpcOfflineMaintainedChain, 'function');
});

test('NPC API acceptance adapter binds its run context, source, and landing into the maintained chain', () => {
  const source = { entity: 'npcs' };
  const landing = { datasetType: 'npcs_base_raw' };
  const context = { runId: 'e8pr-npcs-20261017-v1' };
  let observed;
  const executor = createNpcOfflineAcceptanceExecutor({
    source,
    landing,
    execute: (value) => { observed = value; return 'accepted'; },
  });
  assert.equal(executor(context), 'accepted');
  assert.deepEqual(observed, { context, source, landing });
});

test('NPC API response validation checks the exact database and stable source identity', () => {
  assert.equal(typeof runner.validateNpcApiResponse, 'function');
  const acceptance = { apiNpc: { databaseId: 1, sourceId: -65, internalName: 'Npc0' } };
  const payloads = [
    ['public-npc-aggregate', { success: true, statusCode: 200, data: { npc: { id: 1, gameId: -65, internalName: 'Npc0' } } }],
    ['admin-npcs', { success: true, statusCode: 200, data: [{ id: 1, gameId: -65, internalName: 'Npc0' }] }],
    ['admin-npc-detail', { success: true, statusCode: 200, data: { id: 1, sourceId: -65, internalName: 'Npc0' } }],
  ];
  for (const [routeId, payload] of payloads) {
    assert.deepEqual(runner.validateNpcApiResponse({ routeId, payload, acceptance }), {
      matched: true,
      databaseId: 1,
      sourceId: -65,
      internalName: 'Npc0',
    });
  }
  assert.throws(() => runner.validateNpcApiResponse({
    routeId: 'admin-npc-detail',
    payload: { success: true, statusCode: 200, data: { id: 1, gameId: -64, internalName: 'Npc0' } },
    acceptance,
  }), /stable source identity mismatch/i);
});
