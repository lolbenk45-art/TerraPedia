import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBossApiRoutes, buildBossRunOwnedApiCredentials, refreshBossApiReadbackPreflight, validateBossApiResponse } from './run-full-recrawl-canonical-isolated.mjs';

test('Boss API route manifest covers public/admin list and public detail', () => {
  assert.deepEqual(buildBossApiRoutes(), [
    { routeId: 'public-bosses', params: {} },
    { routeId: 'public-boss-detail', params: { id: '1' } },
    { routeId: 'admin-bosses', params: {} },
  ]);
});

test('Boss API validator binds 33 stable groups and member identity', () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    id: index + 1,
    code: `BOSS_${index + 1}`,
    nameEn: `Boss ${index + 1}`,
    memberCount: index === 0 ? 2 : 1,
  }));
  const acceptance = { apiExpectations: { totalGroups: 3, pageRows: rows, detail: rows[0] } };
  const result = validateBossApiResponse({
    routeId: 'public-bosses',
    payload: { success: true, data: rows, pagination: { total: 3 } },
    acceptance,
  });
  assert.equal(result.totalGroups, 3);
  assert.throws(() => validateBossApiResponse({
    routeId: 'public-bosses', payload: { success: true, data: rows, pagination: { total: 2 } }, acceptance,
  }), /total differs/);
});

test('Boss run-owned API credentials bind the exact private MinIO allocation', () => {
  const allocation = {
    runId: 'e8pr-bosses-20261017-v1',
    runKey: 'e8p_e1cd44a30171d90d',
    objectStore: {
      domain: 'bosses',
      endpoint: 'http://127.0.0.1:19100',
      bucket: 'tp-e8pr-bosses-20261017',
      objectPrefix: 'e8pr/bosses/e8pr-bosses-20261017-v1/',
    },
  };
  const result = buildBossRunOwnedApiCredentials({
    mysql: { host: '127.0.0.1', port: 13306 },
    apiAccount: { role: 'apiReadonly', username: 'api', password: 'secret' },
    redisPassword: 'redis-secret',
    runKey: allocation.runKey,
    allocation,
    minio: { endpoint: allocation.objectStore.endpoint, accessKey: 'key', secretKey: 'secret' },
  });
  assert.equal(result.minio.url, allocation.objectStore.endpoint);
  assert.throws(() => buildBossRunOwnedApiCredentials({
    mysql: { host: '127.0.0.1', port: 13306 },
    apiAccount: { role: 'apiReadonly', username: 'api', password: 'secret' },
    redisPassword: 'redis-secret', runKey: allocation.runKey, allocation,
    minio: { endpoint: 'http://localhost:9000', accessKey: 'key', secretKey: 'secret' },
  }), /matching private MinIO/);
});

test('Boss API readback preflight refresh accepts only exact live schema/service identities', () => {
  const allocation = {
    runId: 'e8pr-bosses-20261017-v1',
    runKey: 'e8p_e1cd44a30171d90d',
    mysql: { serverUuid: 'server-uuid', databases: { local: 'boss_local', maint: 'boss_maint', relation: 'boss_relation' } },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 5 },
    api: { host: '127.0.0.1', port: 18280 },
    objectStore: { bucket: 'tp-e8pr-bosses-20261017', objectPrefix: 'e8pr/bosses/e8pr-bosses-20261017-v1/' },
    preflight: { status: 'ready', observedAt: '2026-01-01T00:00:00.000Z' },
  };
  const checkedAt = new Date().toISOString();
  const refreshed = refreshBossApiReadbackPreflight({ allocation, evidence: {
    status: 'ready', checkedAt, mysql: { serverUuid: 'server-uuid', databases: ['boss_local', 'boss_maint', 'boss_relation'] },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 5, ping: 'PONG' },
    api: { host: '127.0.0.1', port: 18280, listening: true },
  } });
  assert.equal(refreshed.preflight.observedAt, checkedAt);
  assert.throws(() => refreshBossApiReadbackPreflight({ allocation, evidence: {
    status: 'ready', checkedAt, mysql: { serverUuid: 'wrong', databases: ['boss_local', 'boss_maint', 'boss_relation'] },
    redis: { host: '127.0.0.1', port: 16380, logicalDb: 5, ping: 'PONG' }, api: { host: '127.0.0.1', port: 18280, listening: true },
  } }), /live Boss MySQL/);
});
