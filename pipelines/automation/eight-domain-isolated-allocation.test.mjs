import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildAutomationDatabaseNames, openDurableRunKeyRegistry } from './automation-database-contract.mjs';

const allocationModule = await import('./eight-domain-isolated-allocation.mjs').catch(() => null);

test('isolated allocation contract module is available', () => {
  assert.ok(allocationModule, 'eight-domain isolated allocation contract must be implemented before provisioning');
});

test('runtime allocation manifests match the fixed eight-domain execution manifest and have valid states', () => {
  const root = path.resolve(process.cwd());
  const runtimeRoot = path.join(root, 'reports/runtime/eight-domain-production-readiness/20261017');
  const execution = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'execution-manifest.json'), 'utf8'));
  const redis = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'redis-allocation-manifest.json'), 'utf8'));
  const objectStore = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'object-store-allocation-manifest.json'), 'utf8'));
  assert.deepEqual(redis.allocations.map(({ domain, runId, runKey, logicalDb }) => ({ domain, runId, runKey, logicalDb })),
    Object.entries(execution.runIds).map(([domain, runId]) => ({
      domain,
      runId,
      runKey: execution.mysql.runKeys[domain],
      logicalDb: execution.redis.allocatedDatabases[domain],
    })));
  assert.deepEqual(objectStore.allocations.map(({ domain, runId, bucket }) => ({ domain, runId, bucket })), [
    { domain: 'armor_sets', runId: execution.runIds.armor_sets, bucket: execution.objectStore.buckets.armor_sets },
    { domain: 'bosses', runId: execution.runIds.bosses, bucket: execution.objectStore.buckets.bosses },
  ]);
  for (const entry of redis.allocations) {
    assert.ok(['planned', 'ready'].includes(entry.status));
    if (entry.status === 'ready') {
      assert.equal(entry.readiness?.logicalDb, entry.logicalDb);
      assert.equal(entry.readiness?.dbSize, 0);
      assert.match(entry.readiness?.processStartIdentity ?? '', /^\d+$/);
    }
  }
  for (const entry of objectStore.allocations) {
    assert.ok(['planned', 'ready'].includes(entry.status));
    if (entry.status === 'ready') {
      assert.equal(entry.readiness?.bucketPresent, true);
      assert.equal(entry.readiness?.objectCount, 0);
      assert.match(entry.readiness?.objectListingSha256 ?? '', /^sha256:[a-f0-9]{64}$/);
    }
  }
  assert.equal(execution.preflight.status, 'read_only_identity_and_occupancy_passed');
  assert.equal(execution.preflight.allocationEntriesReady, false);
});

if (allocationModule) {
  const { buildEightDomainAllocationPlan, assertEightDomainResourcePreflight } = allocationModule;
  const runIds = Object.freeze({
    items: 'e8pr-items-20261017-v1',
    npcs: 'e8pr-npcs-20261017-v1',
    projectiles: 'e8pr-projectiles-20261017-v1',
    audio: 'e8pr-audio-20261017-v1',
    bosses: 'e8pr-bosses-20261017-v1',
    armor_sets: 'e8pr-armor_sets-20261017-v1',
    buffs: 'e8pr-buffs-20261017-v1',
    shimmer: 'e8pr-shimmer-20261022-v4',
  });

  function createFixture(t, root = path.join(os.tmpdir(), 'terrapedia-eight-domain-fixture')) {
    const registryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-e8pr-run-keys-'));
    t.after(() => fs.rmSync(registryDir, { recursive: true, force: true }));
    const registry = openDurableRunKeyRegistry(path.join(registryDir, 'run-key-mappings.json'));
    const runKeys = {};
    const expectedSchemas = {};
    for (const [domain, runId] of Object.entries(runIds)) {
      const names = buildAutomationDatabaseNames({ profile: 't1', runId, mappings: registry });
      runKeys[domain] = names.runKey;
      expectedSchemas[domain] = {
        local: names.local,
        maint: names.maint,
        relation: names.relation,
      };
    }
    const manifest = {
      schemaVersion: 1,
      manifestKind: 'eight_domain_production_readiness_execution',
      executionRoot: root,
      sourceRoot: root,
      evidenceRoot: 'reports/runtime/eight-domain-production-readiness/20261017',
      codeCommit: '756ae8bf96f58e6a3e6c7edb256c57bdeb65967c',
      resourceDecision: 'fixed_from_read_only_inventory_fail_closed_no_fallback',
      mysql: {
        host: '127.0.0.1',
        port: 13306,
        serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
        formalDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
        historicalDatabases: ['terria_v1_v55_rehearsal'],
        targetProfile: 't1',
        runKeys,
        expectedSchemas,
      },
      redis: {
        host: '127.0.0.1',
        port: 16380,
        logicalDatabases: 16,
        binary: '/usr/bin/redis-server',
        version: '7.0.15',
        allocatedDatabases: {
          items: 1, npcs: 2, projectiles: 3, audio: 4,
          bosses: 5, armor_sets: 6, buffs: 7, shimmer: 8,
        },
        binary: '/usr/bin/redis-server',
        version: '7.0.15',
        binarySha256: 'sha256:1b2950213684d355e0e49fe6702c7bfb9d40b78f0da9ce289fc0e8f2a295e540',
        persistence: false,
        dataRoot: '.local/tmp/eight-domain-production-readiness/20261017/redis',
        privateFilesMode: '0600',
        configFile: '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.conf',
        authSecretFile: '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.auth',
        startCommandContract: [
          '--port', '16380', '--bind', '127.0.0.1', '--protected-mode', 'yes', '--dir',
          '.local/tmp/eight-domain-production-readiness/20261017/redis', '--databases', '16',
          '--save', '', '--appendonly', 'no',
        ],
        fallback: 'none',
      },
      objectStore: {
        binary: '/home/lolben/.local/bin/minio',
        version: 'RELEASE.2025-09-07T16-13-09Z',
        binarySha256: 'sha256:7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f',
        endpoint: 'http://127.0.0.1:19100',
        consoleEndpoint: 'http://127.0.0.1:19101',
        dataRoot: '.local/tmp/eight-domain-production-readiness/20261017/minio',
        credentialsFile: '.local/tmp/eight-domain-production-readiness/20261017/minio/minio.env',
        privateFilesMode: '0600',
        buckets: { armor_sets: 'tp-e8pr-armor-20261017', bosses: 'tp-e8pr-bosses-20261017', audio: null },
        objectPrefixes: { armor_sets: 'e8pr/armor_sets/<runId>/', bosses: 'e8pr/bosses/<runId>/' },
        audioMode: 'metadata-link-only',
        fallback: 'none',
      },
      api: { isolatedHost: '127.0.0.1', isolatedPort: 18280, productionPorts: [18104, 18105], fallback: 'none' },
      runIds,
      sourceModes: Object.fromEntries(Object.keys(runIds).map((domain) => [domain, { mode: 'repository-frozen' }])),
    };
    return { manifest, registry, runKeys, expectedSchemas };
  }

  function observedPreflight(manifest, domain) {
    return {
      checkedAt: '2026-10-17T10:59:12Z',
      mysql: {
        host: '127.0.0.1',
        port: 13306,
        serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
        formalSchemas: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
        historicalSchemas: ['terria_v1_v55_rehearsal'],
        automationSchemas: [],
      },
      redis: {
        host: '127.0.0.1', port: 16380,
        logicalDb: manifest.redis.allocatedDatabases[domain],
        binarySha256: manifest.redis.binarySha256,
      },
      objectStore: domain === 'armor_sets' || domain === 'bosses' ? {
        endpoint: manifest.objectStore.endpoint,
        consoleEndpoint: manifest.objectStore.consoleEndpoint,
        bucket: manifest.objectStore.buckets[domain],
        binarySha256: manifest.objectStore.binarySha256,
      } : null,
      api: { host: '127.0.0.1', port: 18280 },
      ports: { 16380: 'free', 19100: 'free', 19101: 'free', 18280: 'free' },
      privateRoots: { redis: { exists: false }, minio: { exists: false } },
      activeCrawlerWriters: [],
      credentialSourceProtected: true,
    };
  }

  test('derives exactly the fixed eight domain allocations and schema triples', (t) => {
    const { manifest, registry, runKeys, expectedSchemas } = createFixture(t, '/execution/worktree');
    for (const domain of Object.keys(runIds)) {
      const allocation = buildEightDomainAllocationPlan({
        manifest,
        domain,
        repoRoot: '/execution/worktree',
        runKeyRegistry: registry,
      });
      assert.equal(allocation.runId, runIds[domain]);
      assert.equal(allocation.runKey, runKeys[domain]);
      assert.deepEqual(allocation.mysql.databases, expectedSchemas[domain]);
      assert.equal(allocation.redis.logicalDb, manifest.redis.allocatedDatabases[domain]);
      assert.equal(allocation.api.port, 18280);
      assert.equal(allocation.objectStore?.bucket ?? null, manifest.objectStore.buckets[domain] ?? null);
    }
  });

  test('rejects unknown domain, changed run ID, shared Redis, and endpoint drift before provisioning', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    assert.throws(() => buildEightDomainAllocationPlan({
      ...fixture, domain: 'recipes', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /domain/i);
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: { ...fixture.manifest, runIds: { ...fixture.manifest.runIds, items: 'items_l1_auto_old' } },
      domain: 'items', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /run.?id|fixed/i);
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: { ...fixture.manifest, redis: { ...fixture.manifest.redis, port: 6380 } },
      domain: 'items', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /redis.*(port|fixed|allocation)/i);
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: { ...fixture.manifest, api: { ...fixture.manifest.api, isolatedPort: 18104 } },
      domain: 'items', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /api.*(port|fixed|allocation)/i);
  });

  test('rejects formal or historical schemas and object-store/audio allocation drift', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    const formalSchemaManifest = {
      ...fixture.manifest,
      mysql: {
        ...fixture.manifest.mysql,
        expectedSchemas: {
          ...fixture.expectedSchemas,
          items: { ...fixture.expectedSchemas.items, local: 'terria_v1_local' },
        },
      },
    };
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: formalSchemaManifest, domain: 'items', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /schema|formal/i);
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: { ...fixture.manifest, objectStore: { ...fixture.manifest.objectStore, buckets: { ...fixture.manifest.objectStore.buckets, audio: 'terrapedia-images' } } },
      domain: 'audio', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /audio|object.?store/i);
    assert.throws(() => buildEightDomainAllocationPlan({
      manifest: { ...fixture.manifest, mysql: { ...fixture.manifest.mysql, historicalDatabases: [] } },
      domain: 'npcs', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    }), /historical/i);
  });

  test('rejects shared data roots and any fallback resource policy', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    const mutations = [
      (manifest) => ({ ...manifest, redis: { ...manifest.redis, dataRoot: '/home/lolben/.local/share/terrapedia/redis/redis-6380' } }),
      (manifest) => ({ ...manifest, redis: { ...manifest.redis, fallback: '6380' } }),
      (manifest) => ({ ...manifest, objectStore: { ...manifest.objectStore, dataRoot: '/home/lolben/.local/share/terrapedia/minio/data' } }),
      (manifest) => ({ ...manifest, objectStore: { ...manifest.objectStore, objectPrefixes: { ...manifest.objectStore.objectPrefixes, armor_sets: 'items/' } } }),
      (manifest) => ({ ...manifest, objectStore: { ...manifest.objectStore, fallback: '19000' } }),
      (manifest) => ({ ...manifest, api: { ...manifest.api, fallback: '18104' } }),
    ];
    for (const mutate of mutations) {
      assert.throws(() => buildEightDomainAllocationPlan({
        manifest: mutate(fixture.manifest),
        domain: 'armor_sets',
        repoRoot: '/execution/worktree',
        runKeyRegistry: fixture.registry,
      }));
    }
  });

  test('marks allocation ready only with exact read-only identity and empty owned resources', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    const allocation = buildEightDomainAllocationPlan({
      ...fixture, domain: 'armor_sets', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    });
    const ready = assertEightDomainResourcePreflight(allocation, observedPreflight(fixture.manifest, 'armor_sets'));
    assert.equal(ready.preflight.status, 'ready');
  });

  test('fails closed on UUID drift, an occupied port, nonempty private root, binary drift, or active writer', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    const allocation = buildEightDomainAllocationPlan({
      ...fixture, domain: 'items', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    });
    for (const mutate of [
      (o) => ({ ...o, mysql: { ...o.mysql, serverUuid: 'other' } }),
      (o) => ({ ...o, ports: { ...o.ports, 16380: 'occupied' } }),
      (o) => ({ ...o, privateRoots: { ...o.privateRoots, redis: { exists: true, entries: 1 } } }),
      (o) => ({ ...o, redis: { ...o.redis, binarySha256: 'sha256:wrong' } }),
      (o) => ({ ...o, ports: { ...o.ports, 19100: 'occupied' } }),
      (o) => ({ ...o, credentialSourceProtected: false }),
      (o) => ({ ...o, activeCrawlerWriters: [{ actionId: 'domain-source-items' }] }),
    ]) {
      assert.throws(() => assertEightDomainResourcePreflight(allocation, mutate(observedPreflight(fixture.manifest, 'items'))));
    }
  });

  test('fails closed on run-owned MinIO identity or data-root drift', (t) => {
    const fixture = createFixture(t, '/execution/worktree');
    const allocation = buildEightDomainAllocationPlan({
      ...fixture, domain: 'armor_sets', repoRoot: '/execution/worktree', runKeyRegistry: fixture.registry,
    });
    const observed = observedPreflight(fixture.manifest, 'armor_sets');
    for (const mutate of [
      (o) => ({ ...o, objectStore: { ...o.objectStore, endpoint: 'http://127.0.0.1:19000' } }),
      (o) => ({ ...o, objectStore: { ...o.objectStore, binarySha256: 'sha256:wrong' } }),
      (o) => ({ ...o, privateRoots: { ...o.privateRoots, minio: { exists: true, entries: 1 } } }),
    ]) {
      assert.throws(() => assertEightDomainResourcePreflight(allocation, mutate(observed)), /object|MinIO|root|port/i);
    }
  });
}
