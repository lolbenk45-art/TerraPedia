import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DATABASE_ROLES = Object.freeze(['maint', 'relation', 'local']);
export const TEST_PROFILES = Object.freeze(['unit', 't0', 't1', 't2-readonly']);
export const FORMAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation'
});

const MYSQL_IDENTIFIER_LIMIT = 64;
const DURABLE_RUN_KEY_REGISTRY = Symbol('durableRunKeyRegistry');
const PROFILE_DATABASE_PREFIXES = Object.freeze({
  t0: 'terria_v1_automation_test_',
  t1: 'terria_v1_automation_acceptance_'
});

function requireNonBlank(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${label} must be non-blank`);
  }
  return normalized;
}

export function canonicalServerFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('server fingerprint is invalid');
  }
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('server fingerprint port is invalid');
  }
  const databases = value.databases;
  const expectedDatabases = Object.values(FORMAL_DATABASES);
  if (!Array.isArray(databases) || JSON.stringify(databases) !== JSON.stringify(expectedDatabases)) {
    throw new Error(`server fingerprint databases must be exactly: ${expectedDatabases.join(', ')}`);
  }
  return Object.freeze({
    host: requireNonBlank(value.host, 'server fingerprint host'),
    port,
    serverUuid: requireNonBlank(value.serverUuid, 'server fingerprint UUID'),
    databases: [...databases],
  });
}

export function hashCanonicalServerFingerprint(value) {
  const fingerprint = canonicalServerFingerprint(value);
  return `sha256:${createHash('sha256').update(JSON.stringify({
    databases: fingerprint.databases,
    host: fingerprint.host,
    port: fingerprint.port,
    serverUuid: fingerprint.serverUuid,
  }), 'utf8').digest('hex')}`;
}

function assertKnownProfile(profile) {
  if (!TEST_PROFILES.includes(profile)) {
    throw new Error(`profile must be one of: ${TEST_PROFILES.join(', ')}`);
  }
}

function readRunKeyRegistry(file) {
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`durable runKey registry is unreadable: ${error.message}`);
  }
  if (parsed?.schemaVersion !== 1 || !parsed.mappings || typeof parsed.mappings !== 'object'
    || Array.isArray(parsed.mappings)) {
    throw new Error('durable runKey registry has an unsupported schema');
  }
  return parsed.mappings;
}

export function openDurableRunKeyRegistry(filePath) {
  const file = path.resolve(requireNonBlank(filePath, 'runKey registry path'));
  const lockFile = `${file}.lock`;
  return Object.freeze({
    [DURABLE_RUN_KEY_REGISTRY]: true,
    get(runKey) {
      return readRunKeyRegistry(file)[runKey];
    },
    entries() {
      return Object.entries(readRunKeyRegistry(file));
    },
    set(runKey, runId) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let lock;
      let temporaryFile;
      try {
        lock = fs.openSync(lockFile, 'wx', 0o600);
        const mappings = readRunKeyRegistry(file);
        if (mappings[runKey] && mappings[runKey] !== runId) {
          throw new Error(`runKey collision or duplicate mapping: ${runKey}`);
        }
        const duplicate = Object.entries(mappings)
          .find(([mappedKey, mappedRunId]) => mappedRunId === runId && mappedKey !== runKey);
        if (duplicate) throw new Error(`duplicate runId mapping: ${runId}`);
        mappings[runKey] = runId;
        temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
        fs.writeFileSync(temporaryFile, `${JSON.stringify({ schemaVersion: 1, mappings }, null, 2)}\n`, {
          encoding: 'utf8', mode: 0o600, flag: 'wx'
        });
        fs.renameSync(temporaryFile, file);
        temporaryFile = null;
      } finally {
        if (temporaryFile) fs.rmSync(temporaryFile, { force: true });
        if (lock !== undefined) fs.closeSync(lock);
        if (lock !== undefined) fs.rmSync(lockFile, { force: true });
      }
    }
  });
}

export function normalizeRunKey(runId, { mappings, forcedRunKey } = {}) {
  if (!mappings || mappings[DURABLE_RUN_KEY_REGISTRY] !== true) {
    throw new Error('durable runKey mapping registry is required');
  }
  const normalizedRunId = requireNonBlank(runId, 'runId');
  const slug = normalizedRunId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 3) || 'run';
  const hash = createHash('sha256').update(normalizedRunId).digest('hex').slice(0, 16);
  const runKey = `${slug}_${hash}`;
  if (forcedRunKey !== undefined) {
    throw new Error('forced runKey hash override is forbidden');
  }
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey) || runKey.length > 20) {
    throw new Error('runKey must be at most 20 characters with a lowercase slug and 16-character SHA-256 suffix');
  }

  const existingRunId = mappings.get(runKey);
  if (existingRunId && existingRunId !== normalizedRunId) {
    throw new Error(`runKey collision or duplicate mapping: ${runKey}`);
  }
  for (const [mappedKey, mappedRunId] of mappings.entries()) {
    if (mappedRunId === normalizedRunId && mappedKey !== runKey) {
      throw new Error(`duplicate runId mapping: ${normalizedRunId}`);
    }
  }
  mappings.set(runKey, normalizedRunId);
  return runKey;
}

export function assertNoFormalDatabaseNames(databaseNames) {
  const protectedNames = new Set(Object.values(FORMAL_DATABASES));
  for (const name of databaseNames) {
    if (protectedNames.has(name)) {
      throw new Error(`formal database is forbidden in this profile: ${name}`);
    }
  }
}

export function buildAutomationDatabaseNames({ profile, runId, mappings } = {}) {
  assertKnownProfile(profile);
  const prefix = PROFILE_DATABASE_PREFIXES[profile];
  if (!prefix) {
    throw new Error(`profile ${profile} cannot create automation databases`);
  }
  const runKey = normalizeRunKey(runId, { mappings });
  const result = { runKey };
  for (const role of DATABASE_ROLES) {
    const name = `${prefix}${runKey}_${role}`;
    if (name.length > MYSQL_IDENTIFIER_LIMIT) {
      throw new Error(`database identifier exceeds MySQL 64 character limit: ${name}`);
    }
    result[role] = name;
  }
  assertNoFormalDatabaseNames(DATABASE_ROLES.map((role) => result[role]));
  return Object.freeze(result);
}

function expectedCredentialRole(profile) {
  if (profile === 't0') return 'automation-test-writer';
  if (profile === 't1') return 'automation-acceptance-writer';
  if (profile === 't2-readonly') return 'automation-readonly';
  return null;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function expectedDatabaseName(profile, runKey, role) {
  if (profile === 't2-readonly') return FORMAL_DATABASES[role];
  const prefix = PROFILE_DATABASE_PREFIXES[profile];
  if (!prefix) throw new Error(`profile ${profile} cannot resolve databases`);
  return `${prefix}${runKey}_${role}`;
}

export function assertDatabasePurpose(trustedManifest, observedIdentity, expectedProfile, expectedRunKey) {
  assertKnownProfile(expectedProfile);
  const trusted = requireObject(trustedManifest, 'trusted manifest');
  const observed = requireObject(observedIdentity, 'observed identity');
  if (trusted.profile !== expectedProfile || observed.profile !== expectedProfile) {
    throw new Error(`profile mismatch: expected ${expectedProfile}`);
  }
  const runKey = requireNonBlank(expectedRunKey, 'expected runKey');
  if (trusted.runKey !== runKey || observed.runKey !== runKey) {
    throw new Error(`runKey mismatch: expected ${runKey}`);
  }
  if (expectedProfile === 'unit') {
    if (trusted.databases || trusted.redis || observed.databases || observed.redis) {
      throw new Error('unit profile cannot declare database or redis connections');
    }
    return Object.freeze({ profile: expectedProfile, runKey });
  }

  const trustedDatabases = requireObject(trusted.databases, 'trusted database identity');
  const observedDatabases = requireObject(observed.databases, 'observed database identity');
  const expectedRoles = [...DATABASE_ROLES].sort().join(',');
  if (Object.keys(trustedDatabases).sort().join(',') !== expectedRoles
    || Object.keys(observedDatabases).sort().join(',') !== expectedRoles) {
    throw new Error('database set contains unknown or extra role');
  }
  const environmentId = requireNonBlank(trusted.environmentId, 'trusted environmentId');
  if (observed.environmentId !== environmentId) {
    throw new Error('environmentId mismatch');
  }
  const expectedRole = expectedCredentialRole(expectedProfile);
  for (const role of DATABASE_ROLES) {
    const expected = requireObject(trustedDatabases[role], `trusted ${role} database identity`);
    const database = requireObject(observedDatabases[role], `observed ${role} database identity`);
    if ((expected.role !== undefined && expected.role !== role) || database.role !== role) {
      throw new Error(`${role} database role mismatch`);
    }
    const requiredName = expectedDatabaseName(expectedProfile, runKey, role);
    if (expected.name !== requiredName || database.name !== expected.name) {
      throw new Error(`${role} database name mismatch`);
    }
    if (expectedProfile !== 't2-readonly') {
      assertNoFormalDatabaseNames([expected.name, database.name]);
    }
    const host = requireNonBlank(database.host, `${role} database host`);
    if (host !== requireNonBlank(expected.host, `trusted ${role} database host`)) {
      throw new Error(`${role} database host fingerprint mismatch`);
    }
    if (!Number.isInteger(expected.port) || !Number.isInteger(database.port)
      || database.port !== expected.port || database.port <= 0 || database.port > 65535) {
      throw new Error(`${role} database port is invalid`);
    }
    const serverUuid = requireNonBlank(database.serverUuid, `${role} server UUID`);
    if (serverUuid !== requireNonBlank(expected.serverUuid, `trusted ${role} server UUID`)) {
      throw new Error(`${role} server UUID fingerprint mismatch`);
    }
    if (database.environmentId !== environmentId) {
      throw new Error(`${role} environmentId mismatch`);
    }
    if (expected.credentialRole !== expectedRole || database.credentialRole !== expected.credentialRole) {
      throw new Error(`${role} credential role mismatch`);
    }
    const requiredPurpose = expectedProfile === 't2-readonly' ? 'formal-readonly' : `automation-${runKey}`;
    if (expected.purposeToken !== requiredPurpose || database.purposeToken !== expected.purposeToken) {
      throw new Error(`${role} purpose token mismatch`);
    }
  }
  const expectedRedis = requireObject(trusted.redis, 'trusted redis identity');
  const observedRedis = requireObject(observed.redis, 'observed redis identity');
  if (requireNonBlank(observedRedis.host, 'redis host') !== requireNonBlank(expectedRedis.host, 'trusted redis host')) {
    throw new Error('redis host fingerprint mismatch');
  }
  if (!Number.isInteger(expectedRedis.port) || observedRedis.port !== expectedRedis.port
    || observedRedis.port <= 0 || observedRedis.port > 65535) {
    throw new Error('redis port fingerprint mismatch');
  }
  if (!Number.isInteger(observedRedis.logicalDb) || observedRedis.logicalDb < 1) {
    throw new Error('redis logical database identity is invalid');
  }
  if (expectedRedis.epoch !== `epoch-${runKey}` || observedRedis.epoch !== expectedRedis.epoch) {
    throw new Error('redis epoch mismatch');
  }
  if (observedRedis.logicalDb !== expectedRedis.logicalDb) {
    throw new Error('redis identity fingerprint mismatch');
  }
  return Object.freeze({ profile: expectedProfile, runKey, environmentId });
}
