import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDurableRunKeyRegistry } from './automation-database-contract.mjs';
import { provisionAutomationDatabases } from './provision-automation-databases.mjs';

function setup(t, profile = 't0') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-provision-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const adapter = {
    inspectServer: async () => ({ host: '127.0.0.1', port: 3306, serverUuid: `server-${profile}`, redisHost: '127.0.0.1', redisPort: 6379, environmentId: `env-${profile}` }),
    inspectProvisioner: async () => ({ credentialRole: 'automation-provisioner' }),
    allocateRedisLogicalDb: async () => ({ host: '127.0.0.1', port: 6379, logicalDb: profile === 't0' ? 31 : 32, reservationToken: `reservation-${profile}` }),
    verifyRedisReservation: async (input) => ({ ...input, exclusive: true, ownerRunKey: input.runKey }),
    createDatabase: async (input) => calls.push(['createDatabase', input]),
    migrateDatabase: async (input) => calls.push(['migrateDatabase', input]),
    grantProvisioner: async (input) => calls.push(['grantProvisioner', input]),
    verifyProvisionerGrants: async (input) => ({ ...input, t2WriteDenied: true }),
    verifyReadOnlySnapshot: async () => ({
      snapshotId: 'snapshot-1', profile: 't2-readonly', readOnly: true, scrubbed: true,
      snapshotHash: `sha256:${'a'.repeat(64)}`, credentialRole: 'automation-readonly', serverFingerprints: [
        { role: 'local', name: 'terria_v1_local', host: 'db', port: 3306, serverUuid: 'server-local' },
        { role: 'maint', name: 'terria_v1_maint', host: 'db', port: 3306, serverUuid: 'server-maint' },
        { role: 'relation', name: 'terria_v1_relation', host: 'db', port: 3306, serverUuid: 'server-relation' }
      ],
      databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' }
    }),
    copyReadOnlySnapshot: async (input) => calls.push(['copyReadOnlySnapshot', input]),
    dropDatabase: async (input) => calls.push(['dropDatabase', input]),
    releaseRedisLogicalDb: async (input) => calls.push(['releaseRedisLogicalDb', input])
  };
  return {
    directory,
    calls,
    adapter,
    mappings: openDurableRunKeyRegistry(path.join(directory, 'run-keys.json')),
    manifestPath: path.join(directory, `manifest-${profile}.json`),
    profile
  };
}

test('provisioning creates exactly three runKey-bound databases through an injected adapter', async (t) => {
  const value = setup(t);
  const manifest = await provisionAutomationDatabases({
    profile: value.profile,
    runId: 'provision-run',
    mappings: value.mappings,
    adapter: value.adapter,
    manifestPath: value.manifestPath,
    environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  });
  assert.equal(value.calls.filter(([kind]) => kind === 'createDatabase').length, 3);
  assert.equal(value.calls.filter(([kind]) => kind === 'migrateDatabase').length, 3);
  assert.equal(value.calls.filter(([kind]) => kind === 'grantProvisioner').length, 3);
  assert.equal(value.calls.some(([kind]) => kind === 'copyReadOnlySnapshot'), false);
  const firstGrant = value.calls.findIndex(([kind]) => kind === 'grantProvisioner');
  const lastCreate = value.calls.map(([kind]) => kind).lastIndexOf('createDatabase');
  const firstMigration = value.calls.findIndex(([kind]) => kind === 'migrateDatabase');
  assert.ok(firstGrant > lastCreate, 'all isolated schemas must exist before grants are applied');
  assert.ok(firstMigration > firstGrant, 'schema migration must run after grant verification');
  assert.deepEqual(JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')), manifest);
});

test('T1 provisioning copies only an explicit scrubbed read-only snapshot', async (t) => {
  const value = setup(t, 't1');
  await provisionAutomationDatabases({
    profile: 't1', runId: 'acceptance-run', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t1',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' },
    sourceSnapshot: { snapshotId: 'snapshot-1' }
  });
  const copy = value.calls.find(([kind]) => kind === 'copyReadOnlySnapshot');
  assert.ok(copy);
  assert.equal(copy[1].sourceSnapshot.profile, 't2-readonly');
  assert.equal(copy[1].sourceSnapshot.readOnly, true);
  assert.equal(copy[1].sourceSnapshot.scrubbed, true);
});

test('provisioning compensates created databases and Redis after a partial migration failure', async (t) => {
  const value = setup(t);
  let migrations = 0;
  value.adapter.migrateDatabase = async (input) => {
    value.calls.push(['migrateDatabase', input]);
    migrations += 1;
    if (migrations === 2) throw new Error('migration failed');
  };
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'partial-run', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /migration failed/);
  assert.equal(value.calls.filter(([kind]) => kind === 'dropDatabase').length, 3);
  assert.equal(value.calls.filter(([kind]) => kind === 'releaseRedisLogicalDb').length, 1);
  const released = value.calls.find(([kind]) => kind === 'releaseRedisLogicalDb')[1];
  assert.equal(released.epoch, `epoch-${JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')).runKey}`);
  assert.equal(released.environmentId, 'env-t0');
  assert.equal(released.exclusive, true);
  assert.equal(released.ownerRunKey, JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')).runKey);
  const failureManifest = JSON.parse(fs.readFileSync(value.manifestPath, 'utf8'));
  assert.equal(failureManifest.provisioning.state, 'compensated');
  assert.deepEqual(failureManifest.provisioning.createdRoles, []);
});

test('provisioning compensates an attempted database when create reports a post-commit failure', async (t) => {
  const value = setup(t);
  value.adapter.createDatabase = async (input) => {
    value.calls.push(['createDatabase', input]);
    throw new Error('create response lost');
  };
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'create-uncertain', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /create response lost/);
  assert.equal(value.calls.filter(([kind]) => kind === 'dropDatabase').length, 1);
  assert.equal(JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')).provisioning.state, 'compensated');
});

test('provisioning rejects incomplete or mismatched observed identities before database creation', async (t) => {
  const value = setup(t);
  value.adapter.inspectServer = async () => ({ host: '127.0.0.1', port: 3306, serverUuid: 'wrong' });
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'wrong-server', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /server|redis|identity/i);
  assert.equal(value.calls.some(([kind]) => kind === 'createDatabase'), false);
});

test('provisioning rejects manifest collisions and unverified grants or Redis reservations', async (t) => {
  const collision = setup(t);
  fs.writeFileSync(collision.manifestPath, '{}');
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'collision', mappings: collision.mappings, adapter: collision.adapter,
    manifestPath: collision.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /manifest.*exists/i);
  assert.equal(collision.calls.length, 0);

  const grants = setup(t);
  grants.adapter.verifyProvisionerGrants = async (input) => ({ ...input, t2WriteDenied: false });
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'bad-grants', mappings: grants.mappings, adapter: grants.adapter,
    manifestPath: grants.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /grant|boundary/i);
  assert.equal(grants.calls.filter(([kind]) => kind === 'createDatabase').length, 3);
  assert.equal(grants.calls.filter(([kind]) => kind === 'dropDatabase').length, 3);
  assert.equal(grants.calls.filter(([kind]) => kind === 'releaseRedisLogicalDb').length, 1);

  const redis = setup(t);
  redis.adapter.verifyRedisReservation = async (input) => ({ ...input, ownerRunKey: 'other-run' });
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't0', runId: 'bad-redis', mappings: redis.mappings, adapter: redis.adapter,
    manifestPath: redis.manifestPath, environmentId: 'env-t0',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t0', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t0' }
  }), /Redis.*reservation/i);
  assert.equal(redis.calls.some(([kind]) => kind === 'createDatabase'), false);
  assert.equal(redis.calls.filter(([kind]) => kind === 'releaseRedisLogicalDb').length, 0);
  const cleanupRecord = JSON.parse(fs.readFileSync(redis.manifestPath, 'utf8'));
  assert.equal(cleanupRecord.recordType, 'redis-reservation-cleanup');
  assert.equal(cleanupRecord.provisioning.state, 'cleanup_required');
});

test('provisioning refuses missing adapters, formal fallback, and unsafe T1 sources', async (t) => {
  const value = setup(t, 't1');
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't1', runId: 'missing-adapter', mappings: value.mappings,
    manifestPath: value.manifestPath
  }), /adapter/i);
  value.adapter.verifyReadOnlySnapshot = async ({ snapshotId }) => ({
    snapshotId, profile: 't2-readonly', readOnly: false, scrubbed: true,
    snapshotHash: 'sha256:unsafe', credentialRole: 'automation-readonly', serverFingerprints: ['server-formal']
  });
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't1', runId: 'unsafe-source', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, sourceSnapshot: { snapshotId: 'formal' }, environmentId: 'env-t1',
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' }
  }), /snapshot|read.only|scrub/i);
  assert.equal(value.calls.length, 0);
});
