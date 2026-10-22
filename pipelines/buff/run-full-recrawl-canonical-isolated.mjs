#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from '../automation/eight-domain-isolated-allocation.mjs';
import { dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import {
  buildIsolatedApiLifecycle,
  buildRunOwnedApiCredentials,
  runLiveAutomationAcceptance,
} from '../automation/run-live-automation-acceptance.mjs';
import { BUFF_DEPENDENCY_COLUMNS, bindBuffDependencyResolution, buildBuffDependencyManifest } from './buff-offline-dependencies.mjs';
import { buildBuffLocalOfflineSource } from './buff-offline-source.mjs';
import { runBuffCanonicalT1Acceptance } from './buff-canonical-t1-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const EXECUTION_MANIFEST_PATH = `${EXECUTION_ROOT}/execution-manifest.json`;
const RUN_ID = 'e8pr-buffs-20261017-v1';
const RUN_KEY = 'e8p_e38103255d8d4633';
const REDIS_DB = 7;
const FORMAL_TABLES = Object.freeze([
  ['terria_v1_local', 'buffs', 'id'],
  ['terria_v1_local', 'buff_source_items', 'buff_id, sort_order'],
  ['terria_v1_local', 'items', 'id'],
  ['terria_v1_local', 'npcs', 'id'],
  ['terria_v1_maint', 'maint_buffs', 'source_id'],
  ['terria_v1_maint', 'maint_items', 'source_id'],
  ['terria_v1_maint', 'maint_npcs', 'source_id'],
  ['terria_v1_relation', 'relation_buffs', 'source_id'],
  ['terria_v1_relation', 'item_buff_relations', 'record_key'],
  ['terria_v1_relation', 'npc_buff_relations', 'record_key'],
  ['terria_v1_relation', 'projection_buffs', 'source_id'],
]);

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(canonical(value)), 'utf8'));
}

function hashRows(rows) {
  const values = rows.map((row) => JSON.stringify(canonical(row))).sort();
  return { rowCount: rows.length, sha256: hashBytes(Buffer.from(JSON.stringify(values), 'utf8')) };
}

function isolatedApiReadbackStatus(execution) {
  const routes = execution?.isolatedApi?.readback;
  if (!Array.isArray(routes)) return 'not-run';
  const expected = ['public-buffs', 'public-buff-detail', 'admin-buffs'];
  return routes.length === expected.length
    && routes.every((route, index) => route.routeId === expected[index]
      && Number(route.status) === 200
      && route.responseValidation?.identityVerified === true)
    ? 'passed'
    : 'failed';
}

function readJson(root, relativePath, label) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes the execution root`);
  }
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  const bytes = fs.readFileSync(absolute);
  return { absolutePath: absolute, bytes, sha256: hashBytes(bytes), value: JSON.parse(bytes.toString('utf8')) };
}

function writePrivateJson(filePath, value, label) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filePath), 0o700);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  return Object.freeze({ path: filePath, sha256: hashBytes(bytes), label });
}

function writeEvidence(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const fd = fs.openSync(filePath, 'wx', 0o644);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  return hashBytes(bytes);
}

function readPrivateText(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${label} must be a private ordinary file`);
  }
  const value = fs.readFileSync(filePath, 'utf8').trim();
  if (!value) throw new Error(`${label} is empty`);
  return value;
}

function redisCommand({ host, port, password }, database, command) {
  const output = execFileSync('redis-cli', ['-h', host, '-p', String(port), '-n', String(database), ...command], {
    encoding: 'utf8',
    env: { ...process.env, REDISCLI_AUTH: password },
    timeout: 10_000,
  });
  return output.trim();
}

function processArgs(pid) {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function selectJsonSql({ columns, table, keyColumn, values }) {
  if (!/^[a-z][a-z0-9_]*$/i.test(table) || !/^[a-z][a-z0-9_]*$/i.test(keyColumn)
      || columns.some((column) => !/^[a-z][a-z0-9_]*$/i.test(column))) throw new Error('Buff dependency SQL identifier is invalid');
  const ids = [...new Set(values.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id === 0)) throw new Error('Buff dependency IDs must be nonzero safe integers');
  if (ids.length === 0) return null;
  const fields = columns.flatMap((column) => [`'${column}'`, `\`${column}\``]).join(', ');
  return `SELECT JSON_OBJECT(${fields}) FROM \`${table}\` WHERE \`${keyColumn}\` IN (${ids.join(', ')}) ORDER BY \`${keyColumn}\``;
}

async function readExactRows(readonlyClient, database, table, keyColumn, ids, columns) {
  const sql = selectJsonSql({ columns, table, keyColumn, values: ids });
  if (!sql) return [];
  const output = await readonlyClient.query(sql, database);
  return String(output).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function identitySets(records) {
  const itemIds = new Set();
  const npcIds = new Set();
  for (const record of records) {
    for (const item of record.sourceItems) {
      const id = Number(item.itemId);
      if (item.resolveStatus !== 'unresolved' && Number.isSafeInteger(id) && id > 0) itemIds.add(id);
    }
    for (const fact of [...record.inflictingNpcs, ...record.immuneNpcs]) {
      const id = Number(fact.npcId);
      if (fact.resolveStatus !== 'unresolved' && Number.isSafeInteger(id) && id !== 0) npcIds.add(id);
    }
  }
  return {
    itemIds: [...itemIds].sort((left, right) => left - right),
    npcIds: [...npcIds].sort((left, right) => left - right),
  };
}

export function buildBuffApiRoutes(detailId) {
  return [
    { routeId: 'public-buffs', params: {} },
    { routeId: 'public-buff-detail', params: { id: String(detailId) } },
    { routeId: 'admin-buffs', params: {} },
  ];
}

export function validateBuffApiResponse({ routeId, payload, acceptance } = {}) {
  if (!payload || payload.success !== true) throw new Error(`Buff API ${routeId} returned an unsuccessful response`);
  const expected = acceptance?.apiExpectations;
  if (!expected || Number(expected.totalBuffs) !== 388 || !expected.firstBuff?.internalName) {
    throw new Error('Buff API validation requires the 388-record isolated acceptance result');
  }
  if (routeId === 'public-buffs' || routeId === 'admin-buffs') {
    if (!Array.isArray(payload.data) || Number(payload.pagination?.total) !== expected.totalBuffs
        || payload.data.length === 0) throw new Error(`Buff API ${routeId} total differs from isolated readback`);
    const first = payload.data[0];
    if (Number(first.sourceId) !== Number(expected.firstBuff.sourceId)
        || String(first.internalName) !== expected.firstBuff.internalName) {
      throw new Error(`Buff API ${routeId} first identity differs from isolated readback`);
    }
    return { totalBuffs: Number(payload.pagination.total), firstSourceId: Number(first.sourceId), identityVerified: true };
  }
  if (routeId === 'public-buff-detail') {
    const row = payload.data;
    if (!row || Number(row.id) !== Number(expected.detailId)
        || Number(row.sourceId) !== Number(expected.firstBuff.sourceId)
        || row.internalName !== expected.firstBuff.internalName
        || !Array.isArray(row.sourceItems) || !Array.isArray(row.inflictingNpcs) || !Array.isArray(row.immuneNpcs)) {
      throw new Error('Buff public detail identity or relation payload differs from isolated readback');
    }
    return {
      id: Number(row.id),
      sourceId: Number(row.sourceId),
      internalName: row.internalName,
      sourceItemCount: row.sourceItems.length,
      inflictingNpcCount: row.inflictingNpcs.length,
      immuneNpcCount: row.immuneNpcs.length,
      identityVerified: true,
    };
  }
  throw new Error(`Buff API validator has no route ${routeId}`);
}

async function captureFormalFingerprints(mysql, credentials) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    dateStrings: true,
  });
  const fingerprints = {};
  try {
    await connection.query('START TRANSACTION READ ONLY');
    for (const [database, table, orderBy] of FORMAL_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${database}\`.\`${table}\` ORDER BY ${orderBy}`);
      fingerprints[`${database}.${table}`] = hashRows(rows);
    }
    await connection.rollback();
  } finally { await connection.end(); }
  return fingerprints;
}

async function readMysqlPreflight(mysql, credentials, allocation, executionManifest) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    dateStrings: true,
  });
  try {
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS port');
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const [accounts] = await connection.query("SELECT User AS user FROM mysql.user WHERE User LIKE 'automation_%' ORDER BY User");
    const formalNames = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases];
    const [formal] = await connection.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${formalNames.map(() => '?').join(', ')}) ORDER BY schema_name`,
      formalNames,
    );
    const [[transactionCount]] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.innodb_trx');
    const formalSet = formal.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    if ((server.serverUuid ?? server.SERVER_UUID) !== allocation.mysql.serverUuid
        || Number(server.port ?? server.PORT) !== allocation.mysql.port
        || schemas.length !== 0 || accounts.length !== 0
        || JSON.stringify(formalSet) !== JSON.stringify([...formalNames].sort())
        || Number(transactionCount.count ?? transactionCount.COUNT) !== 0) {
      throw new Error('Buff MySQL identity, formal schema, active transaction, automation schema, or account preflight failed');
    }
    await assertPortFree(allocation.api.host, allocation.api.port);
    return {
      status: 'ready',
      checkedAt: new Date().toISOString(),
      mysql: {
        serverUuid: allocation.mysql.serverUuid,
        port: allocation.mysql.port,
        automationSchemaCount: schemas.length,
        automationAccountCount: accounts.length,
        activeTransactions: 0,
        formalDatabases: formalSet,
      },
      api: { host: allocation.api.host, port: allocation.api.port, free: true },
    };
  } finally { await connection.end(); }
}

function readRedisPreflight(allocation, password) {
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password };
  const sizes = {};
  for (let database = 1; database <= 8; database += 1) {
    const ping = redisCommand(redis, database, ['PING']);
    const size = Number(redisCommand(redis, database, ['DBSIZE']));
    if (ping !== 'PONG' || size !== 0) throw new Error(`Buff Redis DB${database} is unavailable or not empty`);
    sizes[database] = size;
  }
  const leasePath = path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json');
  const lease = JSON.parse(fs.readFileSync(leasePath, 'utf8'));
  if (lease.status !== 'ready' || Number(lease.port) !== allocation.redis.port
      || lease.binarySha256 !== allocation.redis.binarySha256
      || !processArgs(lease.pid).includes('redis-server')) throw new Error('Buff Redis lease does not match the fixed allocation');
  return { status: 'ready', checkedAt: new Date().toISOString(), ...allocation.redis, ping: 'PONG', databaseSizes: sizes };
}

async function runWriterPreflight() {
  const lines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const writers = lines.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return pid !== process.pid && /fetch-wiki-buffs|run-buff-canonical-ingestion|import-independent-entities.*buff|run-full-recrawl-canonical-isolated.*buff/i.test(line);
  });
  if (writers.length > 0) throw new Error('Buff preflight found a competing Buff source or import writer');
  return { status: 'ready', activeBuffWriterCount: 0 };
}

async function captureCleanup(mysql, credentials, allocation, redisPassword) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
  });
  let schemaCount = null;
  let accountCount = null;
  try {
    const [schemas] = await connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (?, ?, ?)', [
      allocation.mysql.databases.local, allocation.mysql.databases.maint, allocation.mysql.databases.relation,
    ]);
    const [accounts] = await connection.query("SELECT User FROM mysql.user WHERE User LIKE 'automation_%'");
    schemaCount = schemas.length;
    accountCount = accounts.length;
  } finally { await connection.end(); }
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisDatabaseSizes = {};
  for (let database = 1; database <= 8; database += 1) {
    redisDatabaseSizes[database] = Number(redisCommand(redis, database, ['DBSIZE']));
  }
  let apiPortFree = false;
  try { await assertPortFree(allocation.api.host, allocation.api.port); apiPortFree = true; }
  catch { apiPortFree = false; }
  return {
    schemaCount,
    accountCount,
    redisDatabaseSizes,
    apiPortFree,
    passed: schemaCount === 0 && accountCount === 0
      && Object.values(redisDatabaseSizes).every((size) => size === 0) && apiPortFree,
  };
}

function dependencyIds(records) {
  return Object.freeze(identitySets(records));
}

async function buildBuffDependencies({ readonlyClient, source, allocation, dependencyManifestPath }) {
  const ids = dependencyIds(source.records);
  const columns = BUFF_DEPENDENCY_COLUMNS;
  const [localItemRows, localNpcRows, maintItemRows, maintNpcRows] = await Promise.all([
    readExactRows(readonlyClient, 'terria_v1_local', 'items', 'id', ids.itemIds, columns.localItems),
    readExactRows(readonlyClient, 'terria_v1_local', 'npcs', 'game_id', ids.npcIds, columns.localNpcs),
    readExactRows(readonlyClient, 'terria_v1_maint', 'maint_items', 'source_id', ids.itemIds, columns.maintItems),
    readExactRows(readonlyClient, 'terria_v1_maint', 'maint_npcs', 'source_id', ids.npcIds, columns.maintNpcs),
  ]);
  const dependencyResolution = bindBuffDependencyResolution({
    records: source.records,
    npcIdentityByGameId: source.npcIdentityByGameId,
    localItemRows,
    maintItemRows,
    localNpcRows,
    maintNpcRows,
  });
  const itemIds = new Set(dependencyResolution.records.flatMap((record) => record.sourceItems)
    .filter((item) => item.resolveStatus !== 'unresolved').map((item) => Number(item.itemId)));
  const npcIds = new Set(dependencyResolution.records.flatMap((record) => [...record.inflictingNpcs, ...record.immuneNpcs])
    .filter((npc) => npc.resolveStatus !== 'unresolved').map((npc) => Number(npc.npcId)));
  const exactLocalItemRows = localItemRows.filter((row) => itemIds.has(Number(row.id)));
  const exactMaintItemRows = maintItemRows.filter((row) => itemIds.has(Number(row.source_id)));
  const exactLocalNpcRows = localNpcRows.filter((row) => npcIds.has(Number(row.game_id)));
  const exactMaintNpcRows = maintNpcRows.filter((row) => npcIds.has(Number(row.source_id)));
  const manifest = buildBuffDependencyManifest({
    runId: allocation.runId,
    runKey: allocation.runKey,
    databases: allocation.mysql.databases,
    localItemRows: exactLocalItemRows,
    localNpcRows: exactLocalNpcRows,
    maintItemRows: exactMaintItemRows,
    maintNpcRows: exactMaintNpcRows,
  });
  const file = writePrivateJson(dependencyManifestPath, manifest, 'Buff exact dependency manifest');
  return { manifest, file, records: dependencyResolution.records, unresolved: dependencyResolution.unresolved };
}

function sourceMetadata(sourceManifest) {
  return {
    provider: 'terraria.wiki.gg',
    sourceKind: 'repository_frozen_standardized',
    sourceKey: `buff-local-offline:${sourceManifest.runKey}`,
    sourceLocator: sourceManifest.sourceFiles[0].path,
    sourcePage: sourceManifest.sourcePage,
    sourceRevisionTimestamp: sourceManifest.sourceRevisionTimestamp,
    fetchedAt: sourceManifest.sourceFetchedAt,
    sourceManifestSha256: sourceManifest.manifestSha256,
  };
}

async function runBuffAcceptance({ allocation, credentials, redisPassword, privateDirectory, source, sourceManifest, dependencyManifestPath }) {
  const state = {};
  return runLiveAutomationAcceptance({
    profile: 't1',
    runId: allocation.runId,
    mysql: credentials,
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, password: redisPassword },
    privateDirectory,
    maxRowsPerTable: 2,
    scope: 'buff-canonical',
    isolatedAllocation: allocation,
    dependencyManifestFactory: async (context) => {
      const dependencies = await buildBuffDependencies({ ...context, allocation, source, dependencyManifestPath });
      state.dependencies = dependencies;
      return dependencies.manifest;
    },
    acceptanceExecutor: async (context) => {
      if (!state.dependencies?.file) throw new Error('Buff exact dependency manifest was not prepared before the maintained chain');
      const fullCapture = {
        buffs: state.dependencies.records,
        sourceMetadata: sourceMetadata(sourceManifest),
      };
      const acceptance = await runBuffCanonicalT1Acceptance({
        profile: context.profile,
        runId: context.runId,
        repoRoot: ROOT,
        databases: context.databases,
        mysql: context.mysql,
        fullCapture,
        dependencySeedEvidence: context.dependencySeedEvidence,
        redisLogicalDb: allocation.redis.logicalDb,
      });
      return {
        ...acceptance,
        sourceIdentityResolution: state.dependencies.unresolved,
        dependencyManifestPath: path.relative(ROOT, state.dependencies.file.path).replaceAll('\\', '/'),
        dependencyManifestSha256: dependencyManifestSha256(state.dependencies.manifest),
      };
    },
    isolatedApiLifecycleFactory: async ({ manifest, adapter }) => {
      const apiCredentials = buildRunOwnedApiCredentials({
        mysql: { host: credentials.host, port: Number(credentials.port) },
        apiAccount: adapter.apiAccounts.apiReadonly,
        redisPassword,
        runKey: allocation.runKey,
      });
      return buildIsolatedApiLifecycle({
        allocation,
        mode: 'consumer-readback',
        credentials: apiCredentials,
        migrationEvidence: manifest.migrationEvidence,
        routes: buildBuffApiRoutes(source.records[0].id),
        validateResponse: validateBuffApiResponse,
      });
    },
    onResources: async ({ redis }) => {
      if (Number(redis.logicalDb) !== REDIS_DB || Number(redis.port) !== allocation.redis.port) {
        throw new Error('Buff acceptance resources differ from the fixed Redis DB7 allocation');
      }
    },
  });
}

async function verifyPostRun(mysql, credentials, allocation, redisPassword) {
  const cleanup = await captureCleanup(mysql, credentials, allocation, redisPassword);
  return cleanup;
}

export async function runBuffIsolatedT1({ repoRoot = ROOT, env = process.env } = {}) {
  const root = path.resolve(repoRoot);
  const executionManifestFile = readJson(root, EXECUTION_MANIFEST_PATH, 'eight-domain execution manifest');
  const executionManifest = executionManifestFile.value;
  const config = loadLocalStackConfig(root);
  const mysql = loadMysqlModule({ repoRoot: root });
  const credentials = {
    host: config.database.host,
    port: Number(config.database.port),
    username: env.TERRAPEDIA_DB_USERNAME ?? config.database.username,
    password: env.TERRAPEDIA_DB_PASSWORD ?? config.database.password,
  };
  const runRegistryPath = path.join(root, PRIVATE_ROOT, 'buffs/run-key-mappings.json');
  const runKeyRegistry = openDurableRunKeyRegistry(runRegistryPath);
  const plan = buildEightDomainAllocationPlan({
    manifest: executionManifest,
    domain: 'buffs',
    repoRoot: root,
    runKeyRegistry,
  });
  if (plan.runId !== RUN_ID || plan.runKey !== RUN_KEY || plan.redis.logicalDb !== REDIS_DB) {
    throw new Error('Buff fixed allocation identity differs from the execution plan');
  }
  const allocation = { ...plan, preflight: { status: 'ready', observedAt: new Date().toISOString() } };
  const outputPath = path.join(root, allocation.evidenceRoot, 'isolated-real-ingestion.json');
  let priorEvidence = null;
  try {
    const stat = fs.lstatSync(outputPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('existing Buff evidence must be an ordinary file');
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (!['failed', 'passed'].includes(existing.status) || existing.cleanup?.passed !== true
        || existing.formalFingerprints?.unchanged !== true || existing.formalDatabaseWrites !== false) {
      throw new Error('Buff isolated T1 evidence already exists for this fixed run key');
    }
    priorEvidence = { path: outputPath, status: existing.status, sha256: hashBytes(fs.readFileSync(outputPath)) };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  const authorization = 'user-directed-local-offline';
  const boundSource = buildBuffLocalOfflineSource({
    repoRoot: root,
    executionManifest,
    runId: allocation.runId,
    runKey: allocation.runKey,
    authorization,
  });
  const redisPassword = readPrivateText(path.join(root, PRIVATE_ROOT, 'redis/redis.auth'), 'Buff isolated Redis auth file');
  const preflight = {
    mysql: await readMysqlPreflight(mysql, credentials, allocation, executionManifest),
    redis: readRedisPreflight(allocation, redisPassword),
    writers: await runWriterPreflight(),
  };
  const formalFingerprintsBefore = await captureFormalFingerprints(mysql, credentials);
  const attemptId = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().slice(0, 12)}`;
  const runRoot = path.join(root, allocation.automaticArtifactRoot, 'acceptance-runs', `buffs-local-offline-${attemptId}`);
  const privateDirectory = path.join(runRoot, 'runtime');
  const sourceManifestPath = path.join(runRoot, 'buff-source-manifest.json');
  const dependencyManifestPath = path.join(runRoot, 'buff-dependency-manifest.json');
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const sourceManifestFile = writePrivateJson(sourceManifestPath, boundSource.sourceManifest, 'Buff local source manifest');

  let execution;
  let formalFingerprintsAfter;
  let cleanup;
  let runError = null;
  try {
    execution = await runBuffAcceptance({
      allocation,
      credentials,
      redisPassword,
      privateDirectory,
      source: boundSource,
      sourceManifest: boundSource.sourceManifest,
      dependencyManifestPath,
    });
    formalFingerprintsAfter = await captureFormalFingerprints(mysql, credentials);
    if (JSON.stringify(formalFingerprintsBefore) !== JSON.stringify(formalFingerprintsAfter)) {
      throw new Error('Buff formal table fingerprints changed during isolated T1');
    }
    cleanup = await verifyPostRun(mysql, credentials, allocation, redisPassword);
    if (execution.cleanupPassed !== true || execution.isolatedApi?.stop?.cleanupVerified !== true || cleanup.passed !== true) {
      throw new Error('Buff isolated T1 cleanup did not pass');
    }
  } catch (error) {
    runError = error;
    try { formalFingerprintsAfter = await captureFormalFingerprints(mysql, credentials); }
    catch (fingerprintError) { runError = new AggregateError([runError, fingerprintError], 'Buff run and post-run formal fingerprint check failed'); }
    try { cleanup = await verifyPostRun(mysql, credentials, allocation, redisPassword); }
    catch (cleanupError) { runError = new AggregateError([runError, cleanupError], 'Buff run and cleanup audit failed'); }
  }

  const passed = runError == null;
  const evidence = {
    schemaVersion: 1,
    operation: 'eight-domain-buffs-isolated-t1-local-offline',
    generatedAt: new Date().toISOString(),
    status: passed ? 'passed' : 'failed',
    domain: 'buffs',
    runId: allocation.runId,
    runKey: allocation.runKey,
    sourceMode: boundSource.sourceMode,
    wikiUnchanged: false,
    offlineAuthorization: authorization,
    source: boundSource.sourceManifest,
    sourceManifestPath: path.relative(root, sourceManifestFile.path).replaceAll('\\', '/'),
    sourceManifestFileSha256: sourceManifestFile.sha256,
    preflight,
    acceptance: execution?.acceptance ?? null,
    apiReadback: execution?.isolatedApi?.readback ?? null,
    maintainedChainStatus: passed ? 'passed' : 'failed',
    apiReadbackStatus: isolatedApiReadbackStatus(execution),
    formalFingerprints: {
      unchanged: JSON.stringify(formalFingerprintsBefore) === JSON.stringify(formalFingerprintsAfter),
      before: formalFingerprintsBefore,
      after: formalFingerprintsAfter ?? null,
    },
    cleanup: cleanup ?? null,
    cleanupPassed: cleanup?.passed === true && (execution == null || execution.cleanupPassed === true),
    ...(priorEvidence ? { priorAttempt: priorEvidence } : {}),
    formalDatabaseWrites: false,
    schemaOrAccountWrites: true,
    v2AutomaticIngestionStatus: 'not-run-by-request',
    unresolvedDependencyStatus: execution?.acceptance?.sourceIdentityResolution ?? null,
    error: runError ? { name: runError.name, message: runError.message } : null,
  };
  if (priorEvidence) {
    const archivedPath = outputPath.replace(/\.json$/, `.prior-${priorEvidence.status}-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    fs.renameSync(outputPath, archivedPath);
    evidence.priorAttempt = {
      path: path.relative(root, archivedPath).replaceAll('\\', '/'),
      status: priorEvidence.status,
      sha256: priorEvidence.sha256,
    };
  }
  const evidenceSha256 = writeEvidence(outputPath, evidence);
  process.stdout.write(`${JSON.stringify({
    status: evidence.status,
    domain: evidence.domain,
    runId: evidence.runId,
    runKey: evidence.runKey,
    sourceMode: evidence.sourceMode,
    recordCount: boundSource.records.length,
    maintainedChainStatus: passed ? 'passed' : 'failed',
    apiReadbackStatus: evidence.apiReadbackStatus,
    cleanupPassed: evidence.cleanupPassed,
    evidencePath: path.relative(root, outputPath).replaceAll('\\', '/'),
    evidenceSha256,
    ...(runError ? { error: runError.message } : {}),
  }, null, 2)}\n`);
  if (runError) throw runError;
  return Object.freeze({ evidencePath: outputPath, evidenceSha256, evidence });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runBuffIsolatedT1({ repoRoot: ROOT })
    .catch((error) => { process.stderr.write(`Buff isolated T1 failed: ${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
