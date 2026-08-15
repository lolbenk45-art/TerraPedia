import test from 'node:test';
import assert from 'node:assert/strict';

import { dropAutomationDatabases } from './drop-automation-databases.mjs';

const baseManifest = {
  schemaVersion: 1,
  profile: 't0',
  runId: 'drop-run',
  runKey: 'dro_0123456789abcdef',
  environmentId: 'env-t0',
  serverIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' },
  provisioner: { allowedPrefix: 'terria_v1_automation_test_dro_0123456789abcdef_' },
  databases: {
    local: { role: 'local', name: 'terria_v1_automation_test_dro_0123456789abcdef_local', host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' },
    maint: { role: 'maint', name: 'terria_v1_automation_test_dro_0123456789abcdef_maint', host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' },
    relation: { role: 'relation', name: 'terria_v1_automation_test_dro_0123456789abcdef_relation', host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' }
  },
  redis: { host: '127.0.0.1', port: 6379, logicalDb: 41, epoch: 'epoch-dro_0123456789abcdef', reservationToken: 'reservation-drop', environmentId: 'env-t0' }
};

test('cleanup is idempotent and drops only the exact three runKey databases', async () => {
  const calls = [];
  const adapter = {
    inspectServer: async () => ({ host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' }),
    dropDatabase: async (input) => calls.push(['drop', input]),
    releaseRedisLogicalDb: async (input) => calls.push(['redis', input])
  };
  await dropAutomationDatabases({ manifest: baseManifest, runKey: baseManifest.runKey, adapter });
  await dropAutomationDatabases({ manifest: baseManifest, runKey: baseManifest.runKey, adapter });
  assert.equal(calls.filter(([kind]) => kind === 'drop').length, 6);
  assert.equal(calls.filter(([kind]) => kind === 'redis').length, 2);
  assert.deepEqual(calls.find(([kind]) => kind === 'redis')[1], {
    ...baseManifest.redis, runKey: baseManifest.runKey, ifMissing: true
  });
  assert.ok(calls.every(([, input]) => input.name === undefined || input.name.startsWith('terria_v1_automation_test_dro_')));
});

test('cleanup refuses runKey mismatch, formal database, and outside-prefix targets before adapter calls', async () => {
  const calls = [];
  const adapter = {
    inspectServer: async () => ({ host: '127.0.0.1', port: 3306, serverUuid: 'server-t0' }),
    dropDatabase: async () => calls.push('drop'),
    releaseRedisLogicalDb: async () => calls.push('redis')
  };
  for (const input of [
    { manifest: baseManifest, runKey: 'bad_0123456789abcdef' },
    { manifest: { ...baseManifest, databases: { ...baseManifest.databases, local: { role: 'local', name: 'terria_v1_local' } } }, runKey: baseManifest.runKey },
    { manifest: { ...baseManifest, databases: { ...baseManifest.databases, local: { role: 'local', name: 'other_database' } } }, runKey: baseManifest.runKey },
    { manifest: { ...baseManifest, redis: { ...baseManifest.redis, logicalDb: 0 } }, runKey: baseManifest.runKey },
    { manifest: { ...baseManifest, redis: { ...baseManifest.redis, epoch: 'epoch-other' } }, runKey: baseManifest.runKey },
    { manifest: { ...baseManifest, serverIdentity: { ...baseManifest.serverIdentity, serverUuid: 'other' } }, runKey: baseManifest.runKey }
  ]) {
    await assert.rejects(() => dropAutomationDatabases({ ...input, adapter }), /runKey|formal|prefix|database|Redis|epoch/i);
  }
  assert.deepEqual(calls, []);
});

test('cleanup rejects an observed server mismatch before dropping databases', async () => {
  const calls = [];
  const adapter = {
    inspectServer: async () => ({ host: '127.0.0.1', port: 3306, serverUuid: 'other-server' }),
    dropDatabase: async () => calls.push('drop'),
    releaseRedisLogicalDb: async () => calls.push('redis')
  };
  await assert.rejects(
    () => dropAutomationDatabases({ manifest: baseManifest, runKey: baseManifest.runKey, adapter }),
    /server identity mismatch/i
  );
  assert.deepEqual(calls, []);
});
