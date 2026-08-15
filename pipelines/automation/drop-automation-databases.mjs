import { DATABASE_ROLES, FORMAL_DATABASES } from './automation-database-contract.mjs';

const PROFILE_PREFIXES = Object.freeze({
  t0: 'terria_v1_automation_test_',
  t1: 'terria_v1_automation_acceptance_'
});

function validateCleanupBoundary(manifest, runKey) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.runKey !== runKey) {
    throw new Error('cleanup runKey or manifest mismatch');
  }
  const prefix = PROFILE_PREFIXES[manifest.profile];
  if (!prefix || manifest.provisioner?.allowedPrefix !== `${prefix}${runKey}_`) {
    throw new Error('cleanup database prefix is invalid');
  }
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey ?? '')) {
    throw new Error('cleanup runKey is invalid');
  }
  if (!String(manifest.serverIdentity?.host ?? '').trim()
    || !Number.isInteger(manifest.serverIdentity?.port) || manifest.serverIdentity.port <= 0
    || manifest.serverIdentity.port > 65535
    || !String(manifest.serverIdentity?.serverUuid ?? '').trim()) {
    throw new Error('cleanup server identity is invalid');
  }
  const roles = Object.keys(manifest.databases ?? {}).sort();
  if (roles.join(',') !== [...DATABASE_ROLES].sort().join(',')) {
    throw new Error('cleanup requires an exact three-database set');
  }
  for (const role of DATABASE_ROLES) {
    const database = manifest.databases[role];
    if (Object.values(FORMAL_DATABASES).includes(database?.name)) {
      throw new Error(`formal database cleanup is forbidden: ${database.name}`);
    }
    if (database?.role !== role || database.name !== `${prefix}${runKey}_${role}`) {
      throw new Error(`${role} cleanup database is outside the runKey prefix`);
    }
    for (const field of ['host', 'port', 'serverUuid']) {
      if (database[field] !== manifest.serverIdentity?.[field]) {
        throw new Error(`${role} cleanup database server identity mismatch`);
      }
    }
  }
  if (!String(manifest.redis?.host ?? '').trim() || !Number.isInteger(manifest.redis.port)
    || manifest.redis.port <= 0 || manifest.redis.port > 65535
    || !Number.isInteger(manifest.redis.logicalDb) || manifest.redis.logicalDb < 1
    || manifest.redis.epoch !== `epoch-${runKey}`
    || manifest.redis.environmentId !== manifest.environmentId
    || !String(manifest.redis.reservationToken ?? '').trim()) {
    throw new Error('cleanup Redis reservation identity is invalid');
  }
}

export async function dropAutomationDatabases({ manifest, runKey, adapter } = {}) {
  if (!adapter || typeof adapter.dropDatabase !== 'function'
    || typeof adapter.releaseRedisLogicalDb !== 'function'
    || typeof adapter.inspectServer !== 'function') {
    throw new Error('an explicit automation cleanup adapter is required');
  }
  validateCleanupBoundary(manifest, runKey);
  const observedServer = await adapter.inspectServer();
  if (!String(observedServer?.host ?? '').trim()
    || !Number.isInteger(observedServer?.port) || observedServer.port <= 0 || observedServer.port > 65535
    || !String(observedServer?.serverUuid ?? '').trim()) {
    throw new Error('observed cleanup server identity is invalid');
  }
  for (const field of ['host', 'port', 'serverUuid']) {
    if (observedServer?.[field] !== manifest.serverIdentity?.[field]) {
      throw new Error(`cleanup server identity mismatch for ${field}`);
    }
  }
  for (const role of DATABASE_ROLES) {
    await adapter.dropDatabase({
      name: manifest.databases[role].name,
      role,
      runKey,
      ifExists: true
    });
  }
  await adapter.releaseRedisLogicalDb({
    ...manifest.redis,
    runKey,
    ifMissing: true
  });
  return Object.freeze({ dropped: [...DATABASE_ROLES], redisReleased: true });
}
