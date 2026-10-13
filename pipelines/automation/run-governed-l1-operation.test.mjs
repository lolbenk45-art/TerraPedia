import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GOVERNED_L1_DOMAIN_ORDER,
  buildL1RunArtifactPaths,
  buildManualL1AuthorizationContext,
  buildImportPlan,
  acquireShimmerPartitionFences,
  getGovernedL1DomainConfig,
  hashFileBytes,
  loadShimmerPartitionFences,
  sourceCommandArgs,
} from './run-governed-l1-operation.mjs';
import { SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest } from './canonical-operation-execution-manifest.mjs';

test('exposes the approved eight-domain serial L1 order and exact owned tables', () => {
  assert.deepEqual(GOVERNED_L1_DOMAIN_ORDER, [
    'items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer',
  ]);
  assert.deepEqual(getGovernedL1DomainConfig('items').ownedTables, [
    { databaseRole: 'local', table: 'items' },
  ]);
  assert.deepEqual(getGovernedL1DomainConfig('bosses').ownedTables, [
    { databaseRole: 'local', table: 'boss_groups' },
    { databaseRole: 'local', table: 'npcs' },
  ]);
  assert.deepEqual(getGovernedL1DomainConfig('shimmer').ownedTables, SHIMMER_PARTITION_SCOPES.map((scope) => ({
    databaseRole: scope.databaseRole,
    table: scope.table,
    fieldGroup: scope.fieldGroup,
    logicalPredicateHash: scope.logicalPredicateHash,
  })));
  assert.throws(() => getGovernedL1DomainConfig('biomes'), /unsupported governed L1 domain/);
});

test('Buff automatic source collection includes page immunity evidence', () => {
  assert.deepEqual(sourceCommandArgs('buffs', '/tmp/buffs-progress.json', 'buffs-run'), [
    '--progress-path=/tmp/buffs-progress.json',
  ]);
});

test('derives an immutable run artifact root from the domain and run id', () => {
  const paths = buildL1RunArtifactPaths({
    repoRoot: '/repo',
    domainId: 'items',
    runId: 'items_l1_20260829_run01',
  });
  assert.equal(paths.root, '/repo/reports/authorization/canonical/l1-runs/items/items_l1_20260829_run01');
  assert.equal(paths.sourcePath, `${paths.root}/source.json`);
  assert.equal(paths.bundlePath, `${paths.root}/bundle.json`);
  assert.equal(paths.authorizationPath, `${paths.root}/authorization-context.json`);
  assert.equal(paths.reconciliationOutputPath, 'reports/runtime/l1-reconciliation/items/items_l1_20260829_run01/reconciliation-evidence.json');
  assert.notEqual(paths.bundlePath, '/repo/reports/authorization/canonical/automation-items-l1.bundle.json');
  assert.throws(() => buildL1RunArtifactPaths({
    repoRoot: '/repo', domainId: 'items', runId: 'items_l1_bad/escape',
  }), /runId/);
});

test('creates a fresh per-run authorization context with unique decision identity', () => {
  const first = buildManualL1AuthorizationContext({
    operationId: 'automation-items-l1',
    domainId: 'items',
    runId: 'items_l1_20260829_run01',
    actor: 'admin',
    generatedAt: '2026-08-29T00:00:00.000Z',
  });
  const second = buildManualL1AuthorizationContext({
    operationId: 'automation-items-l1',
    domainId: 'items',
    runId: 'items_l1_20260829_run02',
    actor: 'admin',
    generatedAt: '2026-08-29T00:00:01.000Z',
  });
  for (const context of [first, second]) {
    assert.equal(context.authorizationStatus, 'AUTHORIZED');
    assert.equal(context.operationId, 'automation-items-l1');
    assert.equal(context.actor, 'admin');
    assert.match(context.authorizationReference, /^user:\/\/conversation\/2026-08-29\/eight-domain-l1-/);
    assert.match(context.decisionIdentity, /^eight-domain-l1-items_l1_20260829_run0[12]-[a-f0-9]{16}$/);
    assert.match(context.packetHash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(Date.parse(context.expiresAt) > Date.parse(context.authorizedAt));
  }
  assert.notEqual(first.decisionIdentity, second.decisionIdentity);
  assert.notEqual(first.packetHash, second.packetHash);
});

test('hashes frozen source files by their exact bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governed-l1-source-hash-'));
  const filePath = path.join(root, 'source.json');
  const bytes = Buffer.from('{\n  "records": []\n}\n', 'utf8');
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  assert.equal(
    hashFileBytes(filePath),
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  );
});

test('registers exact manual L1 apply operations for every governed domain', () => {
  for (const domainId of GOVERNED_L1_DOMAIN_ORDER) {
    const operationId = getGovernedL1DomainConfig(domainId).operationId;
    assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId), operationId);
    assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId], 'pipelines/automation/run-governed-l1-operation.mjs');
    const manifest = buildCanonicalOperationExecutionManifest({
      repoRoot: '/home/lolben/TerraPedia',
      operationId,
      artifactDate: '2026-08-29',
      l1RunRoot: `reports/authorization/canonical/l1-runs/${domainId}/${domainId}_l1_20260829_run01`,
    });
    assert.equal(manifest.executionClass, 'formal_automation_l1_apply');
    assert.equal(manifest.databaseWrites, true);
    assert.equal(manifest.networkAccess, false);
  }
});

test('builds the Shimmer import plan from the frozen generation manifest path', async () => {
  const calls = [];
  const verifiedBundle = {
    generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
    manifestSha256: `sha256:${'a'.repeat(64)}`,
    dataBundleSha256: `sha256:${'b'.repeat(64)}`,
  };
  const result = await buildImportPlan({
    domainId: 'shimmer',
    sourcePayload: {
      generationId: verifiedBundle.generationId,
      manifestPath: 'generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      manifestSha256: verifiedBundle.manifestSha256,
      dataBundleSha256: verifiedBundle.dataBundleSha256,
    },
    connection: {},
    bundle: { repoRoot: '/repo' },
    runId: 'shimmer_l1_20260829_run01',
    ownerApprovals: ['items', 'shimmer', 'town_npc_maintenance'],
    currentContext: {
      baseline: {
        environmentId: 'local',
        generations: SHIMMER_PARTITION_SCOPES.map((scope, index) => ({ ...scope, generation: index })),
      },
    },
    acquireShimmerPartitionFencesImpl: async () => SHIMMER_PARTITION_SCOPES.map((scope, index) => ({
      databaseRole: scope.databaseRole,
      table: scope.table,
      logicalPredicateHash: scope.logicalPredicateHash,
      generation: index,
      fenceToken: `fence-${index}`,
    })),
    loadShimmerBundleImpl: (options) => {
      calls.push(['bundle', options]);
      return verifiedBundle;
    },
    loadCurrentScopeImpl: async () => ({ shimmerTables: {}, snapshots: [] }),
    loadTargetFingerprintImpl: async () => ({
      host: '127.0.0.1',
      port: 13306,
      database: 'terria_v1_local',
      serverUuid: 'server-uuid',
    }),
    buildShimmerPreviewImpl: () => ({
      previewSha256: `sha256:${'c'.repeat(64)}`,
      targetFingerprintSha256: `sha256:${'d'.repeat(64)}`,
      tables: { shimmer_item_transforms: { count: 0 } },
    }),
  });

  assert.equal(result.previewSha256, `sha256:${'c'.repeat(64)}`);
  assert.equal(result.targetFingerprintSha256, `sha256:${'d'.repeat(64)}`);
  assert.equal(result.shimmerPartition.scopes.length, 6);
  assert.equal(result.shimmerPartition.generationId, verifiedBundle.generationId);
  assert.equal(result.shimmerPartition.previewSha256, `sha256:${'c'.repeat(64)}`);
  assert.deepEqual(calls, [[
    'bundle',
    {
      bundleManifestPath: 'data/generated/shimmer/generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      repoRoot: '/repo',
    },
  ]]);
});

test('builds the Shimmer import plan against the explicit caller worktree root', async () => {
  const calls = [];
  const verifiedBundle = {
    generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
    manifestSha256: `sha256:${'a'.repeat(64)}`,
    dataBundleSha256: `sha256:${'b'.repeat(64)}`,
  };
  await buildImportPlan({
    domainId: 'shimmer',
    repoRoot: '/caller/worktree',
    sourcePayload: {
      generationId: verifiedBundle.generationId,
      manifestPath: 'generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      manifestSha256: verifiedBundle.manifestSha256,
      dataBundleSha256: verifiedBundle.dataBundleSha256,
    },
    connection: {},
    bundle: { domainId: 'shimmer' },
    runId: 'shimmer_l1_20260829_run01',
    ownerApprovals: ['items', 'shimmer', 'town_npc_maintenance'],
    currentContext: {
      baseline: {
        environmentId: 'local',
        generations: SHIMMER_PARTITION_SCOPES.map((scope, index) => ({ ...scope, generation: index })),
      },
    },
    loadShimmerBundleImpl: (options) => {
      calls.push(options);
      return verifiedBundle;
    },
    loadCurrentScopeImpl: async () => ({ shimmerTables: {}, snapshots: [] }),
    loadTargetFingerprintImpl: async () => ({
      host: '127.0.0.1',
      port: 13306,
      database: 'terria_v1_local',
      serverUuid: 'server-uuid',
    }),
    buildShimmerPreviewImpl: () => ({
      previewSha256: `sha256:${'c'.repeat(64)}`,
      targetFingerprintSha256: `sha256:${'d'.repeat(64)}`,
      tables: { shimmer_item_transforms: { count: 0 } },
    }),
    acquireShimmerPartitionFencesImpl: async () => SHIMMER_PARTITION_SCOPES.map((scope, index) => ({
      databaseRole: scope.databaseRole,
      table: scope.table,
      logicalPredicateHash: scope.logicalPredicateHash,
      generation: index,
      fenceToken: `fence-${index}`,
    })),
  });

  assert.equal(calls[0].repoRoot, '/caller/worktree');
});

test('Shimmer governed import plan fails closed without a six-scope baseline', async () => {
  await assert.rejects(
    () => buildImportPlan({
      domainId: 'shimmer',
      sourcePayload: {
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestPath: 'generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      },
      connection: {},
      currentContext: { baseline: { environmentId: 'local', generations: [] } },
      runId: 'shimmer_l1_20260829_run01',
      ownerApprovals: ['items', 'shimmer', 'town_npc_maintenance'],
      loadShimmerBundleImpl: () => ({
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestSha256: `sha256:${'a'.repeat(64)}`,
        dataBundleSha256: `sha256:${'b'.repeat(64)}`,
      }),
      buildShimmerPreviewImpl: () => ({
        previewSha256: `sha256:${'c'.repeat(64)}`,
        targetFingerprintSha256: `sha256:${'d'.repeat(64)}`,
        tables: {},
      }),
    }),
    /baseline generations/i,
  );
});

test('Shimmer partition fence loader rejects a missing or foreign fence', async () => {
  const scope = SHIMMER_PARTITION_SCOPES[0];
  await assert.rejects(
    () => loadShimmerPartitionFences({
      query: async () => [[{
        latestRunId: 'other-run', fenceToken: 'real-fence', beforeGeneration: 0,
      }]],
    }, {
      environmentId: 'local',
      runId: 'shimmer_l1_20260829_run01',
      generations: SHIMMER_PARTITION_SCOPES.map((entry, index) => ({ ...entry, generation: index })),
    }),
    /missing|owned|run/i,
  );
  assert.equal(scope.table, 'world_contexts');
});

test('Shimmer partition acquisition writes and verifies one real fence per scope', async () => {
  const inserts = [];
  const connection = {
    async query(sql, params) {
      if (/^INSERT INTO crawler_automation_write_fence/.test(sql)) {
        inserts.push(params);
        return [{ affectedRows: 1 }];
      }
      if (/^SELECT latest_run_id/.test(sql)) {
        const inserted = inserts.find((entry) => entry[2] === params[2]);
        return [[{
          latestRunId: 'shimmer_l1_20260829_run01',
          fenceToken: inserted?.[6],
          beforeGeneration: Number(inserted?.[7]),
        }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const generations = SHIMMER_PARTITION_SCOPES.map((scope, index) => ({ ...scope, generation: index }));
  const fences = await acquireShimmerPartitionFences(connection, {
    environmentId: 'local',
    runId: 'shimmer_l1_20260829_run01',
    generations,
  });
  assert.equal(inserts.length, 6);
  assert.equal(fences.length, 6);
  assert.ok(fences.every((fence) => /^fence:[a-f0-9]{64}$/.test(fence.fenceToken)));
});

test('rejects a Shimmer manifest path with traversal segments', async () => {
  await assert.rejects(
    () => buildImportPlan({
      domainId: 'shimmer',
      sourcePayload: {
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestPath: 'data/generated/shimmer/generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/../379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      },
      connection: {},
      loadShimmerBundleImpl: () => { throw new Error('UNEXPECTED_LOADER_INVOCATION'); },
    }),
    /normalized|canonical|manifest path/i,
  );
});

test('rejects a Shimmer manifest path with duplicate separators', async () => {
  await assert.rejects(
    () => buildImportPlan({
      domainId: 'shimmer',
      sourcePayload: {
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestPath: 'data/generated/shimmer//generations/379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761/wiki-shimmer-manifest.json',
      },
      connection: {},
      loadShimmerBundleImpl: () => { throw new Error('UNEXPECTED_LOADER_INVOCATION'); },
    }),
    /normalized|canonical|manifest path/i,
  );
});

test('rejects a Shimmer manifest path containing backslashes', async () => {
  await assert.rejects(
    () => buildImportPlan({
      domainId: 'shimmer',
      sourcePayload: {
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestPath: 'data\\generated\\shimmer\\generations\\379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761\\wiki-shimmer-manifest.json',
      },
      connection: {},
      loadShimmerBundleImpl: () => { throw new Error('UNEXPECTED_LOADER_INVOCATION'); },
    }),
    /normalized|canonical|manifest path/i,
  );
});

test('rejects a Shimmer manifest path for a different generation', async () => {
  await assert.rejects(
    () => buildImportPlan({
      domainId: 'shimmer',
      sourcePayload: {
        generationId: '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761',
        manifestPath: 'data/generated/shimmer/generations/03d9c8a889e948cf5a6e378944b66279763149c6f4b5ba8be442ffbeb954f523/wiki-shimmer-manifest.json',
      },
      connection: {},
      loadShimmerBundleImpl: () => { throw new Error('UNEXPECTED_LOADER_INVOCATION'); },
    }),
    /generation|canonical|manifest path/i,
  );
});
