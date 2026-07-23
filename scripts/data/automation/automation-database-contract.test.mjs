import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DATABASE_ROLES,
  TEST_PROFILES,
  FORMAL_DATABASES,
  openDurableRunKeyRegistry,
  normalizeRunKey,
  buildAutomationDatabaseNames,
  assertDatabasePurpose,
  assertNoFormalDatabaseNames
} from './automation-database-contract.mjs';

function createRegistry(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-run-key-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'run-key-mappings.json');
  return { file, registry: openDurableRunKeyRegistry(file) };
}

test('database roles and test profiles are closed enums', () => {
  assert.deepEqual(DATABASE_ROLES, ['maint', 'relation', 'local']);
  assert.deepEqual(TEST_PROFILES, ['unit', 't0', 't1', 't2-readonly']);
});

test('normalizeRunKey creates a maximum-20-character slug plus lowercase sha256 suffix', (t) => {
  const { file, registry: mappings } = createRegistry(t);
  const runKey = normalizeRunKey('Nightly crawler / 2026-07-23 with spaces', { mappings });
  assert.match(runKey, /^[a-z0-9]{1,3}_[0-9a-f]{16}$/);
  assert.ok(runKey.length <= 20);
  assert.equal(runKey, normalizeRunKey('Nightly crawler / 2026-07-23 with spaces', { mappings }));
  assert.equal(normalizeRunKey('Nightly crawler / 2026-07-23 with spaces', {
    mappings: openDurableRunKeyRegistry(file)
  }), runKey);
});

test('long run ids still produce database identifiers within the MySQL limit', (t) => {
  const names = buildAutomationDatabaseNames({ profile: 't1', runId: 'a'.repeat(200), mappings: createRegistry(t).registry });
  assert.equal(Object.values(names).every((value) => value.length <= 64), true);
});

test('normalizeRunKey rejects duplicate or colliding mappings', (t) => {
  const mappings = createRegistry(t).registry;
  const runKey = normalizeRunKey('same-run', { mappings });
  assert.equal(normalizeRunKey('same-run', { mappings }), runKey);
  assert.throws(
    () => normalizeRunKey('different-run', { mappings, forcedRunKey: runKey }),
    /hash|collision|duplicate/i
  );
  assert.throws(() => normalizeRunKey('missing-registry'), /mapping|registry/i);
  assert.throws(() => normalizeRunKey('memory-only', { mappings: new Map() }), /durable|registry/i);
});

test('test profiles cannot resolve any formal database', (t) => {
  assert.deepEqual(Object.values(FORMAL_DATABASES), [
    'terria_v1_local',
    'terria_v1_maint',
    'terria_v1_relation'
  ]);
  for (const profile of ['unit', 't0', 't1']) {
    const names = profile === 'unit'
      ? []
      : Object.values(buildAutomationDatabaseNames({ profile, runId: `run-${profile}`, mappings: createRegistry(t).registry }));
    assertNoFormalDatabaseNames(names);
  }
});

test('wrong profile, purpose, credential, server, or redis identity fails closed', (t) => {
  const names = buildAutomationDatabaseNames({ profile: 't0', runId: 'run-1', mappings: createRegistry(t).registry });
  const trusted = {
    profile: 't0', runKey: names.runKey, environmentId: 'env-t0',
    databases: Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
      name: names[role], host: '127.0.0.1', port: 3306, serverUuid: 'server-t0',
      purposeToken: `automation-${names.runKey}`, credentialRole: 'automation-test-writer'
    }])),
    redis: { host: '127.0.0.1', port: 6380, logicalDb: 12, epoch: `epoch-${names.runKey}` }
  };
  const observed = {
    profile: 't0', runKey: names.runKey, environmentId: 'env-t0',
    databases: Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
      role,
      name: names[role],
      host: '127.0.0.1',
      port: 3306,
      serverUuid: 'server-t0',
      purposeToken: `automation-${names.runKey}`,
      credentialRole: 'automation-test-writer', environmentId: 'env-t0'
    }])),
    redis: { host: '127.0.0.1', port: 6380, logicalDb: 12, epoch: `epoch-${names.runKey}` }
  };
  assert.doesNotThrow(() => assertDatabasePurpose(trusted, observed, 't0', names.runKey));
  assert.throws(() => assertDatabasePurpose(trusted, {
    ...observed,
    databases: { ...observed.databases, local: { ...observed.databases.local, role: 'maint' } }
  }, 't0', names.runKey), /role/i);
  assert.throws(() => assertDatabasePurpose(trusted, {
    ...observed,
    databases: { ...observed.databases, formalEscape: { name: 'terria_v1_local' } }
  }, 't0', names.runKey), /unknown.*role|database.*set|extra/i);
  for (const [path, mutate] of [
    ['profile', (next) => ({ ...next, profile: 't2-readonly' })],
    ['database', (next) => ({ ...next, databases: { ...next.databases, local: { ...next.databases.local, name: 'terria_v1_local' } } })],
    ['server', (next) => ({ ...next, databases: { ...next.databases, local: { ...next.databases.local, serverUuid: 'other' } } })],
    ['host', (next) => ({ ...next, databases: { ...next.databases, local: { ...next.databases.local, host: 'localhost' } } })],
    ['purpose', (next) => ({ ...next, databases: { ...next.databases, local: { ...next.databases.local, purposeToken: 'formal' } } })],
    ['credential', (next) => ({ ...next, databases: { ...next.databases, local: { ...next.databases.local, credentialRole: 'runtime-writer' } } })],
    ['environment', (next) => ({ ...next, environmentId: 'other-environment' })],
    ['redis', (next) => ({ ...next, redis: { ...next.redis, logicalDb: 0, epoch: 'formal' } })],
    ['redis', (next) => ({ ...next, redis: { ...next.redis, host: 'other-redis', port: 6399 } })]
  ]) {
    assert.throws(() => assertDatabasePurpose(trusted, mutate(observed), 't0', names.runKey), new RegExp(path, 'i'));
  }
});

test('missing expected database or redis fingerprints fail closed', (t) => {
  const names = buildAutomationDatabaseNames({ profile: 't0', runId: 'fp', mappings: createRegistry(t).registry });
  const trusted = {
    profile: 't0', runKey: names.runKey, environmentId: 'env-t0',
    databases: Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
      name: names[role], host: '127.0.0.1', port: 3306, serverUuid: 'server-t0',
      purposeToken: `automation-${names.runKey}`, credentialRole: 'automation-test-writer'
    }])),
    redis: { host: '127.0.0.1', port: 6380, logicalDb: 12, epoch: `epoch-${names.runKey}` }
  };
  const observed = {
    profile: 't0', runKey: names.runKey, environmentId: 'env-t0',
    databases: Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
      role, name: names[role], host: '127.0.0.1', port: 3306, serverUuid: 'server-t0',
      purposeToken: `automation-${names.runKey}`, credentialRole: 'automation-test-writer', environmentId: 'env-t0'
    }])),
    redis: { host: '127.0.0.1', port: 6380, logicalDb: 12, epoch: `epoch-${names.runKey}` }
  };
  delete trusted.redis;
  assert.throws(() => assertDatabasePurpose(trusted, observed, 't0', names.runKey), /trusted|redis|fingerprint|identity/i);
});

test('purpose validation allows explicitly fingerprinted cross-server database sets', (t) => {
  const names = buildAutomationDatabaseNames({ profile: 't1', runId: 'xsv', mappings: createRegistry(t).registry });
  const trusted = { profile: 't1', runKey: names.runKey, environmentId: 'env-t1',
    databases: Object.fromEntries(DATABASE_ROLES.map((role, index) => [role, {
      name: names[role], host: `db-${role}.internal`, port: 3306 + index, serverUuid: `server-${role}`,
      purposeToken: `automation-${names.runKey}`, credentialRole: 'automation-acceptance-writer'
    }])),
    redis: { host: 'redis.internal', port: 6380, logicalDb: 13, epoch: `epoch-${names.runKey}` } };
  const observed = {
    profile: 't1', runKey: names.runKey, environmentId: 'env-t1',
    databases: Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
      role, ...trusted.databases[role], environmentId: 'env-t1'
    }])),
    redis: { host: 'redis.internal', port: 6380, logicalDb: 13, epoch: `epoch-${names.runKey}` }
  };
  assert.doesNotThrow(() => assertDatabasePurpose(trusted, observed, 't1', names.runKey));
});
