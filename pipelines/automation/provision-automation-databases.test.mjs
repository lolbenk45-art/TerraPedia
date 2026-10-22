import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDurableRunKeyRegistry } from './automation-database-contract.mjs';
import { buildAutomationDatabaseNames } from './automation-database-contract.mjs';
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
    grantIsolatedApiTablePrivileges: async (input) => calls.push(['grantIsolatedApiTablePrivileges', input]),
    verifyProvisionerGrants: async (input) => ({
      ...input,
      t2WriteDenied: true,
      ...(input.apiTableGrantsPending === true ? { apiDatabaseAccountsVerified: true } : {}),
      ...(input.apiTableGrantsPending === false ? { apiAccountsVerified: true } : {}),
    }),
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

test('isolated API provisioning requires verified migration hashes and schema fingerprints', async (t) => {
  const value = setup(t, 't1');
  await assert.rejects(() => provisionAutomationDatabases({
    profile: 't1', runId: 'migration-evidence-required', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t1', sourceSnapshot: { snapshotId: 'snapshot-1' },
    requireMigrationEvidence: true,
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' }
  }), /migration evidence|fingerprint/i);
  assert.equal(value.calls.filter(([kind]) => kind === 'dropDatabase').length, 3);
  assert.equal(value.calls.filter(([kind]) => kind === 'releaseRedisLogicalDb').length, 1);
});

test('isolated API provisioning carries verified migration evidence into the ready manifest', async (t) => {
  const value = setup(t, 't1');
  const grantOrder = [];
  value.adapter.verifyProvisionerGrants = async (input) => {
    grantOrder.push(['verify', input.apiTableGrantsPending === true]);
    return { ...input, t2WriteDenied: true, ...(input.apiTableGrantsPending === true
      ? { apiDatabaseAccountsVerified: true } : { apiAccountsVerified: true }) };
  };
  value.adapter.grantIsolatedApiTablePrivileges = async (input) => grantOrder.push(['table-grants', input.runKey]);
  value.adapter.getApiAccountGrantEvidence = () => ({
    status: 'verified',
    domain: 'items',
    databases: {
      local: value.calls.find(([kind, input]) => kind === 'createDatabase' && input.role === 'local')?.[1]?.name,
      maint: value.calls.find(([kind, input]) => kind === 'createDatabase' && input.role === 'maint')?.[1]?.name,
      relation: value.calls.find(([kind, input]) => kind === 'createDatabase' && input.role === 'relation')?.[1]?.name,
    },
    apiReadonly: { username: 'automation_apiro_0123456789ab', grantCount: 3, grantsSha256: `sha256:${'d'.repeat(64)}` },
    apiV2Test: { username: 'automation_apiv2_0123456789ab', grantCount: 4, grantsSha256: `sha256:${'e'.repeat(64)}` },
  });
  value.adapter.migrateDatabase = async (input) => {
    value.calls.push(['migrateDatabase', input]);
    grantOrder.push(['migrate', input.role]);
    return {
      role: input.role,
      database: input.name,
      inputManifestHash: `sha256:${'a'.repeat(64)}`,
      appliedSqlSha256: [`sha256:${'b'.repeat(64)}`],
      schemaFingerprint: { database: input.name, tablesSha256: `sha256:${'c'.repeat(64)}`, tableCount: 1 },
    };
  };
  value.adapter.getMigrationEvidence = () => ({
    status: 'verified',
    inputManifest: { schemaVersion: 1 },
    inputManifestHash: `sha256:${'a'.repeat(64)}`,
    applied: value.calls.filter(([kind]) => kind === 'migrateDatabase').map(([, input]) => ({
      role: input.role,
      database: input.name,
      inputManifestHash: `sha256:${'a'.repeat(64)}`,
      appliedSqlSha256: [`sha256:${'b'.repeat(64)}`],
      schemaFingerprint: { database: input.name, tablesSha256: `sha256:${'c'.repeat(64)}`, tableCount: 1 },
    })),
  });
  value.adapter.refreshMigrationSchemaFingerprints = async () => value.adapter.getMigrationEvidence();
  const manifest = await provisionAutomationDatabases({
    profile: 't1', runId: 'migration-evidence-valid', mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t1', sourceSnapshot: { snapshotId: 'snapshot-1' },
    requireMigrationEvidence: true,
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' }
  });
  assert.equal(manifest.migrationEvidence.status, 'verified');
  assert.equal(manifest.migrationEvidence.applied.length, 3);
  assert.equal(manifest.apiAccountGrantEvidence.status, 'verified');
  assert.equal(manifest.apiAccountGrantEvidence.apiReadonly.grantCount, 3);
  assert.deepEqual(grantOrder.map(([kind]) => kind), [
    'verify', 'migrate', 'migrate', 'migrate', 'table-grants', 'verify',
  ]);
  assert.deepEqual(grantOrder[4], ['table-grants', manifest.runKey]);
  assert.deepEqual(JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')).migrationEvidence, manifest.migrationEvidence);
  assert.deepEqual(JSON.parse(fs.readFileSync(value.manifestPath, 'utf8')).apiAccountGrantEvidence, manifest.apiAccountGrantEvidence);
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

test('T1 provisioning can skip bounded snapshot copying when an exact dependency manifest is supplied', async (t) => {
  const value = setup(t, 't1');
  const runId = 'e8pr-bosses-20261017-v1';
  const names = buildAutomationDatabaseNames({ profile: 't1', runId, mappings: value.mappings });
  value.adapter.seedExactDependencies = async ({ manifest, targetDatabases, runKey }) => {
    value.calls.push(['seedExactDependencies', { manifest, targetDatabases, runKey }]);
    return {
      status: 'verified', manifestSha256: `sha256:${'f'.repeat(64)}`, readbackVerified: true,
      dependencySeedRows: 1, dependencies: [],
    };
  };
  const dependencyManifest = {
    schemaVersion: 1, domain: 'bosses', runId, runKey: names.runKey,
    dependencies: [{
      id: 'boss-items', source: { database: 'terria_v1_local', table: 'items' },
      target: { database: names.local, table: 'items' }, keyColumns: ['id'],
      keyValues: [{ id: 42 }], columns: ['id', 'internal_name'],
      rowHashes: [{ key: { id: 42 }, sha256: `sha256:${'a'.repeat(64)}` }], expectedRowCount: 1,
    }],
  };
  await provisionAutomationDatabases({
    profile: 't1', runId, mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t1', sourceSnapshot: { snapshotId: 'snapshot-1' },
    dependencyManifest,
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' },
  });
  assert.equal(value.calls.some(([kind]) => kind === 'copyReadOnlySnapshot'), false);
  assert.equal(value.calls.some(([kind]) => kind === 'seedExactDependencies'), true);
});

test('T1 dependency manifest factory uses the run-owned read-only account before database creation', async (t) => {
  const value = setup(t, 't1');
  const runId = 'e8pr-bosses-20261017-v1';
  value.adapter.readonlyClient = { query: async () => '' };
  const names = buildAutomationDatabaseNames({ profile: 't1', runId, mappings: value.mappings });
  const dependencyManifest = {
    schemaVersion: 1,
    domain: 'bosses',
    runId,
    runKey: names.runKey,
    dependencies: [{
      id: 'boss-items', source: { database: 'terria_v1_local', table: 'items' },
      target: { database: names.local, table: 'items' }, keyColumns: ['id'], keyValues: [{ id: 42 }],
      columns: ['id', 'internal_name'], rowHashes: [{ key: { id: 42 }, sha256: `sha256:${'a'.repeat(64)}` }], expectedRowCount: 1,
    }],
  };
  value.adapter.verifyReadOnlySnapshot = async ({ dependencyManifest: received } = {}) => {
    value.calls.push(['verifyReadOnlySnapshot', received]);
    return {
      snapshotId: 'snapshot-1', profile: 't2-readonly', readOnly: true, scrubbed: true,
      snapshotHash: `sha256:${'a'.repeat(64)}`, credentialRole: 'automation-readonly',
      serverFingerprints: [
        { role: 'local', name: 'terria_v1_local', host: 'db', port: 3306, serverUuid: 'server-local' },
        { role: 'maint', name: 'terria_v1_maint', host: 'db', port: 3306, serverUuid: 'server-maint' },
        { role: 'relation', name: 'terria_v1_relation', host: 'db', port: 3306, serverUuid: 'server-relation' },
      ],
      databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' },
    };
  };
  value.adapter.seedExactDependencies = async ({ manifest }) => {
    value.calls.push(['seedExactDependencies', manifest]);
    return { status: 'verified', readbackVerified: true, dependencySeedRows: 1, dependencies: [] };
  };
  const result = await provisionAutomationDatabases({
    profile: 't1', runId, mappings: value.mappings, adapter: value.adapter,
    manifestPath: value.manifestPath, environmentId: 'env-t1', sourceSnapshot: { snapshotId: 'snapshot-1' },
    dependencyManifestFactory: async ({ readonlyClient, databases, runKey }) => {
      assert.equal(readonlyClient, value.adapter.readonlyClient);
      assert.deepEqual(databases, { local: names.local, maint: names.maint, relation: names.relation });
      assert.equal(runKey, names.runKey);
      value.calls.push(['dependencyManifestFactory']);
      return dependencyManifest;
    },
    expectedServerIdentity: { host: '127.0.0.1', port: 3306, serverUuid: 'server-t1', redisHost: '127.0.0.1', redisPort: 6379, environmentId: 'env-t1' },
  });
  assert.deepEqual(value.calls.map(([kind]) => kind).slice(0, 3), [
    'dependencyManifestFactory', 'verifyReadOnlySnapshot', 'createDatabase',
  ]);
  assert.equal(result.dependencyManifest.dependencies[0].id, 'boss-items');
  assert.equal(result.dependencySeedEvidence.status, 'verified');
  assert.equal(value.calls.some(([kind]) => kind === 'copyReadOnlySnapshot'), false);
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
