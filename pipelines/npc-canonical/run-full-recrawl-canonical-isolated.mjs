import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { buildEightDomainAllocationPlan, assertEightDomainAcceptanceBinding } from '../automation/eight-domain-isolated-allocation.mjs';
import { buildDependencyManifest } from '../automation/eight-domain-dependency-seeder.mjs';
import {
  buildExecutionCodeBundleManifest,
  verifyExecutionCodeBundleManifest,
} from '../automation/eight-domain-execution-code-bundle.mjs';
import { buildIsolatedApiLifecycle, buildRunOwnedApiCredentials, runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { runLandingImport } from '../landing/import-source-dataset-landings.mjs';
import { runIndependentEntityImport } from '../import/import-independent-entities-to-db.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';
import { DEFAULT_MANAGED_IMAGE_URL_PREFIXES } from '../relation/managed-image-url-policy.mjs';
import {
  assertNpcHybridSourceDecision,
  buildLocalNpcSourceBinding,
  buildNpcOfflineLocalDecision,
} from './npc-hybrid-source-selection.mjs';

const REQUIRED_NPC_COUNT = 762;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_MANIFEST_PATH = 'reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017/npcs';
const NPC_EVIDENCE_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017/npcs';
const ITEM_COLUMNS = Object.freeze([
  'id', 'name', 'name_zh', 'internal_name', 'image', 'category_id', 'description', 'damage', 'defense',
  'knockback', 'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'rarity_id', 'game_period_id',
  'game_model_id', 'is_stackable', 'stack_size', 'status', 'deleted',
]);
const CATEGORY_COLUMNS = Object.freeze([
  'id', 'parent_id', 'name', 'code', 'top_type', 'sort', 'description', 'icon', 'status', 'creator_id', 'deleted',
]);
const NPC_CATEGORY_FALLBACK_CODES = Object.freeze([
  'CATEGORY_NPC_FRIENDLY_TOWN',
  'CATEGORY_NPC_FRIENDLY_OTHER',
  'CATEGORY_NPC_FRIENDLY',
  'CATEGORY_NPC_ENEMY',
  'CATEGORY_NPC',
]);

function hashCanonical(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256File(filePath) {
  return hashBytes(fs.readFileSync(filePath));
}

function npcIsTown(record) {
  return record?.flags?.friendly === true
    && (record?.extras?.townNPC === true || record?.extras?.townnpc === true);
}

function sourcePathForManifest(filePath) {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(REPO_ROOT, absolutePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return absolutePath;
  }
  return relativePath.replaceAll('\\', '/');
}

export function assertNpcOfflineSourcePins({ sourceManifest, executionManifest } = {}) {
  const expectedPaths = [
    'data/standardized/npcs.standardized.json',
    'data/standardized-view/npcs/_meta.json',
    'data/generated/npc-standardized-map.json',
  ];
  const sourceHashes = executionManifest?.sourceHashes;
  if (!sourceHashes || typeof sourceHashes !== 'object' || Array.isArray(sourceHashes)) {
    throw new Error('NPC offline source pin requires the fixed execution manifest source hashes');
  }
  const files = sourceManifest?.sourceFiles;
  if (!Array.isArray(files) || files.length !== expectedPaths.length) {
    throw new Error('NPC offline source manifest must bind exactly the three frozen source files');
  }
  for (const [index, expectedPath] of expectedPaths.entries()) {
    const entry = files.find((file) => file?.path === expectedPath);
    if (!entry || entry.recordCount !== REQUIRED_NPC_COUNT
        || entry.sha256 !== sourceHashes[expectedPath]
        || !/^sha256:[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error(`NPC offline execution manifest source hash mismatch: ${expectedPath}`);
    }
    if (files[index]?.path !== expectedPath) {
      throw new Error('NPC offline source manifest files are not in the fixed deterministic order');
    }
  }
  return true;
}

export function resolveNpcRedisLeasePaths(executionManifest) {
  const redis = executionManifest?.redis;
  const dataRoot = String(redis?.dataRoot ?? '').trim();
  const authSecretFile = String(redis?.authSecretFile ?? '').trim();
  if (!dataRoot || path.isAbsolute(dataRoot) || !authSecretFile || path.isAbsolute(authSecretFile)) {
    throw new Error('NPC fixed Redis data root and auth file must be repository-relative paths');
  }
  const redisRoot = path.resolve(REPO_ROOT, dataRoot);
  const authPath = path.resolve(REPO_ROOT, authSecretFile);
  const rootRelative = path.relative(REPO_ROOT, redisRoot);
  const authRelative = path.relative(redisRoot, authPath);
  if (rootRelative.startsWith('..') || path.isAbsolute(rootRelative)
      || authRelative !== 'redis.auth' || path.isAbsolute(authRelative)) {
    throw new Error('NPC Redis auth file must stay inside the fixed Redis resource root');
  }
  return Object.freeze({
    leasePath: path.join(redisRoot, 'resource-lease.json'),
    authPath,
  });
}

export function buildNpcRuntimeArtifactBinding({
  executionManifest,
  codeBundle,
  codeBundleVerification,
  apiJarSha256,
} = {}) {
  if (codeBundleVerification?.status !== 'verified'
      || codeBundleVerification.bundleSha256 !== codeBundle?.bundleSha256
      || !/^sha256:[a-f0-9]{64}$/.test(codeBundle?.bundleSha256 ?? '')
      || !/^sha256:[a-f0-9]{64}$/.test(apiJarSha256 ?? '')) {
    throw new Error('NPC runtime artifact binding requires verified code bundle and API JAR hashes');
  }
  const fixedApiJarSha256 = executionManifest?.installation?.backendJarSha256 ?? null;
  return Object.freeze({
    codeBundleSha256: codeBundle.bundleSha256,
    baseCommit: codeBundle.baseCommit,
    runtimeFileCount: codeBundle.files.length,
    apiJarSha256,
    fixedManifestApiJarSha256: fixedApiJarSha256,
    fixedManifestApiJarPinStatus: fixedApiJarSha256 === apiJarSha256 ? 'matched' : 'stale',
  });
}

export function buildNpcOfflineSourceManifest({
  localSource,
  failedProbe,
  authorization,
  runId,
  runKey,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (authorization !== 'user-directed-local-offline') {
    throw new Error('NPC offline source requires the explicit user-directed local-offline authorization');
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,100}$/.test(runId ?? '')
      || !/^e8p_[0-9a-f]{16}$/.test(runKey ?? '')) {
    throw new Error('NPC offline source run identity is invalid');
  }
  const decision = assertNpcHybridSourceDecision(buildNpcOfflineLocalDecision({
    localBinding: buildLocalNpcSourceBinding(localSource),
    failedProbe,
    authorization,
  }));
  const standardizedBytes = fs.readFileSync(localSource.standardizedPath);
  const metadataBytes = fs.readFileSync(localSource.viewMetaPath);
  const mapBytes = fs.readFileSync(localSource.mapPath);
  const standardized = JSON.parse(standardizedBytes.toString('utf8'));
  const records = standardized.records;
  if (records.length !== REQUIRED_NPC_COUNT) throw new Error('NPC offline source must contain exactly 762 records');
  const nonTownCount = records.filter((record) => !npcIsTown(record)).length;
  const townCount = records.length - nonTownCount;
  if (nonTownCount !== 723 || townCount !== 39) {
    throw new Error('NPC offline source partition counts differ from the validated 723/39 contract');
  }
  const stableIds = records.map((record) => Number(record.id)).sort((left, right) => left - right);
  const sourceBase = {
    schemaVersion: 1,
    manifestKind: 'npc_offline_local_maintained_source',
    status: 'ready',
    sourceMode: decision.mode,
    authorization,
    wikiUnchanged: false,
    runId,
    runKey,
    generatedAt,
    offlineReason: 'Wiki API probe unavailable; user directed this NPC run to use the validated local source.',
    failedProbe: decision.failedProbe,
    sourceKey: decision.sourceKey,
    sourceIdentity: decision.localBinding.sourceIdentity,
    sourceManifestContentHash: decision.localBinding.sourceManifestContentHash,
    sourceRevisionTimestamp: standardized.upstreamMeta?.sourceRevisionTimestamp ?? null,
    wikiVersion: standardized.upstreamMeta?.wikiVersion ?? null,
    recordCount: records.length,
    partitionCounts: { non_town: nonTownCount, town: townCount },
    stableIdsSha256: hashCanonical(stableIds),
    sourceFiles: [
      { path: sourcePathForManifest(localSource.standardizedPath), sha256: hashBytes(standardizedBytes), recordCount: records.length },
      { path: sourcePathForManifest(localSource.viewMetaPath), sha256: hashBytes(metadataBytes), recordCount: REQUIRED_NPC_COUNT },
      { path: sourcePathForManifest(localSource.mapPath), sha256: hashBytes(mapBytes), recordCount: REQUIRED_NPC_COUNT },
    ],
  };
  return Object.freeze({ ...sourceBase, manifestSha256: hashCanonical(sourceBase) });
}

export function buildNpcLocalSourceFromFailedProbe({ localSourcePaths, failedProbeArtifact } = {}) {
  const binding = failedProbeArtifact?.localBinding;
  if (failedProbeArtifact?.status !== 'probe_unavailable'
      || failedProbeArtifact.actionId !== 'domain-source-npcs'
      || failedProbeArtifact.phase !== 'wiki-revision-probe'
      || binding?.sourceKey !== 'wiki.module.npcinfo'
      || !binding.sourceIdentity || !binding.sourceManifestContentHash) {
    throw new Error('NPC offline local source requires the frozen Wiki identity from the failed probe artifact');
  }
  return Object.freeze({
    ...localSourcePaths,
    wikiManifestRecord: Object.freeze({
      sourceKey: binding.sourceKey,
      ...binding.sourceIdentity,
      contentHash: binding.sourceManifestContentHash,
    }),
  });
}

export function buildNpcDependencyManifest({ runId, runKey, databases, itemRows, categoryRows } = {}) {
  const uniqueRows = (rows, id, label) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`NPC ${label} dependency rows are empty`);
    const ids = rows.map((row) => Number(row.id));
    if (ids.some((value) => !Number.isSafeInteger(value)) || new Set(ids).size !== ids.length) {
      throw new Error(`NPC ${label} dependency rows have invalid or duplicate IDs`);
    }
    return rows;
  };
  const exactItems = uniqueRows(itemRows, 'id', 'Item');
  const exactCategories = uniqueRows(categoryRows, 'id', 'category');
  if (NPC_CATEGORY_FALLBACK_CODES.some((code) => !exactCategories.some((row) => row.code === code))) {
    throw new Error('NPC category dependency rows must include all exact category fallback codes');
  }
  const dependency = ({ id, purpose, table, columns, rows, targetPolicy = 'empty-only', conflictColumns = undefined }) => ({
    id,
    purpose,
    source: { database: 'terria_v1_local', table },
    target: { database: databases.local, table },
    keyColumns: ['id'],
    keyValues: rows.map((row) => ({ id: Number(row.id) })),
    columns: [...columns],
    rowHashes: [],
    expectedRowCount: rows.length,
    ...(targetPolicy === 'empty-only' ? {} : { targetPolicy }),
    ...(conflictColumns ? { conflictColumns } : {}),
  });
  const skeleton = {
    schemaVersion: 1,
    domain: 'npcs',
    runId,
    runKey,
    dependencies: [
      dependency({ id: 'npc-banner-catch-item-dependencies', purpose: 'npc-banner-catch-item-dependencies', table: 'items', columns: ITEM_COLUMNS, rows: exactItems }),
      dependency({
        id: 'npc-category-lookup-dependencies',
        purpose: 'npc-category-lookup-dependencies',
        table: 'category',
        columns: CATEGORY_COLUMNS,
        rows: exactCategories,
        targetPolicy: 'append-exact',
        conflictColumns: ['id', 'code'],
      }),
    ],
  };
  return buildDependencyManifest({
    manifest: skeleton,
    sourceRows: {
      'npc-banner-catch-item-dependencies': exactItems,
      'npc-category-lookup-dependencies': exactCategories,
    },
  });
}

function parseMysqlJsonRows(output, label) {
  const text = String(output ?? '').trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${label} returned invalid JSON`, { cause: error }); }
  });
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error(`unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

async function queryExactSourceRows(readonlyClient, database, table, columns, keyColumn, values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`NPC exact dependency ${table} cannot be empty`);
  const jsonPairs = columns.flatMap((column) => [`'${column}'`, quoteIdentifier(column)]).join(', ');
  const sql = `SELECT JSON_OBJECT(${jsonPairs}) FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(keyColumn)} IN (${values.map(Number).join(',')}) ORDER BY ${quoteIdentifier(keyColumn)}`;
  const rows = parseMysqlJsonRows(await readonlyClient.query(sql, database), `${database}.${table}`);
  if (rows.length !== new Set(values.map(Number)).size) throw new Error(`NPC exact dependency ${database}.${table} is missing source keys`);
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
}

async function queryNpcCategoryRows(readonlyClient) {
  const jsonPairs = CATEGORY_COLUMNS.flatMap((column) => [`'${column}'`, quoteIdentifier(column)]).join(', ');
  const sql = `SELECT JSON_OBJECT(${jsonPairs}) FROM ${quoteIdentifier('category')} WHERE ${quoteIdentifier('code')} IN (${NPC_CATEGORY_FALLBACK_CODES.map((code) => `'${code}'`).join(',')}) AND ${quoteIdentifier('status')} = 1 AND ${quoteIdentifier('deleted')} = 0 ORDER BY ${quoteIdentifier('id')}`;
  const rows = parseMysqlJsonRows(await readonlyClient.query(sql, 'terria_v1_local'), 'NPC local.category source');
  if (rows.length !== NPC_CATEGORY_FALLBACK_CODES.length
      || NPC_CATEGORY_FALLBACK_CODES.some((code) => !rows.some((row) => row.code === code))) {
    throw new Error('NPC category source does not contain all exact fallback codes');
  }
  return rows;
}

export function buildNpcApiRoutes({ npcDatabaseId = 1 } = {}) {
  const id = Number(npcDatabaseId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('NPC API representative database ID is invalid');
  return Object.freeze([
    Object.freeze({ routeId: 'public-npc-aggregate', params: Object.freeze({ id: String(id) }) }),
    Object.freeze({ routeId: 'admin-npcs', params: Object.freeze({}) }),
    Object.freeze({ routeId: 'admin-npc-detail', params: Object.freeze({ id: String(id) }) }),
  ]);
}

export function createNpcOfflineAcceptanceExecutor({
  source,
  landing,
  execute = executeNpcOfflineMaintainedChain,
} = {}) {
  if (!source || !landing || typeof execute !== 'function') {
    throw new Error('NPC offline acceptance executor requires the bound source, landing, and maintained chain');
  }
  return (context) => execute({ context, source, landing });
}

export function validateNpcApiResponse({ routeId, payload, acceptance } = {}) {
  if (!['public-npc-aggregate', 'admin-npcs', 'admin-npc-detail'].includes(routeId)) {
    throw new Error(`NPC isolated API returned an unregistered route: ${String(routeId)}`);
  }
  if (payload?.success !== true || Number(payload.statusCode) !== 200) {
    throw new Error(`NPC isolated API route ${routeId} did not return a successful API envelope`);
  }
  const expected = acceptance?.apiNpc;
  if (!expected || !Number.isSafeInteger(Number(expected.databaseId))
      || !Number.isSafeInteger(Number(expected.sourceId)) || !String(expected.internalName ?? '').trim()) {
    throw new Error('NPC API readback is missing its exact run-local source identity');
  }
  let row;
  if (routeId === 'public-npc-aggregate') row = payload.data?.npc;
  else if (routeId === 'admin-npc-detail') row = payload.data;
  else if (Array.isArray(payload.data)) {
    row = payload.data.find((entry) => Number(entry?.id) === Number(expected.databaseId));
  }
  if (!row || Number(row.id) !== Number(expected.databaseId)) {
    throw new Error(`NPC API route ${routeId} did not return the exact run-local database ID`);
  }
  const sourceId = Number(row.gameId ?? row.sourceId);
  if (sourceId !== Number(expected.sourceId) || row.internalName !== expected.internalName) {
    throw new Error(`NPC API route ${routeId} stable source identity mismatch: expected ${JSON.stringify({ sourceId: Number(expected.sourceId), internalName: expected.internalName })}, received ${JSON.stringify({ sourceId, internalName: row.internalName ?? null })}`);
  }
  return Object.freeze({
    matched: true,
    databaseId: Number(row.id),
    sourceId,
    internalName: row.internalName,
  });
}

function processStartIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  } catch {
    return null;
  }
}

function redisCommand({ host, port, password }, logicalDb, ...args) {
  return execFileSync('redis-cli', ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), ...args], {
    encoding: 'utf8',
    timeout: 3000,
    env: { ...process.env, REDISCLI_AUTH: password },
  }).trim();
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => reject(new Error(`NPC fixed API port ${port} is not free`, { cause: error })));
    server.listen(port, host, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

async function preflightNpcAllocation() {
  const executionManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, EXECUTION_MANIFEST_PATH), 'utf8'));
  const config = loadLocalStackConfig(REPO_ROOT);
  const mysqlModule = loadMysqlModule({ repoRoot: REPO_ROOT });
  const mysqlConfig = config.database ?? {};
  const mysqlConnection = await mysqlModule.createConnection({
    host: executionManifest.mysql.host,
    port: executionManifest.mysql.port,
    user: mysqlConfig.username,
    password: mysqlConfig.password,
    dateStrings: true,
  });
  let identity;
  let schemas;
  let formalNpcCount;
  let formalNpcRowsSha256;
  try {
    const [[server]] = await mysqlConnection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
    identity = server;
    [schemas] = await mysqlConnection.query(
      'SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME',
    );
    const [formalNpcRows] = await mysqlConnection.query('SELECT * FROM terria_v1_local.npcs ORDER BY id');
    formalNpcCount = formalNpcRows.length;
    formalNpcRowsSha256 = hashCanonical(formalNpcRows);
  } finally { await mysqlConnection.end(); }
  if (identity.serverUuid !== executionManifest.mysql.serverUuid || Number(identity.port) !== executionManifest.mysql.port) {
    throw new Error('NPC MySQL identity differs from the fixed execution manifest');
  }

  const runKey = executionManifest.mysql.runKeys.npcs;
  const expectedSchemas = Object.values(executionManifest.mysql.expectedSchemas.npcs);
  const existingNpcSchemas = schemas.map((row) => row.name).filter((name) => expectedSchemas.includes(name));
  if (existingNpcSchemas.length) throw new Error(`NPC run-derived schemas already exist: ${existingNpcSchemas.join(',')}`);

  const redisPaths = resolveNpcRedisLeasePaths(executionManifest);
  const redisLease = JSON.parse(fs.readFileSync(redisPaths.leasePath, 'utf8'));
  const redisBinaryHash = hashBytes(fs.readFileSync(redisLease.binary));
  const redisPassword = fs.readFileSync(redisPaths.authPath, 'utf8').trim();
  if (redisLease.status !== 'ready' || redisLease.host !== executionManifest.redis.host
      || Number(redisLease.port) !== executionManifest.redis.port
      || redisBinaryHash !== executionManifest.redis.binarySha256
      || processStartIdentity(Number(redisLease.pid)) !== String(redisLease.processStartIdentity)
      || (fs.statSync(redisPaths.authPath).mode & 0o077) !== 0) {
    throw new Error('NPC Redis lease identity is invalid');
  }
  const redis = {
    host: executionManifest.redis.host,
    port: executionManifest.redis.port,
    logicalDb: executionManifest.redis.allocatedDatabases.npcs,
    password: redisPassword,
  };
  if (redisCommand(redis, redis.logicalDb, 'PING') !== 'PONG'
      || redisCommand(redis, redis.logicalDb, 'DBSIZE') !== '0') {
    throw new Error('NPC allocated Redis DB2 is not healthy and empty');
  }
  await assertPortFree(executionManifest.api.isolatedHost, executionManifest.api.isolatedPort);

  const ancestorPids = new Set();
  let ancestorPid = process.pid;
  while (Number.isSafeInteger(ancestorPid) && ancestorPid > 1 && !ancestorPids.has(ancestorPid)) {
    ancestorPids.add(ancestorPid);
    try {
      const stat = fs.readFileSync(`/proc/${ancestorPid}/stat`, 'utf8');
      ancestorPid = Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[1]);
    } catch { break; }
  }
  const processes = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const writerPattern = /(?:fetch-wiki-(?:npc|item|boss)|run-wiki-sync|run-backend-data-refresh|npc-hybrid-source-probe|run-full-recrawl-canonical-isolated|crawler.*worker)/i;
  const activeWriters = processes.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return !ancestorPids.has(pid) && writerPattern.test(line);
  });
  if (activeWriters.length) throw new Error(`NPC data writer is already active: ${activeWriters[0]}`);

  const jarPath = path.join(REPO_ROOT, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar');
  const jarStat = fs.lstatSync(jarPath);
  if (!jarStat.isFile() || jarStat.isSymbolicLink()) throw new Error('NPC isolated API JAR must be an ordinary file');
  const jarSha256 = sha256File(jarPath);
  const codeBundle = buildExecutionCodeBundleManifest({ repoRoot: REPO_ROOT });
  const codeBundleVerification = verifyExecutionCodeBundleManifest(codeBundle, { repoRoot: REPO_ROOT });
  const runtimeArtifactBinding = buildNpcRuntimeArtifactBinding({
    executionManifest,
    codeBundle,
    codeBundleVerification,
    apiJarSha256: jarSha256,
  });
  const keyRegistryPath = path.join(REPO_ROOT, PRIVATE_ROOT, 'run-keys.json');
  fs.mkdirSync(path.dirname(keyRegistryPath), { recursive: true, mode: 0o700 });
  const runKeyRegistry = openDurableRunKeyRegistry(keyRegistryPath);
  const baseAllocation = buildEightDomainAllocationPlan({
    manifest: executionManifest,
    domain: 'npcs',
    repoRoot: REPO_ROOT,
    runKeyRegistry,
  });
  if (baseAllocation.runKey !== runKey) throw new Error('NPC allocation runKey differs from the fixed execution manifest');
  const allocation = Object.freeze({
    ...baseAllocation,
    preflight: Object.freeze({ status: 'ready', observedAt: new Date().toISOString() }),
  });
  const mysql = {
    host: executionManifest.mysql.host,
    port: executionManifest.mysql.port,
    username: mysqlConfig.username,
    password: mysqlConfig.password,
  };
  const identityBinding = assertEightDomainAcceptanceBinding({
    profile: 't1', runId: allocation.runId, mysql, redis, allocation,
  });
  return {
    allocation, identityBinding, executionManifest, mysql, redis, formalNpcCount, formalNpcRowsSha256,
    codeBundle, runtimeArtifactBinding,
  };
}

function readFailedProbe({ repoRoot, failedProbePath }) {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, failedProbePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !relative.startsWith('.local/tmp/')) {
    throw new Error('NPC failed Wiki probe artifact must be inside the private run root');
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('NPC failed Wiki probe artifact must be a private ordinary file');
  }
  const bytes = fs.readFileSync(absolute);
  const artifact = JSON.parse(bytes.toString('utf8'));
  return {
    artifact,
    binding: {
      status: artifact.status,
      actionId: artifact.actionId,
      phase: artifact.phase,
      artifactPath: relative.replaceAll('\\', '/'),
      artifactSha256: hashBytes(bytes),
      reason: artifact.reason,
      localBinding: artifact.localBinding,
    },
  };
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function makeLandingEntry({ source, sourceManifest, runKey } = {}) {
  const serialized = JSON.stringify(source);
  const hash = hashBytes(Buffer.from(serialized, 'utf8')).slice('sha256:'.length);
  const timestamp = source.upstreamMeta.sourceRevisionTimestamp;
  return Object.freeze({
    datasetType: 'npcs_base_raw',
    provider: 'terraria.wiki.gg',
    sourceKind: 'repository_frozen_offline',
    sourceKey: 'wiki.module.npcinfo',
    sourceLocator: `execution-local://${sourceManifest.sourceFiles[0].path}`,
    sourcePage: 'Module:Npcinfo/data',
    sourceRevisionTimestamp: timestamp,
    contentHash: hash,
    payload: source,
    payloadBytes: Buffer.byteLength(serialized, 'utf8'),
    fetchedAt: source.generatedAt,
    parsedAt: new Date().toISOString(),
    parseStatus: 'ok',
    artifactRole: 'source_evidence',
    producerId: 'npc-offline-local-acceptance',
    producerVersion: '1',
    producerRunKey: runKey,
    fullFileContentHash: sourceManifest.sourceFiles[0].sha256.slice('sha256:'.length),
    fullFileByteSize: fs.statSync(path.resolve(REPO_ROOT, sourceManifest.sourceFiles[0].path)).size,
    notes: 'User-directed local NPC source run while Wiki API is unavailable; this does not assert Wiki unchanged.',
  });
}

function makeLandingTableRow(row) {
  return {
    id: Number(row.id),
    dataset_type: row.dataset_type,
    provider: row.provider,
    source_kind: row.source_kind,
    source_key: row.source_key,
    source_locator: row.source_locator,
    source_page: row.source_page,
    source_revision_timestamp: row.source_revision_timestamp,
    content_hash: row.content_hash,
    payload_json: row.payload_json,
    fetched_at: row.fetched_at,
    parsed_at: row.parsed_at,
    parse_status: row.parse_status,
    is_current: Number(row.is_current),
  };
}

function mysqlOptionsFor(context) {
  return {
    host: context.mysql.host,
    port: Number(context.mysql.port),
    user: context.mysql.username,
    password: context.mysql.password,
  };
}

export async function executeNpcOfflineMaintainedChain({ context, source, landing } = {}) {
  const mysql = loadMysqlModule({ repoRoot: REPO_ROOT });
  const options = mysqlOptionsFor(context);
  const landingResult = await runLandingImport({
    apply: true,
    allowNonPrimaryDb: true,
    database: context.databases.local,
    db: { ...options, database: context.databases.local },
    datasets: ['npcs_base_raw'],
    repoRoot: REPO_ROOT,
  }, {
    mysqlModule: mysql,
    locateDatasetEntries: async () => [landing],
    writeReport: async () => null,
  });
  const landingConnection = await mysql.createConnection({ ...options, database: context.databases.local, dateStrings: true });
  let landingRows;
  try {
    [landingRows] = await landingConnection.query(
      'SELECT * FROM `source_dataset_landings` WHERE dataset_type = ? AND source_key = ? AND is_current = 1 ORDER BY id',
      ['npcs_base_raw', landing.sourceKey],
    );
  } finally {
    await landingConnection.end();
  }
  if (landingRows.length !== 1) throw new Error('NPC run-local base landing must read back exactly one current row');
  const landed = makeLandingTableRow(landingRows[0]);

  const dependencyConnection = await mysql.createConnection({ ...options, database: context.databases.local, multipleStatements: false, dateStrings: true });
  const itemDependency = context.dependencyManifest.dependencies.find((entry) => entry.id === 'npc-banner-catch-item-dependencies');
  const categoryDependency = context.dependencyManifest.dependencies.find((entry) => entry.id === 'npc-category-lookup-dependencies');
  let itemRows;
  let categoryRows;
  try {
    [itemRows] = await dependencyConnection.query(
      `SELECT id, internal_name, name FROM items WHERE id IN (${itemDependency.keyValues.map((key) => Number(key.id)).join(',')}) ORDER BY id`,
    );
    [categoryRows] = await dependencyConnection.query(
      `SELECT id, code FROM category WHERE id IN (${categoryDependency.keyValues.map((key) => Number(key.id)).join(',')}) ORDER BY id`,
    );
  } finally { await dependencyConnection.end(); }
  if (itemRows.length !== itemDependency.expectedRowCount || categoryRows.length !== categoryDependency.expectedRowCount) {
    throw new Error('NPC exact seeded Item/category dependency readback is incomplete');
  }

  const baselineConnection = await mysql.createConnection({ ...options, database: context.databases.local, dateStrings: true });
  let baselineNpcCount;
  let baselineNpcAutoIncrement;
  try {
    const [[baseline]] = await baselineConnection.query(
      'SELECT COUNT(*) AS rowCount, (SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'npcs\') AS nextId FROM npcs',
    );
    baselineNpcCount = Number(baseline.rowCount);
    baselineNpcAutoIncrement = Number(baseline.nextId);
  } finally { await baselineConnection.end(); }
  if (baselineNpcCount !== 0 || baselineNpcAutoIncrement !== 1) {
    throw new Error(`NPC run-local table is not empty with a fresh identity sequence: ${JSON.stringify({ baselineNpcCount, baselineNpcAutoIncrement })}`);
  }

  const localConnection = await mysql.createConnection({ ...options, database: context.databases.local, multipleStatements: false, dateStrings: true });
  let npcImport;
  try {
    await localConnection.beginTransaction();
    npcImport = await runIndependentEntityImport({
      apply: true,
      'allow-non-primary-db': 'true',
      database: context.databases.local,
      entity: 'npcs',
      'data-dir': path.join(REPO_ROOT, 'data', 'standardized'),
    }, {
      connection: localConnection,
      transactionOwner: 'caller',
      datasets: {
        npcs: source,
        items: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/standardized/items.standardized.json'), 'utf8')),
      },
      itemRows,
      categoryRows,
      npcZhRows: Object.values(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/generated/npc-standardized-map.json'), 'utf8')).records)
        .map((row) => ({ internalName: row.internalName, nameZh: row.nameZh, subNameZh: row.subNameZh })),
    });
    await localConnection.commit();
  } catch (error) {
    await localConnection.rollback();
    throw error;
  } finally {
    await localConnection.end();
  }
  const stats = npcImport?.npcs;
  if (stats?.input !== REQUIRED_NPC_COUNT || stats.created + stats.updated + stats.skipped !== REQUIRED_NPC_COUNT || stats.errors.length > 0) {
    throw new Error(`NPC local import did not process all 762 rows: ${JSON.stringify(stats)}`);
  }
  const [localNpcRows] = await mysql.createConnection({ ...options, database: context.databases.local }).then(async (connection) => {
    try {
      return await connection.query('SELECT id, source_id, game_id, internal_name, name, category_id, banner_source_item_id, banner_item_id, catch_source_item_id, catch_item_id, status, deleted FROM npcs WHERE deleted = 0 AND status = 1 ORDER BY source_id');
    } finally { await connection.end(); }
  });
  const expectedIds = source.records.map((record) => Number(record.id)).sort((a, b) => a - b);
  if (localNpcRows.length !== REQUIRED_NPC_COUNT
      || JSON.stringify(localNpcRows.map((row) => Number(row.source_id))) !== JSON.stringify(expectedIds)
      || localNpcRows.some((row) => Number(row.game_id) !== Number(row.source_id))) {
    throw new Error('NPC local business readback differs from the exact 762 stable IDs or game_id mapping');
  }
  const apiNpc = localNpcRows.find((row) => Number(row.id) === 1);
  if (!apiNpc) throw new Error('NPC run-local database did not retain the first inserted representative row');

  const maintSync = await runMaintSync({
    apply: true,
    scopes: ['npcs'],
    host: context.mysql.host,
    port: context.mysql.port,
    user: context.mysql.username,
    password: context.mysql.password,
    database: context.databases.maint,
  }, {
    config: { database: { ...options, username: context.mysql.username } },
    zhSourceIndexes: {
      itemsByInternalName: new Map(),
      npcsByInternalName: new Map(source.records.map((row) => [String(row.internalName).toLowerCase(), {
        nameZh: row.localized?.zh?.name,
        subNameZh: row.localized?.zh?.namesub,
      }])),
      projectilesByInternalName: new Map(),
    },
    loadLandingRows: async () => [landed],
    writeReport: async () => null,
  });
  const maintConnection = await mysql.createConnection({ ...options, database: context.databases.maint });
  let maintRows;
  try {
    [maintRows] = await maintConnection.query(
      'SELECT source_id, internal_name, landing_source_id, landing_content_hash, status, deleted FROM maint_npcs WHERE status = 1 AND deleted = 0 ORDER BY source_id',
    );
  } finally { await maintConnection.end(); }
  if (maintRows.length !== REQUIRED_NPC_COUNT
      || JSON.stringify(maintRows.map((row) => Number(row.source_id))) !== JSON.stringify(expectedIds)
      || maintRows.some((row) => Number(row.landing_source_id) !== Number(landed.id))) {
    throw new Error('NPC maint readback is incomplete or has incorrect landing lineage');
  }

  const config = loadLocalStackConfig(REPO_ROOT);
  const relationSync = await runSync({
    apply: true,
    createDatabase: false,
    localDatabase: context.databases.local,
    maintDatabase: context.databases.maint,
    relationDatabase: context.databases.relation,
    allowLocalItemImageFallback: false,
    scopes: ['npc'],
  }, {
    config: { ...config, database: { ...options, username: context.mysql.username } },
    managedImageUrlPrefixes: DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
    writeReports: async ({ repoRoot }) => {
      const reportRoot = path.resolve(repoRoot, '.local/tmp/eight-domain-production-readiness/20261017/npcs/relation-reports');
      fs.mkdirSync(reportRoot, { recursive: true, mode: 0o700 });
      return {
        auditJsonPath: path.join(reportRoot, 'npc-audit.json'),
        auditMdPath: path.join(reportRoot, 'npc-audit.md'),
        conflictsPath: path.join(reportRoot, 'npc-conflicts.json'),
        unresolvedPath: path.join(reportRoot, 'npc-unresolved.json'),
      };
    },
  });
  const relationConnection = await mysql.createConnection({ ...options, database: context.databases.relation });
  let relationRows;
  let projectionRows;
  try {
    [relationRows] = await relationConnection.query('SELECT * FROM relation_npcs ORDER BY source_id');
    [projectionRows] = await relationConnection.query('SELECT * FROM projection_npcs ORDER BY source_id');
  } finally { await relationConnection.end(); }
  if (relationRows.length !== REQUIRED_NPC_COUNT || projectionRows.length !== REQUIRED_NPC_COUNT
      || JSON.stringify(relationRows.map((row) => Number(row.source_id))) !== JSON.stringify(expectedIds)
      || JSON.stringify(projectionRows.map((row) => Number(row.source_id))) !== JSON.stringify(expectedIds)) {
    throw new Error(`NPC relation/projection exact identity readback mismatch: ${JSON.stringify({ relationNpcs: relationRows.length, projectionNpcs: projectionRows.length })}`);
  }
  const relationCounts = { relationNpcs: relationRows.length, projectionNpcs: projectionRows.length };
  return {
    status: 'passed',
    sourceMode: 'local-offline-authorized',
    sourceRecordCount: REQUIRED_NPC_COUNT,
    landing: { currentRows: landingResult.rows.inserted + landingResult.rows.updated + landingResult.rows.unchanged + landingResult.rows.replaced, sourceKey: landing.sourceKey, contentHash: landing.contentHash },
    localImport: stats,
    localReadback: { count: localNpcRows.length, rowsSha256: hashCanonical(localNpcRows) },
    apiNpc: {
      databaseId: Number(apiNpc.id),
      sourceId: Number(apiNpc.source_id),
      internalName: apiNpc.internal_name,
    },
    maintSync: { writes: maintSync.writes, readbackCount: maintRows.length, rowsSha256: hashCanonical(maintRows) },
    relationSync: {
      entityBreakdown: relationSync.summary.entityBreakdown,
      projectionNpcCount: relationSync.summary.projectionNpcCount ?? relationSync.results.projectionNpcs.length,
      readback: relationCounts,
      relationRowsSha256: hashCanonical(relationRows),
      projectionRowsSha256: hashCanonical(projectionRows),
    },
  };
}

function writeArtifact(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}

export async function runNpcOfflineLocalAcceptance(options = {}) {
  const failedProbePath = options.failedProbePath ?? `${PRIVATE_ROOT}/source-decision.json`;
  const probe = readFailedProbe({ repoRoot: REPO_ROOT, failedProbePath });
  if (probe.artifact.status !== 'probe_unavailable' || probe.artifact.actionId !== 'domain-source-npcs') {
    throw new Error('NPC offline local mode requires a recorded failed NPC Wiki source probe');
  }
  const prepared = await preflightNpcAllocation();
  const runId = prepared.allocation.runId;
  const runKey = prepared.allocation.runKey;
  const localSource = buildNpcLocalSourceFromFailedProbe({
    localSourcePaths: {
      standardizedPath: path.join(REPO_ROOT, 'data/standardized/npcs.standardized.json'),
      viewMetaPath: path.join(REPO_ROOT, 'data/standardized-view/npcs/_meta.json'),
      mapPath: path.join(REPO_ROOT, 'data/generated/npc-standardized-map.json'),
    },
    failedProbeArtifact: probe.artifact,
  });
  const source = JSON.parse(fs.readFileSync(localSource.standardizedPath, 'utf8'));
  const offlineAuthorization = 'user-directed-local-offline';
  const sourceManifest = buildNpcOfflineSourceManifest({
    localSource,
    failedProbe: probe.binding,
    authorization: offlineAuthorization,
    runId,
    runKey,
  });
  assertNpcOfflineSourcePins({ sourceManifest, executionManifest: prepared.executionManifest });
  const attemptId = `${Date.now()}-${process.pid}`;
  const privateRunRoot = path.join(REPO_ROOT, PRIVATE_ROOT, 'offline-acceptance', attemptId);
  fs.mkdirSync(privateRunRoot, { recursive: true, mode: 0o700 });
  const codeBundlePath = path.join(privateRunRoot, 'execution-code-bundle.json');
  writePrivateJson(codeBundlePath, prepared.codeBundle);
  const sourceManifestPath = path.join(privateRunRoot, 'source-manifest.json');
  writePrivateJson(sourceManifestPath, sourceManifest);
  const dependencyManifestPath = path.join(privateRunRoot, 'dependencies.json');
  const dependencyIds = [...new Set(source.records.flatMap((record) => [record.banner, record.extras?.catchItem])
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  const landing = makeLandingEntry({ source, sourceManifest, runKey });
  const privateLandingPath = path.join(privateRunRoot, 'landing-source.json');
  writePrivateJson(privateLandingPath, {
    datasetType: landing.datasetType,
    sourceKey: landing.sourceKey,
    sourcePage: landing.sourcePage,
    sourceRevisionTimestamp: landing.sourceRevisionTimestamp,
    contentHash: landing.contentHash,
    payloadBytes: landing.payloadBytes,
    payloadHash: hashBytes(Buffer.from(JSON.stringify(landing.payload), 'utf8')),
  });

  const apiRoutes = buildNpcApiRoutes({ npcDatabaseId: 1 });
  const acceptanceExecutor = createNpcOfflineAcceptanceExecutor({
    source,
    landing,
    execute: (chainContext) => {
      verifyExecutionCodeBundleManifest(prepared.codeBundle, { repoRoot: REPO_ROOT });
      if (sha256File(path.join(REPO_ROOT, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'))
          !== prepared.runtimeArtifactBinding.apiJarSha256) {
        throw new Error('NPC API JAR changed after the run-bound runtime artifact preflight');
      }
      const chainResult = executeNpcOfflineMaintainedChain(chainContext);
      writePrivateJson(path.join(privateRunRoot, 'maintained-chain-result.json'), chainResult);
      return chainResult;
    },
  });
  const isolatedApiLifecycleFactory = async ({ manifest, adapter }) => {
    if (!manifest.migrationEvidence) throw new Error('NPC run-owned API requires verified migration evidence');
    const credentials = buildRunOwnedApiCredentials({
      mysql: { host: prepared.mysql.host, port: prepared.mysql.port },
      apiAccount: adapter.apiAccounts.apiReadonly,
      redisPassword: prepared.redis.password,
      runKey,
    });
    return buildIsolatedApiLifecycle({
      allocation: prepared.allocation,
      mode: 'consumer-readback',
      credentials,
      migrationEvidence: manifest.migrationEvidence,
      routes: apiRoutes,
      validateResponse: validateNpcApiResponse,
    });
  };

  const privateDirectory = path.join(
    REPO_ROOT,
    prepared.allocation.automaticArtifactRoot,
    'acceptance-runs',
    `offline-local-${attemptId}`,
  );
  const execution = await runLiveAutomationAcceptance({
    profile: 't1',
    runId,
    mysql: prepared.mysql,
    redis: prepared.redis,
    environmentId: 'eight-domain-production-readiness',
    privateDirectory,
    scope: 'npc-hybrid-maintained',
    acceptanceExecutor,
    isolatedAllocation: prepared.allocation,
    isolatedApiLifecycleFactory,
    onResources: async () => {
      verifyExecutionCodeBundleManifest(prepared.codeBundle, { repoRoot: REPO_ROOT });
      if (sha256File(path.join(REPO_ROOT, 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar'))
          !== prepared.runtimeArtifactBinding.apiJarSha256) {
        throw new Error('NPC API JAR changed after the run-bound runtime artifact preflight');
      }
    },
    dependencyManifestFactory: async ({ runId: factoryRunId, runKey: factoryRunKey, databases, readonlyClient }) => {
      verifyExecutionCodeBundleManifest(prepared.codeBundle, { repoRoot: REPO_ROOT });
      if (factoryRunId !== runId || factoryRunKey !== runKey) throw new Error('NPC exact dependency factory run identity drift');
      const items = await queryExactSourceRows(readonlyClient, 'terria_v1_local', 'items', ITEM_COLUMNS, 'id', dependencyIds);
      const categories = await queryNpcCategoryRows(readonlyClient);
      if (items.length !== dependencyIds.length) throw new Error('NPC Item dependency source does not close every banner/catchItem reference');
      const dependencyManifest = buildNpcDependencyManifest({ runId, runKey, databases, itemRows: items, categoryRows: categories });
      writePrivateJson(dependencyManifestPath, dependencyManifest);
      return dependencyManifest;
    },
  });
  if (execution.cleanupPassed !== true) throw new Error('NPC isolated cleanup did not pass');

  const outputPath = options.outputPath
    ?? `${NPC_EVIDENCE_ROOT}/${runKey}/local-offline-maintained-${attemptId}.json`;
  const outputAbsolute = path.resolve(REPO_ROOT, outputPath);
  if (!outputAbsolute.startsWith(`${path.join(REPO_ROOT, NPC_EVIDENCE_ROOT)}${path.sep}`)) {
    throw new Error('NPC baseline evidence must stay under the exact NPC runtime evidence root');
  }
  const mysql = loadMysqlModule({ repoRoot: REPO_ROOT });
  const formalConnection = await mysql.createConnection({
    host: prepared.mysql.host,
    port: prepared.mysql.port,
    user: prepared.mysql.username,
    password: prepared.mysql.password,
    database: 'terria_v1_local',
    dateStrings: true,
  });
  let formalNpcCountAfter;
  let formalNpcRowsSha256After;
  try {
    const [formalNpcRowsAfter] = await formalConnection.query('SELECT * FROM npcs ORDER BY id');
    formalNpcCountAfter = formalNpcRowsAfter.length;
    formalNpcRowsSha256After = hashCanonical(formalNpcRowsAfter);
  } finally { await formalConnection.end(); }
  if (formalNpcCountAfter !== prepared.formalNpcCount
      || formalNpcRowsSha256After !== prepared.formalNpcRowsSha256) {
    throw new Error('NPC formal database content changed during the isolated run');
  }

  const evidence = {
    schemaVersion: 1,
    evidenceKind: 'npc_full_local_offline_isolated_maintained_baseline',
    status: 'passed',
    generatedAt: new Date().toISOString(),
    domain: 'npcs',
    runId,
    runKey,
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    offlineAuthorization,
    sourceManifest,
    dependencyManifestPath: path.relative(REPO_ROOT, dependencyManifestPath).replaceAll('\\', '/'),
    failedProbe: probe.binding,
    serverIdentity: execution.serverIdentity,
    snapshotVerification: execution.snapshotVerification,
    acceptance: execution.acceptance,
    isolatedApi: execution.isolatedApi,
    runtimeArtifactBinding: prepared.runtimeArtifactBinding,
    privateExecutionCodeBundlePath: path.relative(REPO_ROOT, codeBundlePath).replaceAll('\\', '/'),
    formalDatabaseWrites: false,
    formalNpcRowCountBefore: prepared.formalNpcCount,
    formalNpcRowCountAfter: formalNpcCountAfter,
    formalNpcRowsSha256Before: prepared.formalNpcRowsSha256,
    formalNpcRowsSha256After,
    cleanupPassed: execution.cleanupPassed,
    privateLandingPath: path.relative(REPO_ROOT, privateLandingPath).replaceAll('\\', '/'),
    privateSourceManifestPath: path.relative(REPO_ROOT, sourceManifestPath).replaceAll('\\', '/'),
    privateMaintainedChainPath: path.relative(REPO_ROOT, path.join(privateRunRoot, 'maintained-chain-result.json')).replaceAll('\\', '/'),
  };
  writeArtifact(outputAbsolute, evidence);
  return evidence;
}

export async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, ...rest] = arg.slice(2).split('=');
    return [key, rest.join('=')];
  }));
  if (args['source-mode'] !== 'local-offline') {
    throw new Error('NPC isolated runner requires --source-mode=local-offline after the Wiki source probe failed');
  }
  const result = await runNpcOfflineLocalAcceptance({
    failedProbePath: args['failed-probe'] ?? `${PRIVATE_ROOT}/source-decision.json`,
    outputPath: args.output,
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error('[run-full-recrawl-canonical-isolated] failed');
    console.error(error?.stack ?? error?.message ?? error);
    process.exitCode = 1;
  });
}

export { assertNpcHybridSourceDecision };
