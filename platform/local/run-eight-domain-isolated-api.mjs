import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEightDomainAcceptanceBinding } from '../../pipelines/automation/eight-domain-isolated-allocation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = Object.freeze(['consumer-readback', 'isolated-v2-attempt']);
const API_ACCOUNT_ROLE_BY_MODE = Object.freeze({
  'consumer-readback': 'apiReadonly',
  'isolated-v2-attempt': 'apiV2Test',
});
const NODE_HOME = '/home/lolben/.nvm/versions/node/v22.23.0/bin';
const JAVA_HOME = '/home/lolben/.local/share/jdks/openjdk17-root/usr/lib/jvm/java-17-openjdk-amd64';
const DEFAULT_JAVA = path.join(JAVA_HOME, 'bin/java');
const PINNED_NODE = path.join(NODE_HOME, 'node');
const PINNED_PATH = `${NODE_HOME}:${JAVA_HOME}/bin:/usr/bin:/bin`;
const API_JAR_RELATIVE_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const PRIVATE_RUNTIME_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const READBACK_DATASETS = Object.freeze(['item-transforms', 'decraft-rules', 'entity-transforms', 'npc-transforms']);
const READBACK_ROUTE_DEFINITIONS = Object.freeze({
  items: Object.freeze({
    'public-items': Object.freeze({ path: '/public/items', parameters: [], requiresAdmin: false }),
    'public-item-detail': Object.freeze({ path: '/public/items/{id}', parameters: ['id'], requiresAdmin: false }),
    'item-detail': Object.freeze({ path: '/items/{id}', parameters: ['id'], requiresAdmin: false }),
    'public-item-sources': Object.freeze({ path: '/public/items/{id}/sources', parameters: ['id'], requiresAdmin: false }),
    'public-item-images': Object.freeze({ path: '/public/items/{id}/images', parameters: ['id'], requiresAdmin: false }),
    'admin-item-recipes': Object.freeze({ path: '/admin/items/{id}/recipes', parameters: ['id'], requiresAdmin: true }),
  }),
  npcs: Object.freeze({
    'public-npc-aggregate': Object.freeze({ path: '/public/npcs/{id}/aggregate', parameters: ['id'], requiresAdmin: false }),
    'admin-npcs': Object.freeze({ path: '/admin/npcs', parameters: [], requiresAdmin: true }),
    'admin-npc-detail': Object.freeze({ path: '/admin/npcs/{id}', parameters: ['id'], requiresAdmin: true }),
  }),
  projectiles: Object.freeze({
    'public-projectiles': Object.freeze({ path: '/public/projectiles', parameters: [], requiresAdmin: false }),
    'admin-projectiles': Object.freeze({ path: '/admin/projectiles', parameters: [], requiresAdmin: true }),
    'admin-projectile-detail': Object.freeze({ path: '/admin/projectiles/{id}', parameters: ['id'], requiresAdmin: true }),
  }),
  audio: Object.freeze({
    'public-audio-assets': Object.freeze({ path: '/public/audio', parameters: [], requiresAdmin: false }),
    'public-audio-asset-detail': Object.freeze({ path: '/public/audio/{id}', parameters: ['id'], requiresAdmin: false }),
    'admin-audio-assets': Object.freeze({ path: '/admin/audio-assets', parameters: [], requiresAdmin: true }),
  }),
  bosses: Object.freeze({
    'public-bosses': Object.freeze({ path: '/public/bosses', parameters: [], requiresAdmin: false }),
    'public-boss-detail': Object.freeze({ path: '/public/bosses/{id}', parameters: ['id'], requiresAdmin: false }),
    'admin-bosses': Object.freeze({ path: '/admin/bosses', parameters: [], requiresAdmin: true }),
  }),
  armor_sets: Object.freeze({
    'public-armor-sets': Object.freeze({ path: '/public/armor-sets', parameters: [], requiresAdmin: false }),
    'public-armor-set-detail': Object.freeze({ path: '/public/armor-sets/{id}', parameters: ['id'], requiresAdmin: false }),
    'admin-armor-sets': Object.freeze({ path: '/admin/armor-sets', parameters: [], requiresAdmin: true }),
  }),
  buffs: Object.freeze({
    'public-buffs': Object.freeze({ path: '/public/buffs', parameters: [], requiresAdmin: false }),
    'public-buff-detail': Object.freeze({ path: '/public/buffs/{id}', parameters: ['id'], requiresAdmin: false }),
    'admin-buffs': Object.freeze({ path: '/admin/buffs', parameters: [], requiresAdmin: true }),
  }),
  shimmer: Object.freeze({
    'public-shimmer-overview': Object.freeze({ path: '/public/shimmer/overview', parameters: [], requiresAdmin: false }),
    'public-shimmer-context': Object.freeze({ path: '/public/shimmer/context', parameters: [], requiresAdmin: false }),
    'admin-shimmer-overview': Object.freeze({ path: '/admin/shimmer/overview', parameters: [], requiresAdmin: true }),
    'public-shimmer-item-transforms': Object.freeze({ path: '/public/shimmer/datasets/item-transforms', parameters: [], requiresAdmin: false }),
    'public-shimmer-decraft-rules': Object.freeze({ path: '/public/shimmer/datasets/decraft-rules', parameters: [], requiresAdmin: false }),
    'public-shimmer-entity-transforms': Object.freeze({ path: '/public/shimmer/datasets/entity-transforms', parameters: [], requiresAdmin: false }),
    'public-shimmer-npc-transforms': Object.freeze({ path: '/public/shimmer/datasets/npc-transforms', parameters: [], requiresAdmin: false }),
    'admin-shimmer-item-transforms': Object.freeze({ path: '/admin/shimmer/datasets/item-transforms', parameters: [], requiresAdmin: true }),
    'admin-shimmer-decraft-rules': Object.freeze({ path: '/admin/shimmer/datasets/decraft-rules', parameters: [], requiresAdmin: true }),
    'admin-shimmer-entity-transforms': Object.freeze({ path: '/admin/shimmer/datasets/entity-transforms', parameters: [], requiresAdmin: true }),
    'admin-shimmer-npc-transforms': Object.freeze({ path: '/admin/shimmer/datasets/npc-transforms', parameters: [], requiresAdmin: true }),
    'admin-shimmer-dataset': Object.freeze({ path: '/admin/shimmer/datasets/{dataset}', parameters: ['dataset'], requiresAdmin: true }),
  }),
});
export const ISOLATED_API_READBACK_ROUTES = READBACK_ROUTE_DEFINITIONS;

export function buildPublicReadinessPath(domain) {
  if (!Object.hasOwn(READBACK_ROUTE_DEFINITIONS, domain)) throw new Error(`isolated API readiness has no registered domain: ${String(domain)}`);
  return '/public/items?limit=1';
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function requireText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function requireSecret(value, label, minimum = 16) {
  const secret = requireText(value, label);
  if (secret.length < minimum || /[\r\n\0]/.test(secret)) throw new Error(`${label} is invalid`);
  return secret;
}

function resolveInsideRoot(root, value, label) {
  const resolvedRoot = path.resolve(root);
  const raw = requireText(value, label);
  const resolved = path.resolve(resolvedRoot, raw);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the execution root`);
  }
  return resolved;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashJson(value) {
  return hashBytes(JSON.stringify(value));
}

function validateMigrationEvidence(allocation, evidence) {
  if (!evidence || evidence.status !== 'verified'
      || !/^sha256:[a-f0-9]{64}$/.test(evidence.inputManifestHash ?? '')
      || evidence.inputManifest?.schemaVersion !== 1
      || !Array.isArray(evidence.inputManifest.schemaBuilders)
      || evidence.inputManifest.schemaBuilders.length !== 3
      || !Array.isArray(evidence.inputManifest.migrationFiles)
      || evidence.inputManifest.migrationFiles.length === 0
      || !Array.isArray(evidence.applied) || evidence.applied.length !== 3) {
    throw new Error('verified migration evidence and schema fingerprints are required before isolated API startup');
  }
  const expected = allocation.mysql.databases;
  for (const role of ['local', 'maint', 'relation']) {
    const row = evidence.applied.find((entry) => entry?.role === role && entry?.database === expected[role]);
    if (!row || row.inputManifestHash !== evidence.inputManifestHash
        || !Array.isArray(row.appliedSqlSha256) || row.appliedSqlSha256.length === 0
        || row.appliedSqlSha256.some((hash) => !/^sha256:[a-f0-9]{64}$/.test(hash ?? ''))
        || row.schemaFingerprint?.database !== expected[role]
        || !/^sha256:[a-f0-9]{64}$/.test(row.schemaFingerprint?.tablesSha256 ?? '')
        || !Number.isInteger(row.schemaFingerprint?.tableCount) || row.schemaFingerprint.tableCount < 1) {
      throw new Error(`migration evidence or schema fingerprint is invalid for isolated ${role} database`);
    }
  }
  return Object.freeze({
    status: 'verified',
    inputManifest: Object.freeze({
      schemaVersion: evidence.inputManifest.schemaVersion,
      schemaBuilders: Object.freeze(evidence.inputManifest.schemaBuilders.map((entry) => Object.freeze({ ...entry }))),
      migrationFiles: Object.freeze(evidence.inputManifest.migrationFiles.map((entry) => Object.freeze({ ...entry }))),
    }),
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

function redactEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).map(([key, value]) => [
    key,
    /password|secret|credential|token/i.test(key) ? '<redacted>' : value,
  ]));
}

function expectedRunPaths(allocation, mode) {
  const root = path.resolve(requireText(allocation?.executionRoot, 'allocation executionRoot'));
  const artifactRoot = resolveInsideRoot(root, allocation.automaticArtifactRoot, 'automatic artifact root');
  return Object.freeze({
    root,
    artifactRoot,
    secretsRoot: path.join(artifactRoot, 'secrets'),
    environment: path.join(artifactRoot, 'secrets', `${mode}.env.json`),
    lease: path.join(artifactRoot, 'api.lease.json'),
    minioCredentials: allocation.objectStore
      ? path.join(artifactRoot, 'secrets', 'minio.credentials.json')
      : null,
  });
}

function assertNoSymlinkPath(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    if (relative === '') return;
    throw new Error(`${label} must stay under the execution root`);
  }
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`${label} cannot traverse a symbolic link`);
      if (current !== resolvedTarget && !stat.isDirectory()) throw new Error(`${label} parent must be a directory`);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
}

function assertPrivateOrdinaryFile(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  if ((stat.mode & 0o777) !== 0o600) throw new Error(`${label} permissions must be 0600`);
  return stat;
}

function assertNotPresent(filePath, label) {
  try {
    fs.lstatSync(filePath);
    throw new Error(`${label} already exists; clean the matching run-owned API lease before reuse`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function validateModeAndCredentials(mode, credentials) {
  if (!MODES.includes(mode)) throw new Error(`isolated API mode must be one of: ${MODES.join(', ')}`);
  const value = requireObject(credentials, 'isolated API credentials');
  const allowedCredentialKeys = new Set([
    'mysql', 'apiAccount', 'redisPassword', 'admin', 'authTokenSecret', 'userTokenSecret', 'minio',
  ]);
  if (Object.keys(value).some((key) => !allowedCredentialKeys.has(key))) {
    throw new Error('isolated API credentials contain an unrecognized inherited or unsafe field');
  }
  const mysql = requireObject(value.mysql, 'MySQL API credentials');
  const account = requireObject(value.apiAccount, 'API MySQL account');
  const expectedRole = API_ACCOUNT_ROLE_BY_MODE[mode];
  if (account.role !== expectedRole) throw new Error(`${mode} requires MySQL account role ${expectedRole}`);
  if (mysql.host !== '127.0.0.1' || Number(mysql.port) !== 13306) {
    throw new Error('isolated API MySQL endpoint must be 127.0.0.1:13306');
  }
  if (!value.admin || typeof value.admin !== 'object') throw new Error('run-owned admin credentials are required');
  requireSecret(account.password, 'API account password');
  requireSecret(value.redisPassword, 'run-owned Redis password');
  requireSecret(value.admin.password, 'run-owned admin password');
  requireSecret(value.authTokenSecret, 'run-owned admin token secret', 32);
  requireSecret(value.userTokenSecret, 'run-owned user token secret', 32);
  requireText(value.admin.username, 'run-owned admin username');
  requireText(account.username, 'API MySQL username');
  if (value.minio != null) {
    const minio = requireObject(value.minio, 'MinIO credentials');
    requireText(minio.url, 'MinIO credentials URL');
    requireText(minio.accessKey, 'MinIO access key');
    requireSecret(minio.secretKey, 'MinIO secret key');
  }
  return value;
}

export function buildEightDomainApiEnvironment({
  allocation,
  mode,
  credentials,
  sourceStatePath,
  sourceManifestPath,
  isolatedAcceptanceManifestPath,
} = {}) {
  const target = requireObject(allocation, 'domain allocation');
  const input = validateModeAndCredentials(mode, credentials);
  assertEightDomainAcceptanceBinding({
    profile: 't1',
    runId: target.runId,
    mysql: input.mysql,
    redis: { host: '127.0.0.1', port: 16380, logicalDb: target.redis?.logicalDb },
    allocation: target,
  });

  const paths = expectedRunPaths(target, mode);
  const minioEnabled = target.objectStore != null;
  if (minioEnabled) {
    const minio = requireObject(input.minio, 'run-owned MinIO credentials');
    if (minio.url !== target.objectStore.endpoint) throw new Error('MinIO credentials endpoint differs from allocation');
  }

  const environment = {
    PATH: PINNED_PATH,
    JAVA_HOME,
    LANG: 'C.UTF-8',
    APP_PORT: String(target.api.port),
    SERVER_ADDRESS: target.api.host,
    TERRAPEDIA_REPO_ROOT: paths.root,
    TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT: paths.root,
    TERRAPEDIA_CRAWLER_COMMAND_ROOT: paths.root,
    TERRAPEDIA_CRAWLER_QUEUE_V2_COMMAND_ROOT: paths.root,
    TERRAPEDIA_DB_HOST: input.mysql.host,
    TERRAPEDIA_DB_PORT: String(input.mysql.port),
    TERRAPEDIA_DB_NAME: target.mysql.databases.local,
    TERRAPEDIA_DB_USERNAME: requireText(input.apiAccount.username, 'API MySQL username'),
    TERRAPEDIA_DB_PASSWORD: input.apiAccount.password,
    TERRAPEDIA_DB_URL: `jdbc:mysql://${input.mysql.host}:${input.mysql.port}/${target.mysql.databases.local}?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`,
    TERRAPEDIA_DB_MAINT: target.mysql.databases.maint,
    TERRAPEDIA_DB_RELATION: target.mysql.databases.relation,
    TERRAPEDIA_REDIS_HOST: target.redis.host,
    TERRAPEDIA_REDIS_PORT: String(target.redis.port),
    TERRAPEDIA_REDIS_DATABASE: String(target.redis.logicalDb),
    TERRAPEDIA_REDIS_PASSWORD: input.redisPassword,
    SPRING_FLYWAY_ENABLED: 'false',
    SPRING_TASK_SCHEDULING_ENABLED: 'false',
    TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED: 'false',
    TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED: 'false',
    TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY: mode === 'consumer-readback' ? 'true' : 'false',
    TERRAPEDIA_MAIL_ENABLED: 'false',
    TERRAPEDIA_ADMIN_USERNAME: requireText(input.admin.username, 'run-owned admin username'),
    TERRAPEDIA_ADMIN_PASSWORD: input.admin.password,
    TERRAPEDIA_AUTH_TOKEN_SECRET: input.authTokenSecret,
    TERRAPEDIA_USER_TOKEN_SECRET: input.userTokenSecret,
    TERRAPEDIA_MINIO_ENABLED: String(minioEnabled),
    TERRAPEDIA_MINIO_AUTO_CREATE_BUCKET: 'false',
    TERRAPEDIA_MINIO_PUBLIC_READ: 'false',
  };

  if (minioEnabled) {
    environment.TERRAPEDIA_MINIO_CREDENTIALS_FILE = paths.minioCredentials;
    environment.TERRAPEDIA_MINIO_ENDPOINT = target.objectStore.endpoint;
    environment.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT = target.objectStore.endpoint;
    environment.TERRAPEDIA_MINIO_BUCKET = target.objectStore.bucket;
    environment.TERRAPEDIA_MINIO_OBJECT_PREFIX = target.objectStore.objectPrefix;
    environment.TERRAPEDIA_MANAGED_IMAGE_OBJECT_PREFIXES = target.domain;
  }

  if (mode === 'isolated-v2-attempt') {
    const sourceState = resolveInsideRoot(paths.root, sourceStatePath, 'run-local source-state path');
    const sourceManifest = resolveInsideRoot(paths.root, sourceManifestPath, 'run-local source manifest path');
    const isolatedManifest = resolveInsideRoot(paths.root, isolatedAcceptanceManifestPath, 'isolated V2 acceptance manifest path');
    const expectedState = path.join(paths.root, PRIVATE_RUNTIME_ROOT, 'source-state', `${target.domain}.json`);
    const expectedManifest = path.join(paths.root, PRIVATE_RUNTIME_ROOT, 'source-manifests', `${target.domain}.json`);
    const expectedIsolatedManifest = path.join(paths.root, PRIVATE_RUNTIME_ROOT, 'acceptance-manifests', `${target.domain}.json`);
    if (sourceState !== expectedState || sourceManifest !== expectedManifest || isolatedManifest !== expectedIsolatedManifest) {
      throw new Error('run-local source state, source manifest, and acceptance manifest must use their exact domain-owned paths');
    }
    environment.TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH = sourceState;
    environment.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE = 'true';
    environment.TERRAPEDIA_EIGHT_DOMAIN_DOMAIN = target.domain;
    environment.TERRAPEDIA_EIGHT_DOMAIN_RUN_ID = target.runId;
    environment.TERRAPEDIA_EIGHT_DOMAIN_SOURCE_PROBE_MODE = 'frozen-run-manifest';
    environment.TERRAPEDIA_EIGHT_DOMAIN_SOURCE_MANIFEST_PATH = sourceManifest;
    environment.TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_MANIFEST_PATH = isolatedManifest;
    environment.TERRAPEDIA_CRAWLER_SOURCE_MODE = 'local';
    environment.TERRAPEDIA_EIGHT_DOMAIN_ARTIFACT_ROOT = paths.artifactRoot;
  }
  return Object.freeze(environment);
}

export async function readEightDomainApiRoutes({
  allocation,
  mode,
  credentials,
  routes,
  sourceStatePath,
  sourceManifestPath,
  isolatedAcceptanceManifestPath,
  fetchImpl = fetch,
  requestTimeoutMs = 8_000,
  validateResponse,
  acceptance = null,
  leasePath,
  leaseVerificationImpl = verifyRunOwnedApiLease,
  processIdentityImpl = inspectProcessIdentity,
  portOwnerImpl = inspectLoopbackPortOwner,
} = {}) {
  const target = requireObject(allocation, 'domain allocation');
  buildEightDomainApiEnvironment({
    allocation, mode, credentials, sourceStatePath, sourceManifestPath, isolatedAcceptanceManifestPath,
  });
  if (!Array.isArray(routes) || routes.length === 0 || routes.length > 12) {
    throw new Error('bounded API readback accepts one through twelve declared routes');
  }
  const domainRoutes = READBACK_ROUTE_DEFINITIONS[target.domain];
  if (!domainRoutes) throw new Error('isolated API domain has no readback route registry');
  const seen = new Set();
  const requests = routes.map((entry) => {
    const route = requireObject(entry, 'readback route declaration');
    const routeId = requireText(route.routeId, 'readback route ID');
    const definition = domainRoutes[routeId];
    if (!definition) throw new Error(`readback route is not registered for isolated domain ${target.domain}`);
    if (seen.has(routeId)) throw new Error('bounded API readback route IDs must be unique');
    seen.add(routeId);
    const parameters = route.params == null ? {} : requireObject(route.params, 'readback route parameters');
    if (Object.keys(parameters).sort().join(',') !== [...definition.parameters].sort().join(',')) {
      throw new Error(`readback route ${routeId} has missing or unexpected parameters`);
    }
    let routePath = definition.path;
    for (const parameter of definition.parameters) {
      const value = requireText(parameters[parameter], `readback route ${routeId} ${parameter}`);
      if (parameter === 'id' && !/^[1-9][0-9]{0,18}$/.test(value)) {
        throw new Error(`readback route ${routeId} has an unsafe numeric ID`);
      }
      if (parameter === 'dataset' && !READBACK_DATASETS.includes(value)) {
        throw new Error(`readback route ${routeId} has an unsupported Shimmer dataset`);
      }
      routePath = routePath.replace(`{${parameter}}`, encodeURIComponent(value));
    }
    return Object.freeze({
      routeId,
      requiresAdmin: definition.requiresAdmin,
      url: `http://${target.api.host}:${target.api.port}/api${routePath}`,
    });
  });

  await leaseVerificationImpl({ allocation, mode, leasePath, processIdentityImpl, portOwnerImpl });

  const needsAdmin = requests.some((request) => request.requiresAdmin);
  let token = null;
  try {
    if (needsAdmin) token = await loginRunOwnedAdmin({
      baseUrl: `http://${target.api.host}:${target.api.port}/api`,
      admin: credentials.admin,
      fetchImpl,
      requestTimeoutMs,
    });
    const results = [];
    for (const request of requests) {
      const response = await fetchImpl(request.url, {
        method: 'GET',
        headers: request.requiresAdmin ? { authorization: `Bearer ${token}` } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const body = await response.text();
      if (response.status !== 200 || !response.ok) {
        throw new Error(`isolated API readback route ${request.routeId} returned HTTP ${response.status}`);
      }
      let payload;
      try { payload = JSON.parse(body); } catch { throw new Error(`isolated API readback route ${request.routeId} returned invalid JSON`); }
      let responseValidation = null;
      if (validateResponse != null) {
        if (typeof validateResponse !== 'function') throw new Error('isolated API response validator must be a function');
        responseValidation = await validateResponse({ routeId: request.routeId, payload, acceptance });
      }
      results.push(Object.freeze({
        routeId: request.routeId,
        status: response.status,
        bodySha256: hashJson(payload),
        ...(responseValidation == null ? {} : { responseValidation }),
      }));
    }
    return Object.freeze(results);
  } finally {
    token = null;
  }
}

export function createEightDomainApiLifecycle({
  allocation,
  mode,
  credentials,
  jarPath,
  expectedJarSha256,
  migrationEvidence,
  routes,
  sourceStatePath,
  sourceManifestPath,
  isolatedAcceptanceManifestPath,
  validateResponse,
  startImpl = startEightDomainIsolatedApi,
  readbackImpl = readEightDomainApiRoutes,
  stopImpl = stopEightDomainIsolatedApi,
} = {}) {
  const target = requireObject(allocation, 'domain allocation');
  if (!MODES.includes(mode)) throw new Error(`unsupported isolated API lifecycle mode: ${String(mode)}`);
  validateModeAndCredentials(mode, credentials);
  const paths = expectedRunPaths(target, mode);
  const fixed = Object.freeze({
    allocation: target,
    mode,
    credentials,
    jarPath: requireText(jarPath, 'catalog API jar path'),
    expectedJarSha256: requireText(expectedJarSha256, 'catalog API jar SHA-256'),
    migrationEvidence,
    routes,
    sourceStatePath,
    sourceManifestPath,
    isolatedAcceptanceManifestPath,
    validateResponse,
    environmentFile: paths.environment,
    leasePath: paths.lease,
  });
  const binding = Object.freeze({
    domain: target.domain,
    runId: target.runId,
    runKey: target.runKey,
    mode,
    mysql: Object.freeze({
      host: credentials.mysql.host,
      port: Number(credentials.mysql.port),
      databases: Object.freeze({ ...target.mysql.databases }),
      apiAccountRole: credentials.apiAccount.role,
      apiAccountUsername: credentials.apiAccount.username,
    }),
    redis: Object.freeze({ ...target.redis }),
    api: Object.freeze({ ...target.api }),
    leasePath: paths.lease,
    migrationEvidenceHash: migrationEvidence.inputManifestHash,
  });
  let started = false;
  let startResult = null;
  return Object.freeze({
    binding,
    async start(context = {}) {
      if (started) throw new Error('isolated API lifecycle has already started');
      if (context.runId !== target.runId) throw new Error('isolated API lifecycle run ID differs from its fixed allocation');
      const result = await startImpl(fixed);
      if (!result || typeof result !== 'object') throw new Error('isolated API start did not return a run-owned lease');
      started = true;
      startResult = result;
      return result;
    },
    async readback(context = {}) {
      if (!started || !startResult || context.started !== startResult) throw new Error('isolated API readback requires its exact successful start lease');
      return readbackImpl({
        allocation: target,
        mode,
        credentials,
        routes,
        sourceStatePath,
        sourceManifestPath,
        isolatedAcceptanceManifestPath,
        validateResponse,
        leasePath: paths.lease,
        started: startResult,
        acceptance: context.acceptance ?? null,
      });
    },
    async stop(context = {}) {
      if (!started || !startResult || context.started !== startResult) throw new Error('isolated API stop requires its exact successful start lease');
      const result = await stopImpl({
        allocation: target,
        leasePath: paths.lease,
        started: startResult,
        readback: context.readback ?? null,
      });
      if (result?.stopped === true) {
        started = false;
        startResult = null;
      }
      return result;
    },
  });
}

export async function writePrivateApiEnvironment(filePath, environment) {
  const target = path.resolve(requireText(filePath, 'API environment path'));
  const value = requireObject(environment, 'API environment');
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof entry !== 'string') {
      throw new Error('API environment must contain only named string bindings');
    }
  }
  await ensurePrivateDirectory(path.dirname(target));
  assertNotPresent(target, 'API environment file');
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temporary, target);
    await fs.promises.chmod(target, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return Object.freeze({ path: target, mode: '0600', configSha256: hashJson(redactEnvironment(value)) });
}

export function readPrivateApiEnvironment(filePath) {
  const target = path.resolve(requireText(filePath, 'API environment path'));
  assertPrivateOrdinaryFile(target, 'API environment file');
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  requireObject(value, 'API environment file payload');
  if (!value.PATH || !value.APP_PORT || !value.SERVER_ADDRESS || !value.TERRAPEDIA_DB_URL
      || !value.TERRAPEDIA_DB_MAINT || !value.TERRAPEDIA_DB_RELATION || !value.TERRAPEDIA_REDIS_HOST) {
    throw new Error('API environment file is missing required bindings');
  }
  if (Object.values(value).some((entry) => typeof entry !== 'string')) {
    throw new Error('API environment file contains a non-string binding');
  }
  return Object.freeze(value);
}

export async function writePrivateMinioCredentials({ filePath, allocation, credentials } = {}) {
  const targetAllocation = requireObject(allocation, 'domain allocation');
  if (!targetAllocation.objectStore) throw new Error(`MinIO is not allocated for domain ${targetAllocation.domain ?? ''}`);
  const paths = expectedRunPaths(targetAllocation, 'consumer-readback');
  const target = resolveInsideRoot(paths.root, filePath, 'MinIO credentials path');
  if (target !== paths.minioCredentials) throw new Error('MinIO credentials must use the run-owned credentials path');
  const value = requireObject(credentials, 'MinIO credentials');
  if (value.url !== targetAllocation.objectStore.endpoint) throw new Error('MinIO credential URL differs from the fixed endpoint');
  const payload = {
    url: requireText(value.url, 'MinIO credentials url'),
    accessKey: requireText(value.accessKey, 'MinIO access key'),
    secretKey: requireSecret(value.secretKey, 'MinIO secret key'),
  };
  await ensurePrivateDirectory(paths.secretsRoot, paths.root);
  assertNoSymlinkPath(paths.root, target, 'MinIO credentials path');
  assertNotPresent(target, 'MinIO credentials file');
  await writePrivateJson(target, payload, paths.root);
  return Object.freeze({ path: target, mode: '0600', sha256: hashBytes(fs.readFileSync(target)) });
}

export async function startEightDomainIsolatedApi({
  allocation,
  mode,
  credentials,
  sourceStatePath,
  sourceManifestPath,
  isolatedAcceptanceManifestPath,
  jarPath,
  expectedJarSha256,
  migrationEvidence,
  environmentFile,
  leasePath,
  javaPath = DEFAULT_JAVA,
  portAvailableImpl = isLoopbackPortAvailable,
  spawnImpl = spawnOwnedJava,
  waitForReadyImpl = waitForPublicReadiness,
  portOwnerImpl = inspectLoopbackPortOwner,
  processIdentityImpl = inspectProcessIdentity,
  waitForExitImpl = waitForProcessExit,
  runtimeCheckImpl = verifyPinnedRuntime,
} = {}) {
  const input = validateModeAndCredentials(mode, credentials);
  const paths = expectedRunPaths(allocation, mode);
  const verifiedMigrationEvidence = validateMigrationEvidence(allocation, migrationEvidence);
  if (path.resolve(javaPath) !== DEFAULT_JAVA) throw new Error('API launch must use the pinned Java 17 executable');
  await runtimeCheckImpl({ javaPath: DEFAULT_JAVA, nodePath: PINNED_NODE });
  const jar = resolveInsideRoot(paths.root, jarPath, 'catalog API jar path');
  const expectedJar = path.join(paths.root, API_JAR_RELATIVE_PATH);
  if (jar !== expectedJar) throw new Error('catalog API jar must use the pinned execution-worktree artifact path');
  assertNoSymlinkPath(paths.root, jar, 'catalog API jar path');
  const jarStat = fs.lstatSync(jar);
  if (!jarStat.isFile() || jarStat.isSymbolicLink()) throw new Error('catalog API jar must be an ordinary file');
  const jarSha256 = hashBytes(fs.readFileSync(jar));
  if (jarSha256 !== requireText(expectedJarSha256, 'expected catalog API jar SHA-256')) {
    throw new Error('catalog API jar SHA-256 mismatch');
  }
  const envPath = resolveInsideRoot(paths.root, environmentFile, 'API environment path');
  const leaseFile = resolveInsideRoot(paths.root, leasePath, 'API lease path');
  if (leaseFile !== paths.lease || envPath !== paths.environment) {
    throw new Error('API lease/environment path is outside the fixed run-owned location');
  }
  const env = buildEightDomainApiEnvironment({ allocation, mode, credentials, sourceStatePath, sourceManifestPath, isolatedAcceptanceManifestPath });
  if (!await portAvailableImpl(allocation.api.port)) throw new Error(`isolated API port ${allocation.api.port} is occupied`);

  assertNoSymlinkPath(paths.root, paths.artifactRoot, 'API artifact root');
  assertNoSymlinkPath(paths.root, envPath, 'API environment path');
  assertNoSymlinkPath(paths.root, leaseFile, 'API lease path');
  assertNotPresent(leaseFile, 'API lease');
  assertNotPresent(envPath, 'API environment file');
  if (paths.minioCredentials) {
    assertNoSymlinkPath(paths.root, paths.minioCredentials, 'MinIO credentials path');
    assertNotPresent(paths.minioCredentials, 'MinIO credentials file');
    if (!input.minio) throw new Error('run-owned MinIO credentials are required for this domain');
  }

  let child;
  let minioCredentialsFile = null;
  let environmentWritten = false;
  try {
    if (paths.minioCredentials) {
      const minio = await writePrivateMinioCredentials({
        allocation,
        credentials: input.minio,
        filePath: paths.minioCredentials,
      });
      minioCredentialsFile = minio.path;
    }
    const envEvidence = await writePrivateApiEnvironment(envPath, env);
    environmentWritten = true;
    child = await spawnImpl({ javaPath, jarPath: jar, cwd: paths.root, env });
    const pid = Number(child?.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('isolated API process did not return a valid PID');
    const deadline = Date.now() + 30_000;
    let ownerPid = null;
    while (Date.now() < deadline) {
      ownerPid = await portOwnerImpl(allocation.api.port);
      if (ownerPid === pid) break;
      if (child.exitCode != null) throw new Error(`isolated API exited before binding its port (exit ${child.exitCode})`);
      await delay(100);
    }
    if (ownerPid !== pid) throw new Error('isolated API port is not owned by the run-owned PID');
    const identity = await processIdentityImpl(pid);
    if (!identity || !String(identity.commandLine).includes(jar) || !String(identity.startIdentity ?? '')) {
      throw new Error('isolated API process identity does not match the pinned jar');
    }
    const ready = await waitForReadyImpl({
      baseUrl: `http://${allocation.api.host}:${allocation.api.port}/api`,
      mode,
      domain: allocation.domain,
      credentials: { admin: input.admin },
    });
    if (ready?.status !== 200 || !/^sha256:[a-f0-9]{64}$/.test(ready.bodySha256 ?? '')) {
      throw new Error('isolated API public/admin readiness probe failed');
    }
    const leasePayload = {
      schemaVersion: 1,
      domain: allocation.domain,
      runId: allocation.runId,
      runKey: allocation.runKey,
      mode,
      pid,
      processStartIdentity: identity.startIdentity,
      commandLineSha256: hashBytes(String(identity.commandLine)),
      jarPath: jar,
      jarSha256,
      migrationEvidence: verifiedMigrationEvidence,
      port: allocation.api.port,
      host: allocation.api.host,
      environmentFile: envPath,
      environmentConfigSha256: envEvidence.configSha256,
      minioCredentialsFile,
      minioCredentialsSha256: minioCredentialsFile ? hashBytes(fs.readFileSync(minioCredentialsFile)) : null,
      readyProbe: { status: ready.status, bodySha256: ready.bodySha256 },
      startedAt: new Date().toISOString(),
    };
    await writePrivateJson(leaseFile, leasePayload, paths.root);
    return Object.freeze(leasePayload);
  } catch (error) {
    let stopped = true;
    if (child && Number.isSafeInteger(Number(child.pid)) && Number(child.pid) > 0) {
      try {
        child.kill('SIGTERM');
        stopped = await waitForExitImpl(Number(child.pid), null);
      } catch {
        stopped = false;
      }
    }
    if (!stopped) {
      throw new AggregateError([error], 'isolated API startup failed and its run-owned process did not stop; cleanup is incomplete');
    }
    if (environmentWritten) await removePrivateOwnedFile(envPath, 'API environment file');
    if (minioCredentialsFile) await removePrivateOwnedFile(minioCredentialsFile, 'MinIO credentials file');
    await fs.promises.rm(leaseFile, { force: true });
    throw error;
  }
}

export async function stopEightDomainIsolatedApi({
  allocation,
  leasePath,
  processIdentityImpl = inspectProcessIdentity,
  portOwnerImpl = inspectLoopbackPortOwner,
  killImpl = (pid) => process.kill(pid, 'SIGTERM'),
  waitForExitImpl = waitForProcessExit,
  portAvailableImpl = isLoopbackPortAvailable,
} = {}) {
  const modeHint = 'consumer-readback';
  const paths = expectedRunPaths(allocation, modeHint);
  const leaseFile = resolveInsideRoot(paths.root, leasePath, 'API lease path');
  if (leaseFile !== paths.lease) throw new Error('API lease path is outside the run-owned artifact root');
  assertNoSymlinkPath(paths.root, leaseFile, 'API lease path');
  assertPrivateOrdinaryFile(leaseFile, 'API lease file');
  const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
  const mode = lease.mode;
  if (!MODES.includes(mode)) throw new Error('API lease mode is invalid');
  const modePaths = expectedRunPaths(allocation, mode);
  const expectedJarPath = path.join(paths.root, API_JAR_RELATIVE_PATH);
  if (lease.schemaVersion !== 1 || lease.runId !== allocation.runId || lease.runKey !== allocation.runKey
      || lease.domain !== allocation.domain || lease.port !== allocation.api.port || lease.host !== allocation.api.host
      || lease.jarPath !== expectedJarPath || !/^sha256:[a-f0-9]{64}$/.test(lease.jarSha256 ?? '')
      || lease.environmentFile !== modePaths.environment
      || lease.minioCredentialsFile !== modePaths.minioCredentials) {
    throw new Error('API lease does not match the fixed allocation');
  }
  const jarStat = fs.lstatSync(lease.jarPath);
  if (!jarStat.isFile() || jarStat.isSymbolicLink() || hashBytes(fs.readFileSync(lease.jarPath)) !== lease.jarSha256) {
    throw new Error('pinned catalog API jar changed after the run-owned lease was written');
  }
  assertPrivateOrdinaryFile(lease.environmentFile, 'API environment file');
  const leaseEnvironment = readPrivateApiEnvironment(lease.environmentFile);
  if (hashJson(redactEnvironment(leaseEnvironment)) !== lease.environmentConfigSha256
      || leaseEnvironment.APP_PORT !== String(allocation.api.port)
      || leaseEnvironment.TERRAPEDIA_DB_NAME !== allocation.mysql.databases.local
      || leaseEnvironment.TERRAPEDIA_REDIS_DATABASE !== String(allocation.redis.logicalDb)) {
    throw new Error('API environment no longer matches the run-owned lease binding');
  }
  if (lease.minioCredentialsFile) {
    assertPrivateOrdinaryFile(lease.minioCredentialsFile, 'MinIO credentials file');
    if (!/^sha256:[a-f0-9]{64}$/.test(lease.minioCredentialsSha256 ?? '')
        || hashBytes(fs.readFileSync(lease.minioCredentialsFile)) !== lease.minioCredentialsSha256) {
      throw new Error('MinIO credentials changed after the run-owned lease was written');
    }
  } else if (lease.minioCredentialsSha256 != null) {
    throw new Error('API lease has a MinIO credential hash without an allocated credential file');
  }
  const pid = Number(lease.pid);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('API lease PID is invalid');
  const identity = await processIdentityImpl(pid);
  if (!identity || identity.startIdentity !== lease.processStartIdentity
      || !String(identity.commandLine).includes(lease.jarPath)
      || hashBytes(String(identity.commandLine)) !== lease.commandLineSha256) {
    throw new Error('API PID/process identity changed; refusing to stop an unowned process');
  }
  if (await portOwnerImpl(lease.port) !== pid) throw new Error('API port owner differs from the run-owned PID');
  await killImpl(pid);
  if (!await waitForExitImpl(pid, lease.processStartIdentity)) throw new Error('run-owned API process did not stop');
  if (!await portAvailableImpl(lease.port)) throw new Error('API port remains occupied after stopping the run-owned process');
  if (fs.existsSync(lease.environmentFile)) await removePrivateOwnedFile(lease.environmentFile, 'API environment file');
  if (lease.minioCredentialsFile && fs.existsSync(lease.minioCredentialsFile)) {
    await removePrivateOwnedFile(lease.minioCredentialsFile, 'MinIO credentials file');
  }
  await removePrivateOwnedFile(leaseFile, 'API lease file');
  return Object.freeze({ stopped: true, cleanupVerified: true, pid, port: lease.port, runId: lease.runId });
}

export async function isLoopbackPortAvailable(port) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', (error) => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve(true)));
  });
}

async function spawnOwnedJava({ javaPath, jarPath, cwd, env }) {
  return spawn(javaPath, ['-jar', jarPath], { cwd, env, detached: true, stdio: 'ignore' });
}

async function inspectLoopbackPortOwner(port) {
  const { stdout } = await execute('/usr/bin/ss', ['-ltnpH', 'sport', '=', `:${port}`]);
  const match = stdout.match(/pid=(\d+)/);
  return match ? Number(match[1]) : null;
}

async function inspectProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    const fieldsAfterCommand = stat.slice(end + 2).trim().split(/\s+/);
    return { commandLine: cmdline, startIdentity: fieldsAfterCommand[19] };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
    throw error;
  }
}

async function waitForPublicReadiness({ baseUrl, mode, domain, credentials }) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}${buildPublicReadinessPath(domain)}`, { signal: AbortSignal.timeout(2500) });
      const text = await response.text();
      if (!response.ok) throw new Error(`public readiness returned HTTP ${response.status}`);
      const publicBody = JSON.parse(text);
      if (!publicBody || typeof publicBody !== 'object') throw new Error('public readiness body is invalid');
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials.admin),
        redirect: 'error',
        signal: AbortSignal.timeout(2500),
      });
      const loginText = await login.text();
      if (!login.ok) throw new Error(`run-owned admin login returned HTTP ${login.status}`);
      const loginBody = JSON.parse(loginText);
      const token = loginBody?.data?.token ?? loginBody?.data?.data?.token;
      if (typeof token !== 'string' || !token) throw new Error('run-owned admin login returned no token');
      const overview = await fetch(`${baseUrl}/admin/crawler-monitor/overview`, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(2500),
      });
      const overviewText = await overview.text();
      if (!overview.ok) throw new Error(`admin readiness returned HTTP ${overview.status}`);
      const adminOverview = JSON.parse(overviewText);
      return { status: 200, bodySha256: hashJson({ publicBody, adminOverview, mode }) };
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`isolated API readiness timed out${lastError ? `: ${lastError.message}` : ''}`);
}

async function loginRunOwnedAdmin({ baseUrl, admin, fetchImpl, requestTimeoutMs }) {
  const response = await fetchImpl(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(admin),
    redirect: 'error',
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const body = await response.text();
  if (!response.ok || response.status !== 200) throw new Error(`run-owned admin login returned HTTP ${response.status}`);
  let payload;
  try { payload = JSON.parse(body); } catch { throw new Error('run-owned admin login returned invalid JSON'); }
  const token = payload?.data?.token ?? payload?.data?.data?.token;
  if (typeof token !== 'string' || !token) throw new Error('run-owned admin login returned no token');
  return token;
}

async function verifyRunOwnedApiLease({ allocation, mode, leasePath, processIdentityImpl, portOwnerImpl } = {}) {
  const paths = expectedRunPaths(allocation, mode);
  const leaseFile = resolveInsideRoot(paths.root, leasePath, 'API lease path');
  if (leaseFile !== paths.lease) throw new Error('API readback requires the exact run-owned API lease path');
  assertNoSymlinkPath(paths.root, leaseFile, 'API lease path');
  assertPrivateOrdinaryFile(leaseFile, 'API lease file');
  const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
  if (lease.schemaVersion !== 1 || lease.mode !== mode || lease.domain !== allocation.domain
      || lease.runId !== allocation.runId || lease.runKey !== allocation.runKey
      || lease.host !== allocation.api.host || lease.port !== allocation.api.port
      || lease.environmentFile !== paths.environment || lease.jarPath !== path.join(paths.root, API_JAR_RELATIVE_PATH)) {
    throw new Error('API readback lease differs from the fixed allocation');
  }
  const env = readPrivateApiEnvironment(lease.environmentFile);
  if (hashJson(redactEnvironment(env)) !== lease.environmentConfigSha256
      || env.APP_PORT !== String(allocation.api.port) || env.SERVER_ADDRESS !== allocation.api.host
      || env.TERRAPEDIA_DB_NAME !== allocation.mysql.databases.local
      || env.TERRAPEDIA_REDIS_DATABASE !== String(allocation.redis.logicalDb)
      || env.SPRING_TASK_SCHEDULING_ENABLED !== 'false') {
    throw new Error('API readback environment differs from the fixed consumer/V2 bindings');
  }
  const pid = Number(lease.pid);
  const identity = await processIdentityImpl(pid);
  if (!identity || identity.startIdentity !== lease.processStartIdentity
      || !String(identity.commandLine).includes(lease.jarPath)
      || hashBytes(String(identity.commandLine)) !== lease.commandLineSha256) {
    throw new Error('API readback process identity differs from the run-owned lease');
  }
  if (await portOwnerImpl(lease.port) !== pid) throw new Error('API readback port owner differs from the run-owned PID');
  return true;
}

async function verifyPinnedRuntime({ javaPath, nodePath }) {
  if (!fs.existsSync(javaPath) || !fs.statSync(javaPath).isFile()
      || !fs.existsSync(nodePath) || !fs.statSync(nodePath).isFile()) {
    throw new Error('pinned Node.js 22 or Java 17 executable is missing');
  }
  const node = await execute(nodePath, ['--version']);
  if (node.stdout.trim() !== 'v22.23.0') throw new Error('pinned Node.js runtime version mismatch');
  const java = await execute(javaPath, ['-version']);
  if (!/version "17\.0\.18(?:[+"-])/.test(java.stderr)) throw new Error('pinned Java runtime version mismatch');
}

async function waitForProcessExit(pid, startIdentity, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await inspectProcessIdentity(pid);
    if (!current || (startIdentity && current.startIdentity !== startIdentity)) return true;
    await delay(100);
  }
  return false;
}

async function execute(command, args) {
  const child = spawn(command, args, { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`${path.basename(command)} failed${stderr ? `: ${stderr.trim()}` : ''}`);
  return { stdout, stderr };
}

async function ensurePrivateDirectory(directory, root = directory) {
  const resolved = path.resolve(directory);
  const rootPath = path.resolve(root);
  const relative = path.relative(rootPath, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('private directory must stay inside its approved root');
  }
  assertNoSymlinkPath(rootPath, resolved, 'private directory');
  await fs.promises.mkdir(resolved, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('private directory must be an ordinary directory');
  await fs.promises.chmod(resolved, 0o700);
}

async function writePrivateJson(filePath, value, root = path.dirname(filePath)) {
  const target = path.resolve(filePath);
  await ensurePrivateDirectory(path.dirname(target), root);
  assertNoSymlinkPath(root, target, 'private JSON path');
  assertNotPresent(target, 'private JSON file');
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.promises.rename(temporary, target);
    await fs.promises.chmod(target, 0o600);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

async function removePrivateOwnedFile(filePath, label) {
  assertPrivateOrdinaryFile(filePath, label);
  await fs.promises.rm(filePath);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
