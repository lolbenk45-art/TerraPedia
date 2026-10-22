import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import {
  buildProjectileApiRoutes,
  buildProjectileLandingEntry,
  buildProjectileOfflineSourceManifest,
  buildProjectileRelationReadback,
  validateProjectileApiReadbackResult,
  refreshProjectileApiReadbackPreflight,
} from './run-full-recrawl-canonical-isolated.mjs';

const HASH = 'sha256:' + 'a'.repeat(64);

function standardizedSource() {
  const records = Array.from({ length: 1111 }, (_, id) => ({
    id,
    internalName: `Projectile${id}`,
    name: `Projectile ${id}`,
    combat: { damage: id, knockBack: 1.5, penetrate: 2 },
    lifecycle: { timeLeft: 90 },
    dimensions: { width: 12, height: 16, scale: 1.25 },
    flags: { friendly: id % 2 === 0, hostile: false, tileCollide: true },
  }));
  return {
    entity: 'projectiles',
    upstreamMeta: {
      fetchedAt: '2026-03-26T08:51:56.833Z',
      moduleGeneratedAt: '2026-02-06 03:47:26 (+00:00)',
      moduleGeneratedFrom: 'Module:Projectileinfo/datagen',
      sourceRevisionTimestamp: '2026-03-14T09:34:58Z',
    },
    records,
  };
}

test('full Projectile landing binds all local records to the exact prior module revision', () => {
  const standardized = standardizedSource();
  const entry = buildProjectileLandingEntry({
    standardized,
    localBinding: {
      sourceKey: 'wiki.module.projectileinfo',
      recordCount: 1111,
      stableIdCount: 1111,
      standardizedSha256: HASH,
      sourceRevisionTimestamp: '2026-03-14T09:34:58Z',
    },
    sourceIdentity: {
      pageId: 18025,
      revisionTimestamp: '2026-03-14T09:34:58Z',
      moduleContentSha256: 'sha256:' + 'b'.repeat(64),
    },
  });

  assert.equal(entry.datasetType, 'projectiles_raw');
  assert.equal(entry.sourceKey, 'wiki.module.projectileinfo');
  assert.equal(entry.sourceRevisionTimestamp, '2026-03-14T09:34:58Z');
  assert.equal(entry.payload.projectiles.length, 1111);
  assert.deepEqual(entry.payload.projectiles[0], {
    ...standardized.records[0],
    damage: 0,
    knockBack: 1.5,
    penetrate: 2,
    timeLeft: 90,
    width: 12,
    height: 16,
    scale: 1.25,
    friendly: true,
    hostile: false,
    tileCollide: true,
  });
  assert.equal(entry.contentHash, createHash('sha256').update(JSON.stringify(entry.payload)).digest('hex'));
});

test('full Projectile landing rejects a truncated source even if its payload is otherwise valid', () => {
  const standardized = standardizedSource();
  standardized.records.pop();
  assert.throws(() => buildProjectileLandingEntry({
    standardized,
    localBinding: {
      sourceKey: 'wiki.module.projectileinfo',
      recordCount: 1111,
      stableIdCount: 1111,
      standardizedSha256: HASH,
      sourceRevisionTimestamp: '2026-03-14T09:34:58Z',
    },
    sourceIdentity: {
      pageId: 18025,
      revisionTimestamp: '2026-03-14T09:34:58Z',
      moduleContentSha256: 'sha256:' + 'b'.repeat(64),
    },
  }), /complete hash-bound 1,111-record/);
});

test('Projectile API route manifest reads public and admin consumers plus one stable detail row', () => {
  assert.deepEqual(buildProjectileApiRoutes(), [
    { routeId: 'public-projectiles', params: {} },
    { routeId: 'admin-projectiles', params: {} },
    { routeId: 'admin-projectile-detail', params: { id: '1' } },
  ]);
});

test('Projectile offline source manifest preserves the explicit offline decision and exact relation evidence', () => {
  const dependencyManifest = {
    schemaVersion: 1,
    domain: 'projectiles',
    runId: 'e8pr-projectiles-20261017-v1',
    runKey: 'e8p_cbf91b9072f33db5',
    dependencies: [{ id: 'projectile-items', expectedRowCount: 726 }],
  };
  const dependencyHash = dependencyManifestSha256(dependencyManifest);
  const manifest = buildProjectileOfflineSourceManifest({
    runId: 'e8pr-projectiles-20261017-v1',
    runKey: 'e8p_cbf91b9072f33db5',
    source: {
      sourceDecision: { sourceMode: 'local-offline-authorized', wikiUnchanged: false },
      sourceIdentity: { pageId: 18025, revisionTimestamp: '2026-03-14T09:34:58Z' },
      localBinding: { sourceKey: 'wiki.module.projectileinfo', recordCount: 1111 },
    },
    viewEvidence: { partCount: 6, recordCount: 1111 },
    relationEvidence: { manifestSha256: HASH, counts: { itemRelationCount: 720 } },
    dependencyManifestSha256: dependencyHash,
  });

  assert.equal(manifest.sourceMode, 'local-offline-authorized');
  assert.equal(manifest.wikiUnchanged, false);
  assert.equal(manifest.sourceIdentity.pageId, 18025);
  assert.equal(manifest.relationEvidence.counts.itemRelationCount, 720);
  assert.equal(manifest.dependencyManifestSha256, dependencyHash);
});

test('Projectile relation readback summary validates exact relation rows and unresolved targets', () => {
  const summary = buildProjectileRelationReadback({
    itemRelationRows: [{ item_source_id: 10, projectile_source_id: 1, source_field: 'raw_json.shoot' }],
    itemAuditRows: [
      { item_source_id: 10, projectile_source_id: 1, audit_status: 'promoted_to_relation' },
      { item_source_id: 11, projectile_source_id: 99, audit_status: 'projectile_missing' },
    ],
    npcRelationRows: [],
    npcAuditRows: [],
    explicitRelations: [{ sourceKind: 'item', sourceId: 10, projectileSourceId: 1, sourceField: 'raw_json.shoot' }],
    unresolvedProjectileIds: [99],
  });

  assert.equal(summary.itemRelations.count, 1);
  assert.deepEqual(summary.itemAudits.unresolvedProjectileIds, [99]);
  assert.equal(summary.npcRelationCount, 0);
  assert.equal(summary.npcAuditCount, 0);
});

test('Projectile API readback preflight refresh requires live identity evidence', () => {
  const checkedAt = new Date().toISOString();
  const allocation = {
    mysql: { serverUuid: 'server-uuid', databases: { local: 'run_local', maint: 'run_maint', relation: 'run_relation' } },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 3 },
    api: { host: '127.0.0.1', port: 18280 },
    preflight: { status: 'ready', observedAt: '2026-10-21T00:00:00.000Z' },
  };
  const evidence = {
    status: 'ready',
    checkedAt,
    mysql: {
      serverUuid: 'server-uuid',
      databases: ['run_local', 'run_maint', 'run_relation'],
    },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 3, ping: 'PONG' },
    api: { host: '127.0.0.1', port: 18280, listening: true },
  };

  const refreshed = refreshProjectileApiReadbackPreflight({ allocation, evidence });

  assert.equal(refreshed.preflight.status, 'ready');
  assert.equal(refreshed.preflight.observedAt, checkedAt);
  assert.throws(() => refreshProjectileApiReadbackPreflight({
    allocation,
    evidence: { ...evidence, mysql: { ...evidence.mysql, serverUuid: 'wrong-server' } },
  }), /does not match the live MySQL, Redis, and API allocation/);
});

test('Projectile API readback evidence requires the three registered successful routes', () => {
  const routes = [
    { routeId: 'public-projectiles', status: 200 },
    { routeId: 'admin-projectiles', status: 200 },
    { routeId: 'admin-projectile-detail', status: 200 },
  ];
  assert.deepEqual(validateProjectileApiReadbackResult(routes), routes);
  assert.throws(() => validateProjectileApiReadbackResult({ routes }), /registered HTTP 200 routes/);
  assert.throws(() => validateProjectileApiReadbackResult(routes.slice(0, 2)), /registered HTTP 200 routes/);
});
