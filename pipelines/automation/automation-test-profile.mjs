import {
  DATABASE_ROLES,
  FORMAL_DATABASES,
  buildAutomationDatabaseNames
} from './automation-database-contract.mjs';

const PROFILE_PREFIXES = Object.freeze({
  t0: 'terria_v1_automation_test_',
  t1: 'terria_v1_automation_acceptance_'
});

const PROFILE_WRITERS = Object.freeze({
  t0: 'automation-test-writer',
  t1: 'automation-acceptance-writer'
});

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireProfile(profile) {
  if (!PROFILE_PREFIXES[profile]) throw new Error('automation test profile must be t0 or t1');
  return profile;
}

export function assertReadOnlySourceSnapshot(sourceSnapshot) {
  if (!sourceSnapshot || sourceSnapshot.profile !== 't2-readonly'
    || sourceSnapshot.readOnly !== true || sourceSnapshot.scrubbed !== true
    || !String(sourceSnapshot.snapshotId ?? '').trim()
    || !/^sha256:[0-9a-f]{64}$/.test(sourceSnapshot.snapshotHash ?? '')
    || sourceSnapshot.credentialRole !== 'automation-readonly'
    || !Array.isArray(sourceSnapshot.serverFingerprints)
    || sourceSnapshot.serverFingerprints.length !== DATABASE_ROLES.length
    || Object.entries(FORMAL_DATABASES).some(([role, name]) => sourceSnapshot.databases?.[role] !== name)
    || Object.keys(sourceSnapshot.databases ?? {}).length !== DATABASE_ROLES.length
    || DATABASE_ROLES.some((role) => {
      const fingerprint = sourceSnapshot.serverFingerprints.find((entry) => entry?.role === role);
      return fingerprint?.name !== FORMAL_DATABASES[role]
        || !String(fingerprint.host ?? '').trim()
        || !Number.isInteger(fingerprint.port)
        || !String(fingerprint.serverUuid ?? '').trim();
    })) {
    throw new Error('T1 source snapshot must be explicit, T2 read-only, and scrubbed');
  }
  return true;
}

export function buildAutomationTestManifest({
  profile,
  runId,
  mappings,
  environmentId,
  host,
  port,
  serverUuid,
  redisIdentity,
  sourceSnapshot
} = {}) {
  requireProfile(profile);
  if (profile === 't1') assertReadOnlySourceSnapshot(sourceSnapshot);
  const names = buildAutomationDatabaseNames({ profile, runId, mappings });
  const environment = requireText(environmentId, 'environmentId');
  const server = requireText(serverUuid, 'serverUuid');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('database port is invalid');
  }
  if (!redisIdentity || !Number.isInteger(redisIdentity.logicalDb) || redisIdentity.logicalDb < 1
    || !Number.isInteger(redisIdentity.port) || redisIdentity.port <= 0 || redisIdentity.port > 65535
    || !String(redisIdentity.reservationToken ?? '').trim()) {
    throw new Error('isolated Redis logical database is required');
  }
  const credentialRole = PROFILE_WRITERS[profile];
  const databases = Object.fromEntries(DATABASE_ROLES.map((role) => [role, {
    role,
    name: names[role],
    host: requireText(host, 'database host'),
    port,
    serverUuid: server,
    purposeToken: `automation-${names.runKey}`,
    credentialRole,
    environmentId: environment
  }]));
  const manifest = {
    schemaVersion: 1,
    profile,
    runId: requireText(runId, 'runId'),
    runKey: names.runKey,
    environmentId: environment,
    serverIdentity: { host, port, serverUuid: server },
    provisioner: {
      credentialRole: 'automation-provisioner',
      allowedPrefix: `${PROFILE_PREFIXES[profile]}${names.runKey}_`,
      deniedDatabases: Object.values(FORMAL_DATABASES)
    },
    databases,
    redis: {
      host: requireText(redisIdentity.host, 'Redis host'),
      port: redisIdentity.port,
      logicalDb: redisIdentity.logicalDb,
      reservationToken: requireText(redisIdentity.reservationToken, 'Redis reservation token'),
      environmentId: environment,
      epoch: `epoch-${names.runKey}`
    }
  };
  if (profile === 't1') manifest.sourceSnapshot = { ...sourceSnapshot };
  assertAutomationTestManifest(manifest);
  return Object.freeze(manifest);
}

export function assertAutomationTestManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error('automation manifest schema is invalid');
  const profile = requireProfile(manifest.profile);
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(manifest.runKey ?? '')) {
    throw new Error('manifest runKey is invalid');
  }
  const prefix = PROFILE_PREFIXES[profile];
  if (manifest.provisioner?.credentialRole !== 'automation-provisioner'
    || manifest.provisioner?.allowedPrefix !== `${prefix}${manifest.runKey}_`) {
    throw new Error('provisioner prefix or credential role is invalid');
  }
  const denied = manifest.provisioner?.deniedDatabases;
  if (!Array.isArray(denied) || Object.values(FORMAL_DATABASES).some((name) => !denied.includes(name))) {
    throw new Error('formal database deny list is incomplete');
  }
  const roles = Object.keys(manifest.databases ?? {}).sort();
  if (roles.join(',') !== [...DATABASE_ROLES].sort().join(',')) {
    throw new Error('manifest database role set is incomplete');
  }
  for (const role of DATABASE_ROLES) {
    const database = manifest.databases[role];
    const expectedName = `${prefix}${manifest.runKey}_${role}`;
    if (database?.role !== role || database.name !== expectedName) {
      throw new Error(`${role} database role or identity is invalid`);
    }
    if (Object.values(FORMAL_DATABASES).includes(database.name)) {
      throw new Error(`formal database is forbidden: ${database.name}`);
    }
    if (database.host !== manifest.serverIdentity?.host
      || database.port !== manifest.serverIdentity?.port
      || database.serverUuid !== manifest.serverIdentity?.serverUuid) {
      throw new Error(`${role} server identity mismatch`);
    }
    if (database.credentialRole !== PROFILE_WRITERS[profile]
      || database.environmentId !== manifest.environmentId
      || database.purposeToken !== `automation-${manifest.runKey}`) {
      throw new Error(`${role} database credential or purpose identity mismatch`);
    }
  }
  if (!String(manifest.serverIdentity?.host ?? '').trim()
    || !Number.isInteger(manifest.serverIdentity?.port) || manifest.serverIdentity.port <= 0
    || manifest.serverIdentity.port > 65535 || !String(manifest.serverIdentity?.serverUuid ?? '').trim()) {
    throw new Error('server identity is invalid');
  }
  if (!String(manifest.redis?.host ?? '').trim()
    || !Number.isInteger(manifest.redis?.port) || manifest.redis.port <= 0 || manifest.redis.port > 65535
    || !Number.isInteger(manifest.redis?.logicalDb) || manifest.redis.logicalDb < 1
    || !String(manifest.redis?.reservationToken ?? '').trim()
    || manifest.redis.environmentId !== manifest.environmentId
    || manifest.redis.epoch !== `epoch-${manifest.runKey}`) {
    throw new Error('Redis identity or epoch is invalid');
  }
  if (profile === 't1') assertReadOnlySourceSnapshot(manifest.sourceSnapshot);
  if (profile === 't0' && manifest.sourceSnapshot !== undefined) {
    throw new Error('T0 manifest cannot declare a formal source snapshot');
  }
  return true;
}

export { PROFILE_PREFIXES };
