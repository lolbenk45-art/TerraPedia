import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  buildAutomationDatabaseNames,
  assertNoFormalDatabaseNames,
} from './automation-database-contract.mjs';

export const EIGHT_DOMAIN_RUN_IDS = Object.freeze({
  items: 'e8pr-items-20261017-v1',
  npcs: 'e8pr-npcs-20261017-v1',
  projectiles: 'e8pr-projectiles-20261017-v1',
  audio: 'e8pr-audio-20261017-v1',
  bosses: 'e8pr-bosses-20261017-v1',
  armor_sets: 'e8pr-armor_sets-20261017-v1',
  buffs: 'e8pr-buffs-20261017-v1',
  shimmer: 'e8pr-shimmer-20261017-v1',
});

const REDIS_DATABASES = Object.freeze({
  items: 1,
  npcs: 2,
  projectiles: 3,
  audio: 4,
  bosses: 5,
  armor_sets: 6,
  buffs: 7,
  shimmer: 8,
});

const FORMAL_DATABASES = Object.freeze([
  'terria_v1_local',
  'terria_v1_maint',
  'terria_v1_relation',
]);
const HISTORICAL_DATABASES = Object.freeze(['terria_v1_v55_rehearsal']);
const DOMAIN_IDS = Object.freeze(Object.keys(EIGHT_DOMAIN_RUN_IDS));
const MINIO_DOMAINS = new Set(['armor_sets', 'bosses']);
const EXECUTION_EVIDENCE_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REDIS_BINARY_SHA256 = 'sha256:1b2950213684d355e0e49fe6702c7bfb9d40b78f0da9ce289fc0e8f2a295e540';
const MINIO_BINARY_SHA256 = 'sha256:7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(requireObject(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.join(',') !== expected.join(',')) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
}

function assertExactStrings(actual, expected, label) {
  if (!Array.isArray(actual) || actual.join(',') !== expected.join(',')) {
    throw new Error(`${label} does not match the fixed eight-domain allocation`);
  }
}

function requireNonBlank(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function requireDomain(domain) {
  if (!DOMAIN_IDS.includes(domain)) {
    throw new Error(`unsupported eight-domain allocation domain: ${String(domain)}`);
  }
}

function assertManifestContract(manifest, repoRoot, runKeyRegistry) {
  requireObject(manifest, 'execution manifest');
  if (manifest.schemaVersion !== 1
      || manifest.manifestKind !== 'eight_domain_production_readiness_execution') {
    throw new Error('execution manifest kind or schema version is invalid');
  }
  if (path.resolve(requireNonBlank(manifest.executionRoot, 'executionRoot')) !== repoRoot
      || path.resolve(requireNonBlank(manifest.sourceRoot, 'sourceRoot')) !== repoRoot) {
    throw new Error('execution/source root does not match the specified worktree');
  }
  if (manifest.resourceDecision !== 'fixed_from_read_only_inventory_fail_closed_no_fallback') {
    throw new Error('resource decision must be fixed and fail closed without fallback');
  }

  const mysql = requireObject(manifest.mysql, 'mysql allocation');
  if (mysql.host !== '127.0.0.1' || mysql.port !== 13306
      || mysql.serverUuid !== 'b4ae6728-4f72-11f1-bcc9-00155d37eadf'
      || mysql.targetProfile !== 't1') {
    throw new Error('MySQL identity/profile differs from the fixed allocation');
  }
  assertExactStrings(mysql.formalDatabases, FORMAL_DATABASES, 'formal database set');
  assertExactStrings(mysql.historicalDatabases, HISTORICAL_DATABASES, 'historical database set');

  const redis = requireObject(manifest.redis, 'redis allocation');
  if (redis.host !== '127.0.0.1' || redis.port !== 16380 || redis.logicalDatabases !== 16
      || redis.persistence !== false || redis.fallback !== 'none'
      || redis.binary !== '/usr/bin/redis-server' || redis.version !== '7.0.15'
      || redis.binarySha256 !== REDIS_BINARY_SHA256
      || redis.dataRoot !== '.local/tmp/eight-domain-production-readiness/20261017/redis'
      || redis.configFile !== '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.conf'
      || redis.authSecretFile !== '.local/tmp/eight-domain-production-readiness/20261017/redis/redis.auth'
      || redis.privateFilesMode !== '0600') {
    throw new Error('Redis endpoint, binary, persistence, or fallback policy differs from the fixed allocation');
  }
  assertExactStrings(redis.startCommandContract, [
    '--port', '16380', '--bind', '127.0.0.1', '--protected-mode', 'yes', '--dir',
    '.local/tmp/eight-domain-production-readiness/20261017/redis', '--databases', '16',
    '--save', '', '--appendonly', 'no',
  ], 'Redis start command');
  requireExactKeys(redis.allocatedDatabases, DOMAIN_IDS, 'Redis domain allocation');
  for (const domain of DOMAIN_IDS) {
    if (redis.allocatedDatabases[domain] !== REDIS_DATABASES[domain]) {
      throw new Error(`Redis logical DB allocation mismatch for ${domain}`);
    }
  }

  const objectStore = requireObject(manifest.objectStore, 'object-store allocation');
  if (objectStore.binary !== '/home/lolben/.local/bin/minio'
      || objectStore.version !== 'RELEASE.2025-09-07T16-13-09Z'
      || objectStore.binarySha256 !== MINIO_BINARY_SHA256
      || objectStore.endpoint !== 'http://127.0.0.1:19100'
      || objectStore.consoleEndpoint !== 'http://127.0.0.1:19101'
      || objectStore.dataRoot !== '.local/tmp/eight-domain-production-readiness/20261017/minio'
      || objectStore.credentialsFile !== '.local/tmp/eight-domain-production-readiness/20261017/minio/minio.env'
      || objectStore.privateFilesMode !== '0600'
      || objectStore.fallback !== 'none') {
    throw new Error('object-store endpoint, binary, or fallback policy differs from the fixed allocation');
  }
  requireExactKeys(objectStore.buckets, ['armor_sets', 'bosses', 'audio'], 'object-store buckets');
  requireExactKeys(objectStore.objectPrefixes, ['armor_sets', 'bosses'], 'object-store prefixes');
  if (objectStore.buckets.armor_sets !== 'tp-e8pr-armor-20261017'
      || objectStore.buckets.bosses !== 'tp-e8pr-bosses-20261017'
      || objectStore.buckets.audio !== null
      || objectStore.audioMode !== 'metadata-link-only') {
    throw new Error('object-store bucket allocation differs from the fixed allocation');
  }

  const api = requireObject(manifest.api, 'API allocation');
  if (api.isolatedHost !== '127.0.0.1' || api.isolatedPort !== 18280
      || api.fallback !== 'none') {
    throw new Error('isolated API endpoint differs from the fixed allocation');
  }
  assertExactStrings(api.productionPorts, [18104, 18105], 'production API ports');

  requireExactKeys(manifest.runIds, DOMAIN_IDS, 'domain run IDs');
  assertExactStrings(Object.keys(manifest.runIds), DOMAIN_IDS, 'domain order');
  requireExactKeys(mysql.runKeys, DOMAIN_IDS, 'domain run keys');
  requireExactKeys(mysql.expectedSchemas, DOMAIN_IDS, 'domain schema sets');
  requireExactKeys(manifest.sourceModes, DOMAIN_IDS, 'domain source modes');

  const derived = {};
  for (const domain of DOMAIN_IDS) {
    if (manifest.runIds[domain] !== EIGHT_DOMAIN_RUN_IDS[domain]) {
      throw new Error(`run ID is not fixed for domain ${domain}`);
    }
    const names = buildAutomationDatabaseNames({
      profile: 't1',
      runId: EIGHT_DOMAIN_RUN_IDS[domain],
      mappings: runKeyRegistry,
    });
    if (mysql.runKeys[domain] !== names.runKey) {
      throw new Error(`derived runKey mismatch for domain ${domain}`);
    }
    const schemas = { local: names.local, maint: names.maint, relation: names.relation };
    const actual = requireObject(mysql.expectedSchemas[domain], `${domain} schema set`);
    requireExactKeys(actual, ['local', 'maint', 'relation'], `${domain} schema roles`);
    if (actual.local !== schemas.local || actual.maint !== schemas.maint || actual.relation !== schemas.relation) {
      throw new Error(`derived schema names mismatch for domain ${domain}`);
    }
    assertNoFormalDatabaseNames(Object.values(schemas));
    if (HISTORICAL_DATABASES.some((name) => Object.values(schemas).includes(name))) {
      throw new Error(`historical database is forbidden for domain ${domain}`);
    }
    if (MINIO_DOMAINS.has(domain)
        && objectStore.objectPrefixes[domain] !== `e8pr/${domain}/<runId>/`) {
      throw new Error(`run-owned object prefix mismatch for domain ${domain}`);
    }
    const source = requireObject(manifest.sourceModes[domain], `${domain} source mode`);
    if (!['repository-frozen', 'bounded-live-capture', 'hybrid'].includes(source.mode)) {
      throw new Error(`source mode is invalid for domain ${domain}`);
    }
    derived[domain] = { runId: EIGHT_DOMAIN_RUN_IDS[domain], ...names };
  }

  return { mysql, redis, objectStore, api, derived };
}

export function buildEightDomainAllocationPlan({ manifest, domain, repoRoot, runKeyRegistry } = {}) {
  requireDomain(domain);
  const root = path.resolve(requireNonBlank(repoRoot, 'repoRoot'));
  const fixed = assertManifestContract(manifest, root, runKeyRegistry);
  const run = fixed.derived[domain];
  const objectStore = MINIO_DOMAINS.has(domain)
    ? Object.freeze({
        endpoint: fixed.objectStore.endpoint,
        consoleEndpoint: fixed.objectStore.consoleEndpoint,
        bucket: fixed.objectStore.buckets[domain],
        objectPrefix: `e8pr/${domain}/${run.runId}/`,
        dataRoot: fixed.objectStore.dataRoot,
        binarySha256: fixed.objectStore.binarySha256,
      })
    : null;
  return Object.freeze({
    domain,
    runId: run.runId,
    runKey: run.runKey,
    executionRoot: root,
    evidenceRoot: `${EXECUTION_EVIDENCE_ROOT}/${domain}/${run.runKey}`,
    automaticArtifactRoot: `${EXECUTION_EVIDENCE_ROOT}/${domain}/${run.runKey}/automatic`,
    mysql: Object.freeze({
      host: fixed.mysql.host,
      port: fixed.mysql.port,
      serverUuid: fixed.mysql.serverUuid,
      profile: 't1',
      databases: Object.freeze({ local: run.local, maint: run.maint, relation: run.relation }),
    }),
    redis: Object.freeze({
      host: fixed.redis.host,
      port: fixed.redis.port,
      logicalDb: fixed.redis.allocatedDatabases[domain],
      binary: fixed.redis.binary,
      binarySha256: fixed.redis.binarySha256,
      dataRoot: fixed.redis.dataRoot,
    }),
    objectStore,
    api: Object.freeze({ host: fixed.api.isolatedHost, port: fixed.api.isolatedPort }),
    source: Object.freeze({ ...manifest.sourceModes[domain] }),
  });
}

export function assertEightDomainAcceptanceBinding({ profile, runId, mysql, redis, allocation } = {}) {
  if (profile !== 't1') throw new Error('eight-domain isolated acceptance requires T1 profile');
  requireObject(allocation, 'eight-domain isolated allocation');
  requireDomain(allocation.domain);
  const preflight = requireObject(allocation.preflight, 'isolated allocation preflight');
  if (preflight.status !== 'ready') throw new Error('isolated allocation has not passed live resource preflight');
  const preflightAt = Date.parse(requireNonBlank(preflight.observedAt, 'allocation preflight observedAt'));
  const preflightAge = Date.now() - preflightAt;
  if (!Number.isFinite(preflightAt) || preflightAge < 0 || preflightAge > 120_000) {
    throw new Error('isolated allocation live preflight is stale');
  }
  if (runId !== EIGHT_DOMAIN_RUN_IDS[allocation.domain] || allocation.runId !== runId) {
    throw new Error('isolated allocation run ID does not match the fixed domain run ID');
  }
  const digest = createHash('sha256').update(runId).digest('hex').slice(0, 16);
  const expectedRunKey = `${runId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3) || 'run'}_${digest}`;
  if (allocation.runKey !== expectedRunKey) throw new Error('isolated allocation runKey is not derived from the fixed run ID');
  if (path.resolve(requireNonBlank(allocation.executionRoot, 'allocation executionRoot')) !== ROOT) {
    throw new Error('isolated allocation execution root does not match this source worktree');
  }

  const expectedDatabasePrefix = `terria_v1_automation_acceptance_${expectedRunKey}_`;
  const databases = requireObject(allocation.mysql?.databases, 'isolated allocation databases');
  requireExactKeys(databases, ['local', 'maint', 'relation'], 'isolated allocation database roles');
  for (const role of ['local', 'maint', 'relation']) {
    if (databases[role] !== `${expectedDatabasePrefix}${role}`) {
      throw new Error(`isolated allocation ${role} database is not derived from the fixed run ID`);
    }
  }
  if (mysql?.host !== '127.0.0.1' || Number(mysql.port) !== 13306
      || allocation.mysql.host !== mysql.host || allocation.mysql.port !== Number(mysql.port)
      || allocation.mysql.serverUuid !== 'b4ae6728-4f72-11f1-bcc9-00155d37eadf') {
    throw new Error('isolated acceptance MySQL server identity mismatch');
  }

  const expectedLogicalDb = REDIS_DATABASES[allocation.domain];
  if (redis?.host !== '127.0.0.1' || Number(redis.port) !== 16380
      || redis.logicalDb !== expectedLogicalDb
      || allocation.redis?.host !== redis.host || allocation.redis.port !== Number(redis.port)
      || allocation.redis.logicalDb !== redis.logicalDb
      || allocation.redis.binarySha256 !== REDIS_BINARY_SHA256) {
    throw new Error('isolated acceptance Redis logical DB or allocation identity mismatch');
  }
  if (allocation.api?.host !== '127.0.0.1' || allocation.api.port !== 18280) {
    throw new Error('isolated acceptance API endpoint mismatch');
  }
  const expectedEvidenceRoot = `${EXECUTION_EVIDENCE_ROOT}/${allocation.domain}/${expectedRunKey}`;
  if (allocation.evidenceRoot !== expectedEvidenceRoot
      || allocation.automaticArtifactRoot !== `${expectedEvidenceRoot}/automatic`) {
    throw new Error('isolated acceptance artifact root mismatch');
  }
  if (MINIO_DOMAINS.has(allocation.domain)) {
    const expectedBucket = allocation.domain === 'armor_sets' ? 'tp-e8pr-armor-20261017' : 'tp-e8pr-bosses-20261017';
    if (allocation.objectStore?.endpoint !== 'http://127.0.0.1:19100'
        || allocation.objectStore.bucket !== expectedBucket
        || allocation.objectStore.objectPrefix !== `e8pr/${allocation.domain}/${runId}/`
        || allocation.objectStore.binarySha256 !== MINIO_BINARY_SHA256) {
      throw new Error('isolated acceptance object-store allocation mismatch');
    }
  } else if (allocation.objectStore != null) {
    throw new Error(`object store is forbidden for isolated domain ${allocation.domain}`);
  }
  return Object.freeze({ domain: allocation.domain, runId, runKey: expectedRunKey });
}

export function assertEightDomainResourcePreflight(allocation, observed) {
  requireObject(allocation, 'domain allocation');
  requireDomain(allocation.domain);
  requireObject(observed, 'observed preflight');
  const mysql = requireObject(observed.mysql, 'observed MySQL identity');
  if (mysql.host !== allocation.mysql.host || mysql.port !== allocation.mysql.port
      || mysql.serverUuid !== allocation.mysql.serverUuid) {
    throw new Error('MySQL endpoint/server identity drift');
  }
  assertExactStrings(mysql.formalSchemas, FORMAL_DATABASES, 'observed formal schemas');
  assertExactStrings(mysql.historicalSchemas, HISTORICAL_DATABASES, 'observed historical schemas');
  if (!Array.isArray(mysql.automationSchemas) || mysql.automationSchemas.length !== 0) {
    throw new Error('run-derived automation schema names already exist before allocation');
  }

  const redis = requireObject(observed.redis, 'observed Redis identity');
  if (redis.host !== allocation.redis.host || redis.port !== allocation.redis.port
      || redis.logicalDb !== allocation.redis.logicalDb
      || redis.binarySha256 !== allocation.redis.binarySha256) {
    throw new Error('Redis endpoint, logical DB, or binary identity drift');
  }

  if (allocation.objectStore == null) {
    if (observed.objectStore != null) {
      throw new Error(`object store is forbidden for domain ${allocation.domain}`);
    }
  } else {
    const objectStore = requireObject(observed.objectStore, 'observed MinIO identity');
    if (objectStore.endpoint !== allocation.objectStore.endpoint
        || objectStore.consoleEndpoint !== allocation.objectStore.consoleEndpoint
        || objectStore.bucket !== allocation.objectStore.bucket
        || objectStore.binarySha256 !== allocation.objectStore.binarySha256) {
      throw new Error('MinIO endpoint, bucket, or binary identity drift');
    }
  }

  const api = requireObject(observed.api, 'observed API endpoint');
  if (api.host !== allocation.api.host || api.port !== allocation.api.port) {
    throw new Error('isolated API endpoint drift');
  }

  const ports = requireObject(observed.ports, 'observed port availability');
  const requiredPorts = [allocation.redis.port, allocation.api.port, 19100, 19101];
  for (const port of requiredPorts) {
    if (!(ports[port] === 'free' || ports[port] === false)) {
      throw new Error(`fixed isolated port ${port} is occupied or unverified`);
    }
  }

  const roots = requireObject(observed.privateRoots, 'observed private roots');
  assertEmptyPrivateRoot(roots.redis, 'Redis data root');
  assertEmptyPrivateRoot(roots.minio, 'MinIO data root');
  if (observed.credentialSourceProtected !== true) {
    throw new Error('MySQL credential source is missing or not protected');
  }
  if (!Array.isArray(observed.activeCrawlerWriters) || observed.activeCrawlerWriters.length !== 0) {
    throw new Error('an active crawler or automation writer conflicts with this run');
  }
  return Object.freeze({
    ...allocation,
    preflight: Object.freeze({ status: 'ready', observedAt: requireNonBlank(observed.checkedAt, 'preflight checkedAt') }),
  });
}

function assertEmptyPrivateRoot(value, label) {
  const root = requireObject(value, label);
  if (root.symlink === true || (root.exists !== false && root.entries !== 0)) {
    throw new Error(`${label} is occupied, nonempty, or a symbolic link`);
  }
}
