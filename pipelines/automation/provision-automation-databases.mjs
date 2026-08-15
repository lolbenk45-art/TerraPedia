import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAutomationTestManifest,
  assertReadOnlySourceSnapshot
} from './automation-test-profile.mjs';
import { normalizeRunKey } from './automation-database-contract.mjs';

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
  expectedServerIdentity
} = {}) {
  requireAdapter(adapter, profile);
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
  let verifiedSnapshot;
  if (profile === 't1') {
    verifiedSnapshot = await adapter.verifyReadOnlySnapshot({ snapshotId: sourceSnapshot.snapshotId });
    if (verifiedSnapshot?.snapshotId !== sourceSnapshot.snapshotId) throw new Error('snapshot identity mismatch');
    assertReadOnlySourceSnapshot(verifiedSnapshot);
  }

  const runKey = normalizeRunKey(runId, { mappings });
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
    const observedGrants = await adapter.verifyProvisionerGrants({
      credentialRole: manifest.provisioner.credentialRole,
      allowedPrefix: manifest.provisioner.allowedPrefix,
      deniedDatabases: manifest.provisioner.deniedDatabases,
      runKey: manifest.runKey
    });
    if (observedGrants?.credentialRole !== manifest.provisioner.credentialRole
      || observedGrants.allowedPrefix !== manifest.provisioner.allowedPrefix
      || observedGrants.t2WriteDenied !== true
      || !Array.isArray(observedGrants.deniedDatabases)
      || manifest.provisioner.deniedDatabases.some((name) => !observedGrants.deniedDatabases.includes(name))) {
      throw new Error('observed provisioner grants do not enforce the runKey/T2 boundary');
    }
    for (const database of Object.values(manifest.databases)) {
      await adapter.migrateDatabase({ name: database.name, role: database.role, runKey: manifest.runKey, profile });
    }
    if (profile === 't1') {
      await adapter.copyReadOnlySnapshot({
        sourceSnapshot: manifest.sourceSnapshot,
        targetDatabases: manifest.databases,
        scrubSensitive: true,
        runKey: manifest.runKey
      });
    }
    const readyManifest = withProvisioningState(manifest, 'ready', createdDatabases);
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
