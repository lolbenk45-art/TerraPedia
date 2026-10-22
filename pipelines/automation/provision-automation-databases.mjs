import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAutomationTestManifest,
  assertReadOnlySourceSnapshot
} from './automation-test-profile.mjs';
import { buildAutomationDatabaseNames, normalizeRunKey } from './automation-database-contract.mjs';
import { validateDependencyManifest } from './eight-domain-dependency-seeder.mjs';

const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'inspectServer', 'inspectProvisioner', 'allocateRedisLogicalDb', 'verifyRedisReservation',
  'createDatabase', 'migrateDatabase', 'grantProvisioner', 'verifyProvisionerGrants',
  'dropDatabase', 'releaseRedisLogicalDb'
]);

function requireAdapter(adapter, profile) {
  if (!adapter || REQUIRED_ADAPTER_METHODS.some((method) => typeof adapter[method] !== 'function')) {
    throw new Error('an explicit automation provisioning adapter is required');
  }
  if (profile === 't1' && typeof adapter.copyReadOnlySnapshot !== 'function') {
    throw new Error('T1 provisioning adapter must copy a read-only snapshot');
  }
  if (profile === 't1' && typeof adapter.verifyReadOnlySnapshot !== 'function') {
    throw new Error('T1 provisioning adapter must verify a read-only snapshot');
  }
}

function reserveManifestPath(manifestPath) {
  const target = path.resolve(String(manifestPath ?? ''));
  if (!manifestPath) throw new Error('manifestPath is required');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const lockFile = `${target}.lock`;
  if (fs.existsSync(target)) throw new Error('automation manifest already exists');
  const lock = fs.openSync(lockFile, 'wx', 0o600);
  if (fs.existsSync(target)) {
    fs.closeSync(lock);
    fs.rmSync(lockFile, { force: true });
    throw new Error('automation manifest already exists');
  }
  return Object.freeze({
    target,
    release() {
      fs.closeSync(lock);
      fs.rmSync(lockFile, { force: true });
    }
  });
}

function writeManifestAtomic(reservation, manifest) {
  const temporary = `${reservation.target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, reservation.target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function assertObservedServer(expected, observed) {
  if (!expected || !observed) throw new Error('trusted and observed server identity are required');
  for (const field of ['host', 'port', 'serverUuid', 'redisHost', 'redisPort', 'environmentId']) {
    if (expected[field] === undefined || observed[field] !== expected[field]) {
      throw new Error(`server identity mismatch for ${field}`);
    }
  }
  if (!Number.isInteger(expected.port) || expected.port <= 0 || expected.port > 65535
    || !Number.isInteger(expected.redisPort) || expected.redisPort <= 0 || expected.redisPort > 65535) {
    throw new Error('trusted server ports are invalid');
  }
}

function assertRedisReservation(expected, observed, runKey) {
  for (const field of ['host', 'port', 'logicalDb', 'epoch', 'reservationToken', 'environmentId']) {
    if (expected?.[field] === undefined || observed?.[field] !== expected[field]) {
      throw new Error(`Redis reservation identity mismatch for ${field}`);
    }
  }
  if (!Number.isInteger(observed.logicalDb) || observed.logicalDb < 1
    || observed.epoch !== `epoch-${runKey}` || !String(observed.reservationToken).trim()
    || observed.exclusive !== true || observed.ownerRunKey !== runKey) {
    throw new Error('Redis reservation is invalid');
  }
}

function assertMigrationEvidence(evidence, databases, runKey) {
  if (!evidence || evidence.status !== 'verified'
      || !/^sha256:[a-f0-9]{64}$/.test(evidence.inputManifestHash ?? '')
      || evidence.inputManifest?.schemaVersion !== 1
      || !Array.isArray(evidence.applied) || evidence.applied.length !== 3) {
    throw new Error('verified migration evidence and schema fingerprints are required for isolated API provisioning');
  }
  const seen = new Set();
  for (const [role, database] of Object.entries(databases)) {
    const row = evidence.applied.find((entry) => entry?.role === role && entry?.database === database.name);
    if (!row || seen.has(role) || row.inputManifestHash !== evidence.inputManifestHash
        || !Array.isArray(row.appliedSqlSha256) || row.appliedSqlSha256.length === 0
        || row.appliedSqlSha256.some((hash) => !/^sha256:[a-f0-9]{64}$/.test(hash ?? ''))
        || row.schemaFingerprint?.database !== database.name
        || !/^sha256:[a-f0-9]{64}$/.test(row.schemaFingerprint?.tablesSha256 ?? '')
        || !Number.isInteger(row.schemaFingerprint?.tableCount) || row.schemaFingerprint.tableCount < 1
        || !database.name.includes(`_${runKey}_`)) {
      throw new Error(`migration evidence or schema fingerprint is invalid for ${role}`);
    }
    seen.add(role);
  }
  return Object.freeze({
    status: 'verified',
    inputManifest: evidence.inputManifest,
    inputManifestHash: evidence.inputManifestHash,
    applied: Object.freeze(evidence.applied.map((entry) => Object.freeze({
      role: entry.role,
      database: entry.database,
      inputManifestHash: entry.inputManifestHash,
      appliedSqlSha256: Object.freeze([...entry.appliedSqlSha256]),
      schemaFingerprint: Object.freeze({ ...entry.schemaFingerprint }),
    }))),
  });
}

function assertIsolatedApiGrantEvidence(evidence, databases) {
  const expectedDatabases = Object.fromEntries(
    Object.entries(databases ?? {}).map(([role, database]) => [role, database?.name]),
  );
  if (!evidence || evidence.status !== 'verified'
      || !databases || Object.keys(databases).sort().join(',') !== 'local,maint,relation'
      || !['local', 'maint', 'relation'].every((role) => evidence.databases?.[role] === expectedDatabases[role])
      || Object.keys(evidence.databases ?? {}).sort().join(',') !== 'local,maint,relation') {
    throw new Error('verified isolated API account grant evidence is required before T1 API acceptance');
  }
  for (const role of ['apiReadonly', 'apiV2Test']) {
    const account = evidence[role];
    if (!account || !/^[a-z0-9_]+$/.test(account.username ?? '')
        || !Number.isInteger(account.grantCount) || account.grantCount < 1
        || !/^sha256:[a-f0-9]{64}$/.test(account.grantsSha256 ?? '')) {
      throw new Error(`isolated API ${role} grant evidence is invalid`);
    }
  }
  if (evidence.apiReadonly.grantCount !== 3 || evidence.apiV2Test.grantCount < 4) {
    throw new Error('isolated API accounts do not have the required exact read and V2 table grants');
  }
  return Object.freeze({
    status: 'verified',
    domain: String(evidence.domain ?? ''),
    databases: Object.freeze({ ...evidence.databases }),
    apiReadonly: Object.freeze({ ...evidence.apiReadonly }),
    apiV2Test: Object.freeze({ ...evidence.apiV2Test }),
  });
}

function withProvisioningState(manifest, state, createdDatabases, cleanupErrors = []) {
  return {
    ...manifest,
    provisioning: {
      state,
      createdRoles: createdDatabases.map((database) => database.role),
      cleanupErrors
    }
  };
}

export async function provisionAutomationDatabases({
  profile,
  runId,
  mappings,
  adapter,
  manifestPath,
  environmentId,
  sourceSnapshot,
  dependencyManifest = null,
  dependencyManifestFactory = null,
  expectedServerIdentity,
  requireMigrationEvidence = adapter?.migrationEvidenceRequired === true,
} = {}) {
  requireAdapter(adapter, profile);
  if (dependencyManifest != null && dependencyManifestFactory != null) {
    throw new Error('provide a dependency manifest or a dependency manifest factory, not both');
  }
  const manifestReservation = reserveManifestPath(manifestPath);
  try {
  if (profile === 't1' && !String(sourceSnapshot?.snapshotId ?? '').trim()) {
    throw new Error('an explicit T1 source snapshot identity is required');
  }
  const observedServer = await adapter.inspectServer();
  assertObservedServer(expectedServerIdentity, observedServer);
  if (expectedServerIdentity.environmentId !== environmentId) {
    throw new Error('trusted environmentId does not match the requested environment');
  }
  const observedProvisioner = await adapter.inspectProvisioner();
  if (observedProvisioner?.credentialRole !== 'automation-provisioner') {
    throw new Error('provisioner credential role mismatch');
  }
  const runKey = normalizeRunKey(runId, { mappings });
  const derivedNames = buildAutomationDatabaseNames({ profile, runId, mappings });
  const derivedDatabaseNames = Object.fromEntries(['local', 'maint', 'relation'].map((role) => [role, derivedNames[role]]));
  const producedDependencyManifest = dependencyManifestFactory == null
    ? dependencyManifest
    : await dependencyManifestFactory({
      runId,
      runKey,
      databases: Object.freeze({ ...derivedDatabaseNames }),
      readonlyClient: adapter.readonlyClient,
    });
  const verifiedDependencyManifest = producedDependencyManifest == null
    ? null
    : validateDependencyManifest(producedDependencyManifest, { databases: derivedDatabaseNames });
  let verifiedSnapshot;
  if (profile === 't1') {
    verifiedSnapshot = await adapter.verifyReadOnlySnapshot({
      snapshotId: sourceSnapshot.snapshotId,
      ...(verifiedDependencyManifest ? { dependencyManifest: verifiedDependencyManifest } : {}),
    });
    if (verifiedSnapshot?.snapshotId !== sourceSnapshot.snapshotId) throw new Error('snapshot identity mismatch');
    assertReadOnlySourceSnapshot(verifiedSnapshot);
  }
  let redisReservation;
  let redisReservationVerified = false;
  let verifiedRedisIdentity;
  let manifest;
  const createdDatabases = [];
  try {
    redisReservation = await adapter.allocateRedisLogicalDb({ profile, runId, runKey });
    if (redisReservation?.host !== expectedServerIdentity.redisHost
      || redisReservation?.port !== expectedServerIdentity.redisPort) {
      throw new Error('Redis allocator endpoint mismatch');
    }
    const expectedRedis = {
      ...redisReservation,
      host: expectedServerIdentity.redisHost,
      port: expectedServerIdentity.redisPort,
      epoch: `epoch-${runKey}`,
      environmentId
    };
    const observedRedis = await adapter.verifyRedisReservation({ ...expectedRedis, runKey });
    assertRedisReservation(expectedRedis, observedRedis, runKey);
    redisReservationVerified = true;
    verifiedRedisIdentity = {
      ...expectedRedis,
      exclusive: observedRedis.exclusive,
      ownerRunKey: observedRedis.ownerRunKey
    };
    manifest = buildAutomationTestManifest({
      profile,
      runId,
      mappings,
      environmentId,
      host: observedServer.host,
      port: observedServer.port,
      serverUuid: observedServer.serverUuid,
      redisIdentity: expectedRedis,
      sourceSnapshot: verifiedSnapshot
    });
    const provisionedDatabaseNames = Object.fromEntries(Object.entries(manifest.databases).map(([role, database]) => [role, database.name]));
    if (!['local', 'maint', 'relation'].every((role) => derivedDatabaseNames[role] === provisionedDatabaseNames[role])) {
      throw new Error('derived dependency schema set differs from the provisioned manifest');
    }
    manifest = Object.freeze({ ...manifest, dependencyManifest: verifiedDependencyManifest });
    writeManifestAtomic(manifestReservation, withProvisioningState(manifest, 'provisioning', createdDatabases));
    for (const database of Object.values(manifest.databases)) {
      createdDatabases.push(database);
      writeManifestAtomic(manifestReservation, withProvisioningState(manifest, 'provisioning', createdDatabases));
      await adapter.createDatabase({ ...database, runKey: manifest.runKey, profile });
    }
    // MySQL may not apply a database-level grant issued before CREATE DATABASE.
    // Create all run-owned schemas first, then grant and verify their exact scope.
    for (const database of Object.values(manifest.databases)) {
      await adapter.grantProvisioner({
        credentialRole: manifest.provisioner.credentialRole,
        allowedPrefix: manifest.provisioner.allowedPrefix,
        deniedDatabases: manifest.provisioner.deniedDatabases,
        name: database.name,
        role: database.role,
        runKey: manifest.runKey
      });
    }
    let observedGrants = await adapter.verifyProvisionerGrants({
      credentialRole: manifest.provisioner.credentialRole,
      allowedPrefix: manifest.provisioner.allowedPrefix,
      deniedDatabases: manifest.provisioner.deniedDatabases,
      runKey: manifest.runKey,
      apiTableGrantsPending: requireMigrationEvidence,
    });
    if (observedGrants?.credentialRole !== manifest.provisioner.credentialRole
      || observedGrants.allowedPrefix !== manifest.provisioner.allowedPrefix
      || observedGrants.t2WriteDenied !== true
      || !Array.isArray(observedGrants.deniedDatabases)
      || manifest.provisioner.deniedDatabases.some((name) => !observedGrants.deniedDatabases.includes(name))) {
      throw new Error('observed provisioner grants do not enforce the runKey/T2 boundary');
    }
    if (requireMigrationEvidence && observedGrants.apiDatabaseAccountsVerified !== true) {
      throw new Error('isolated API database-level accounts were not independently verified');
    }
    let apiAccountGrantEvidence = null;
    const migrationResults = [];
    for (const database of Object.values(manifest.databases)) {
      migrationResults.push(await adapter.migrateDatabase({ name: database.name, role: database.role, runKey: manifest.runKey, profile }));
    }
    let migrationEvidence;
    if (requireMigrationEvidence) {
      migrationEvidence = assertMigrationEvidence(
        adapter.getMigrationEvidence?.() ?? { status: 'unavailable' },
        manifest.databases,
        manifest.runKey,
      );
      if (migrationResults.some((row) => !row || !migrationEvidence.applied.some((entry) => (
        entry.role === row.role && entry.database === row.database
          && entry.schemaFingerprint.tablesSha256 === row.schemaFingerprint?.tablesSha256
      )))) {
        throw new Error('migration results differ from the verified migration evidence manifest');
      }
    }
    let dependencySeedEvidence = null;
    if (profile === 't1' && verifiedDependencyManifest) {
      if (typeof adapter.seedExactDependencies !== 'function') {
        throw new Error('exact dependency manifest requires the maintained isolated dependency seeder');
      }
      dependencySeedEvidence = await adapter.seedExactDependencies({
        manifest: verifiedDependencyManifest,
        targetDatabases: manifest.databases,
        runKey: manifest.runKey,
      });
      if (dependencySeedEvidence?.status !== 'verified' || dependencySeedEvidence.readbackVerified !== true) {
        throw new Error('exact dependency seed did not produce verified independent readback evidence');
      }
    } else if (profile === 't1') {
      await adapter.copyReadOnlySnapshot({
        sourceSnapshot: manifest.sourceSnapshot,
        targetDatabases: manifest.databases,
        scrubSensitive: true,
        runKey: manifest.runKey
      });
    }
    if (requireMigrationEvidence && profile === 't1') {
      migrationEvidence = assertMigrationEvidence(
        await adapter.refreshMigrationSchemaFingerprints?.({ databases: manifest.databases })
          ?? { status: 'unavailable' },
        manifest.databases,
        manifest.runKey,
      );
    }
    if (requireMigrationEvidence) {
      if (typeof adapter.grantIsolatedApiTablePrivileges !== 'function') {
        throw new Error('isolated API table grants require the post-migration grant adapter');
      }
      await adapter.grantIsolatedApiTablePrivileges({ databases: manifest.databases, runKey: manifest.runKey });
      const finalGrants = await adapter.verifyProvisionerGrants({
        credentialRole: manifest.provisioner.credentialRole,
        allowedPrefix: manifest.provisioner.allowedPrefix,
        deniedDatabases: manifest.provisioner.deniedDatabases,
        runKey: manifest.runKey,
        apiTableGrantsPending: false,
      });
      if (finalGrants?.credentialRole !== manifest.provisioner.credentialRole
          || finalGrants.allowedPrefix !== manifest.provisioner.allowedPrefix
          || finalGrants.t2WriteDenied !== true
          || !Array.isArray(finalGrants.deniedDatabases)
          || manifest.provisioner.deniedDatabases.some((name) => !finalGrants.deniedDatabases.includes(name))) {
        throw new Error('post-migration provisioner grants do not enforce the runKey/T2 boundary');
      }
      if (finalGrants.apiAccountsVerified !== true) {
        throw new Error('isolated API account grants were not independently verified');
      }
      apiAccountGrantEvidence = assertIsolatedApiGrantEvidence(
        adapter.getApiAccountGrantEvidence?.(),
        manifest.databases,
      );
    }
    const readyManifest = withProvisioningState({
      ...manifest,
      ...(migrationEvidence ? { migrationEvidence } : {}),
      ...(apiAccountGrantEvidence ? { apiAccountGrantEvidence } : {}),
      ...(dependencySeedEvidence ? { dependencySeedEvidence } : {}),
    }, 'ready', createdDatabases);
    writeManifestAtomic(manifestReservation, readyManifest);
    return readyManifest;
  } catch (error) {
    const cleanupResults = await Promise.allSettled(createdDatabases.toReversed().map((database) => adapter.dropDatabase({
      name: database.name, role: database.role, runKey, ifExists: true, compensation: true
    })));
    if (redisReservation && redisReservationVerified) {
      cleanupResults.push(...await Promise.allSettled([adapter.releaseRedisLogicalDb({
        ...verifiedRedisIdentity, runKey, ifMissing: true, compensation: true
      })]));
    } else if (redisReservation) {
      cleanupResults.push({ status: 'rejected', reason: new Error('unverified Redis reservation requires manual cleanup') });
      error.message = `${error.message}; unverified Redis reservation requires manual cleanup`;
    }
    if (manifest) {
      const cleanupErrors = cleanupResults
        .filter((result) => result.status === 'rejected')
        .map((result) => String(result.reason?.message ?? result.reason));
      writeManifestAtomic(manifestReservation, withProvisioningState(
        manifest,
        cleanupErrors.length === 0 ? 'compensated' : 'cleanup_required',
        cleanupErrors.length === 0 ? [] : createdDatabases,
        cleanupErrors
      ));
    } else if (redisReservation && !redisReservationVerified) {
      writeManifestAtomic(manifestReservation, {
        schemaVersion: 1,
        recordType: 'redis-reservation-cleanup',
        profile,
        runId,
        runKey,
        environmentId,
        provisioning: {
          state: 'cleanup_required',
          createdRoles: [],
          cleanupErrors: ['unverified Redis reservation requires manual cleanup']
        },
        redisReservation
      });
    }
    throw error;
  }
  } finally {
    manifestReservation.release();
  }
}
