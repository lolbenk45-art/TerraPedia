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
import { buildIsolatedApiLifecycle, buildRunOwnedApiCredentials, buildLiveResourceNames, runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { buildDependencyManifest, dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import { runBossImport, buildBossImportProjection, assertBossIsolatedTarget } from '../import/import-wiki-bosses-to-db.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';
import { runLandingImport } from '../landing/import-source-dataset-landings.mjs';
import { buildBossLocalOfflineSource, buildBossReadOnlyImageCache } from './boss-offline-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const RUN_ID = 'e8pr-bosses-20261017-v1';
const RUN_KEY = 'e8p_e1cd44a30171d90d';
const EXECUTION_MANIFEST_PATH = `${EXECUTION_ROOT}/execution-manifest.json`;
const OUTAGE_EVIDENCE_PATH = `${PRIVATE_ROOT}/npcs/source-decision.json`;
const API_JAR_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const BOSS_SOURCE_PATH = 'data/generated/wiki-bosses.latest.json';
const NPC_MAP_PATH = 'data/generated/npc-standardized-map.json';
const LOOT_PATH = 'data/wiki-crawler/normalized/boss-loot.bundle.json';
const HASH = /^sha256:[a-f0-9]{64}$/;
const NPC_COLUMNS = Object.freeze(['id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'is_boss', 'boss_group_id', 'boss_role', 'raw_json', 'status', 'deleted']);
const ITEM_COLUMNS = Object.freeze(['id', 'name', 'name_zh', 'internal_name', 'category_id', 'status', 'deleted']);
const MAINT_NPC_COLUMNS = Object.freeze(['id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page', 'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'module_generated_at', 'terraria_version', 'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size', 'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted']);
const MAINT_ITEM_COLUMNS = Object.freeze(['id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page', 'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'module_generated_at', 'terraria_version', 'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size', 'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted']);

function hashBytes(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function hashJson(value) { return hashBytes(Buffer.from(JSON.stringify(canonical(value)), 'utf8')); }
function readJson(filePath, label, { outsideRoot = false } = {}) {
  const full = path.resolve(filePath);
  if (!outsideRoot) {
    const rel = path.relative(ROOT, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`${label} path escapes execution root`);
  }
  const stat = fs.lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return { path: full, bytes: fs.readFileSync(full), value: JSON.parse(fs.readFileSync(full, 'utf8')) };
}
function writePrivate(filePath, value, label) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filePath), 0o700);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.chmodSync(filePath, 0o600);
  return { path: filePath, sha256: hashBytes(bytes), label };
}
function writeEvidence(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const fd = fs.openSync(filePath, 'wx', 0o644);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return hashBytes(bytes);
}
function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, ...rest] = token.slice(2).split('=');
    out[key] = rest.join('=') || 'true';
  }
  return out;
}
function rowHash(rows) {
  const values = rows.map((row) => JSON.stringify(canonical(row))).sort();
  return { rowCount: rows.length, sha256: hashBytes(Buffer.from(JSON.stringify(values), 'utf8')) };
}
function requireSafe(value, label) {
  const text = String(value ?? '');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(text)) throw new Error(`${label} is unsafe`);
  return text;
}
function sqlObject(columns, table, where = '1=1', orderBy = null) {
  const pairs = columns.flatMap((column) => [`'${column}'`, `\`${requireSafe(column, 'column')}\``]).join(', ');
  const order = orderBy ? ` ORDER BY \`${requireSafe(orderBy, 'order column')}\`` : '';
  return `SELECT JSON_OBJECT(${pairs}) FROM \`${requireSafe(table, 'table')}\` WHERE ${where}${order}`;
}
function parseRows(output, label) {
  return String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new Error(`${label} returned malformed JSON`); }
  });
}
async function readRows(readonlyClient, database, table, columns, keyColumn, ids = null) {
  const where = ids == null ? '1=1' : `\`${keyColumn}\` IN (${ids.map((id) => Number(id)).join(',')})`;
  return parseRows(await readonlyClient.query(sqlObject(columns, table, where, keyColumn), database), `${database}.${table}`);
}
async function readRowsByTextValues(readonlyClient, database, table, columns, keyColumn, values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const literals = values.map((value) => `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`);
  const key = requireSafe(keyColumn, 'text key column');
  return parseRows(await readonlyClient.query(sqlObject(columns, table, `\`${key}\` IN (${literals.join(',')})`, key), database), `${database}.${table}`);
}
function buildBossCode(title) { return String(title ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function readPrivateText(filePath) {
  const full = path.resolve(filePath); const stat = fs.lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('private credential file is invalid');
  return fs.readFileSync(full, 'utf8').trim();
}
function readEnvFile(filePath) {
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}
function redisCommand(redis, database, ...args) {
  return execFileSync('redis-cli', ['--raw', '-h', redis.host, '-p', String(redis.port), '-n', String(database), ...args], { encoding: 'utf8', env: { ...process.env, REDISCLI_AUTH: redis.password }, timeout: 5000 }).trim();
}
async function portFree(host, port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen({ host, port, exclusive: true }, () => server.close((err) => err ? reject(err) : resolve())); });
}
function processArgs(pid) { try { return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).trim(); } catch { return ''; } }
export function refreshBossApiReadbackPreflight({ allocation, evidence } = {}) {
  const target = allocation;
  const expected = [target.mysql.databases.local, target.mysql.databases.maint, target.mysql.databases.relation].sort();
  const actual = [...(evidence?.mysql?.databases ?? [])].sort();
  if (evidence?.status !== 'ready' || evidence.mysql?.serverUuid !== target.mysql.serverUuid
      || JSON.stringify(actual) !== JSON.stringify(expected)
      || evidence.redis?.host !== target.redis.host || Number(evidence.redis?.port) !== Number(target.redis.port)
      || Number(evidence.redis?.logicalDb) !== Number(target.redis.logicalDb) || evidence.redis?.ping !== 'PONG'
      || evidence.api?.host !== target.api.host || Number(evidence.api?.port) !== Number(target.api.port)
      || evidence.api?.listening !== true) throw new Error('live Boss MySQL, Redis, API, or run schemas do not match allocation');
  const checkedAt = Date.parse(String(evidence.checkedAt ?? ''));
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 120_000 || checkedAt > Date.now()) throw new Error('live Boss API readback preflight is stale');
  return { ...target, preflight: { status: 'ready', observedAt: new Date(checkedAt).toISOString() } };
}
async function refreshBossApiBinding(mysql, credentials, allocation, redisPassword) {
  const conn = await createConnection(mysql, credentials, 'terria_v1_local');
  let serverUuid; let databases;
  try {
    await conn.query('START TRANSACTION READ ONLY');
    const [[server]] = await conn.query('SELECT @@server_uuid AS serverUuid');
    const [rows] = await conn.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (?,?,?) ORDER BY schema_name', [allocation.mysql.databases.local, allocation.mysql.databases.maint, allocation.mysql.databases.relation]);
    serverUuid = server.serverUuid ?? server.SERVER_UUID;
    databases = rows.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    await conn.rollback();
  } catch (error) { await conn.rollback(); throw error; }
  finally { await conn.end(); }
  const ping = redisCommand({ host: allocation.redis.host, port: allocation.redis.port, password: redisPassword }, allocation.redis.logicalDb, 'PING');
  const listening = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: allocation.api.host, port: allocation.api.port });
    const timer = setTimeout(() => socket.destroy(new Error('Boss API liveness probe timed out')), 3000);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return refreshBossApiReadbackPreflight({ allocation, evidence: {
    status: 'ready', checkedAt: new Date().toISOString(),
    mysql: { serverUuid, databases },
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, ping },
    api: { host: allocation.api.host, port: allocation.api.port, listening },
  } });
}
async function verifyBossCleanup(mysql, credentials, allocation, redisPassword) {
  const conn = await createConnection(mysql, credentials, 'terria_v1_local');
  let schemaCount; let accountCount;
  try {
    const [schemas] = await conn.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%'");
    schemaCount = schemas.length;
    const names = buildLiveResourceNames({ profile: 't1', runKey: allocation.runKey });
    const users = [names.accounts.provisioner, names.accounts.readonly, names.isolatedApiAccounts.apiReadonly, names.isolatedApiAccounts.apiV2Test];
    const [accounts] = await conn.query(`SELECT User FROM mysql.user WHERE User IN (${users.map(() => '?').join(',')})`, users);
    accountCount = accounts.length;
  } finally { await conn.end(); }
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisDatabaseSizes = [];
  for (let i = 1; i <= 8; i += 1) redisDatabaseSizes.push(Number(redisCommand(redis, i, 'DBSIZE')));
  let apiPortFree = true;
  try { await portFree(allocation.api.host, allocation.api.port); } catch { apiPortFree = false; }
  const objectCountAfter = listMinioObjects(allocation.objectStore.bucket).length;
  return { schemaCount, accountCount, redisDatabaseSizes, apiPortFree, objectCountAfter };
}
function listMinioObjects(bucket) {
  const envFile = path.join(ROOT, PRIVATE_ROOT, 'minio/minio.env');
  const credentials = readEnvFile(envFile);
  const host = `http://${encodeURIComponent(credentials.MINIO_ROOT_USER)}:${encodeURIComponent(credentials.MINIO_ROOT_PASSWORD)}@127.0.0.1:19100`;
  const output = execFileSync('/home/lolben/.local/bin/mc', ['ls', '--json', '--recursive', `e8pr/${bucket}`], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, MC_CONFIG_DIR: path.join(ROOT, PRIVATE_ROOT, 'mc-config'), MC_HOST_e8pr: host },
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
function buildBossApiRoutes() {
  return [
    { routeId: 'public-bosses', params: {} },
    { routeId: 'public-boss-detail', params: { id: '1' } },
    { routeId: 'admin-bosses', params: {} },
  ];
}
export { buildBossApiRoutes };
function buildBossApiExpectations(groups, memberRows) {
  const byGroup = new Map();
  for (const row of memberRows) { const list = byGroup.get(Number(row.boss_group_id)) ?? []; list.push(row); byGroup.set(Number(row.boss_group_id), list); }
  const pageRows = groups.slice(0, 20).map((row) => ({ id: Number(row.id), code: row.code, nameEn: row.name_en, memberCount: byGroup.get(Number(row.id))?.length ?? 0 }));
  const detail = groups[0];
  return { totalGroups: groups.length, pageRows, detail: { id: Number(detail.id), code: detail.code, nameEn: detail.name_en } };
}
export function validateBossApiResponse({ routeId, payload, acceptance } = {}) {
  if (!payload || payload.success !== true) throw new Error(`Boss API ${routeId} returned unsuccessful response`);
  const expected = acceptance.apiExpectations;
  if (routeId === 'public-bosses' || routeId === 'admin-bosses') {
    if (!Array.isArray(payload.data) || Number(payload.pagination?.total) !== expected.totalGroups || payload.data.length !== expected.pageRows.length) throw new Error(`Boss API ${routeId} total differs from isolated readback`);
    payload.data.forEach((row, index) => { const sample = expected.pageRows[index]; if (Number(row.id) !== sample.id || String(row.code) !== sample.code || String(row.nameEn ?? '') !== sample.nameEn) throw new Error(`Boss API ${routeId} identity differs`); });
    return { totalGroups: Number(payload.pagination.total), pageRowsVerified: payload.data.length };
  }
  if (routeId === 'public-boss-detail') {
    const row = payload.data; if (!row || Number(row.id) !== expected.detail.id || String(row.code) !== expected.detail.code) throw new Error('Boss API detail identity differs');
    return { id: Number(row.id), code: row.code, identityVerified: true };
  }
  throw new Error(`Boss API validator has no route ${routeId}`);
}
export { buildBossApiExpectations };

export function buildBossRunOwnedApiCredentials({ mysql, apiAccount, redisPassword, runKey, allocation, minio } = {}) {
  if (!allocation?.objectStore || allocation.objectStore.domain !== 'bosses'
      || allocation.objectStore.bucket !== 'tp-e8pr-bosses-20261017'
      || allocation.objectStore.objectPrefix !== `e8pr/bosses/${allocation.runId}/`) {
    throw new Error('Boss API credentials require the exact run-owned Boss object-store allocation');
  }
  if (!minio?.accessKey || !minio?.secretKey || minio.endpoint !== allocation.objectStore.endpoint) {
    throw new Error('Boss API credentials require the matching private MinIO endpoint and credentials');
  }
  const base = buildRunOwnedApiCredentials({ mysql, apiAccount, redisPassword, runKey });
  return Object.freeze({
    ...base,
    minio: Object.freeze({ url: allocation.objectStore.endpoint, accessKey: minio.accessKey, secretKey: minio.secretKey }),
  });
}

async function createConnection(mysql, credentials, database) {
  return mysql.createConnection({ host: credentials.host, port: Number(credentials.port), user: credentials.username, password: credentials.password, database, connectTimeout: 5000, dateStrings: true, multipleStatements: false });
}
async function readFormalFingerprints(mysql, credentials) {
  const conn = await createConnection(mysql, credentials, 'terria_v1_local'); const out = {};
  try { await conn.query('START TRANSACTION READ ONLY'); for (const [db, table] of [['terria_v1_local', 'boss_groups'], ['terria_v1_local', 'npcs'], ['terria_v1_local', 'npc_loot_entries'], ['terria_v1_local', 'items'], ['terria_v1_maint', 'maint_npcs'], ['terria_v1_maint', 'maint_items'], ['terria_v1_maint', 'maint_bosses'], ['terria_v1_relation', 'relation_bosses'], ['terria_v1_relation', 'boss_item_reward_relations'], ['terria_v1_relation', 'projection_bosses']]) { const [rows] = await conn.query(`SELECT * FROM \`${db}\`.\`${table}\``); out[`${db}.${table}`] = rowHash(rows); } await conn.rollback(); } finally { await conn.end(); }
  return out;
}
async function runBossPreflight({ mysql, credentials, executionManifest, allocation, redisPassword }) {
  const conn = await createConnection(mysql, credentials, 'terria_v1_local');
  let facts;
  try {
    await conn.query('START TRANSACTION READ ONLY');
    const [[server]] = await conn.query('SELECT @@server_uuid AS serverUuid');
    const [schemas] = await conn.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%'");
    const [users] = await conn.query("SELECT User FROM mysql.user WHERE User LIKE 'automation_%'");
    const formalNames = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases];
    const [formal] = await conn.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${formalNames.map(() => '?').join(',')}) ORDER BY schema_name`, formalNames);
    const [activeFences] = await conn.query("SELECT latest_run_id, field_group, logical_predicate_hash, expires_at FROM crawler_automation_write_fence WHERE environment_id='local' AND database_role='local' AND physical_table='npcs' AND expires_at > UTC_TIMESTAMP() ORDER BY field_group");
    const [staleRelationRuns] = await conn.query("SELECT run_key,started_at,updated_at FROM terria_v1_relation.relation_runs WHERE status='running' AND started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) ORDER BY started_at");
    const [activeTransactions] = await conn.query('SELECT trx_id FROM information_schema.innodb_trx WHERE trx_mysql_thread_id <> CONNECTION_ID()');
    if ((server.serverUuid ?? server.SERVER_UUID) !== allocation.mysql.serverUuid || schemas.length || users.length
        || JSON.stringify(formal.map((x) => x.schema_name ?? x.SCHEMA_NAME)) !== JSON.stringify([...formalNames].sort())) {
      throw new Error('Boss MySQL identity, schema, or run-account preflight failed');
    }
    if (activeFences.length) throw new Error(`Boss NPC shared-table ownership fence is active: ${activeFences.map((row) => `${row.field_group}:${row.latest_run_id}`).join(', ')}`);
    if (activeTransactions.length) throw new Error('Boss preflight found an active MySQL transaction; refusing shared NPC writes');
    facts = {
      serverUuid: allocation.mysql.serverUuid,
      automationSchemas: schemas.length,
      automationUsers: users.length,
      activeNpcOwnershipFences: activeFences,
      staleFormalRelationRuns: staleRelationRuns,
      activeMysqlTransactions: activeTransactions.length,
    };
    await conn.rollback();
  } finally { await conn.end(); }

  const processLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const activeWriters = processLines.filter((line) => Number(line.trim().split(/\s+/, 1)[0]) !== process.pid
    && /(?:run-full-recrawl-canonical-isolated\.mjs.*npcs|fetch-wiki-npcs|import-wiki-npcs|npc-canonical-t1)/i.test(line));
  if (activeWriters.length) throw new Error('Boss preflight found an active NPC writer process');
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const sizes = {};
  for (let i = 1; i <= 8; i += 1) sizes[i] = Number(redisCommand(redis, i, 'DBSIZE'));
  const ping = redisCommand(redis, allocation.redis.logicalDb, 'PING');
  const lease = JSON.parse(fs.readFileSync(path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json'), 'utf8'));
  if (ping !== 'PONG' || Object.values(sizes).some((x) => x !== 0) || lease.status !== 'ready'
      || !processArgs(lease.pid).includes('redis-server')) throw new Error('Boss Redis preflight failed');
  await portFree(allocation.api.host, allocation.api.port);
  const minioLease = JSON.parse(fs.readFileSync(path.join(ROOT, PRIVATE_ROOT, 'minio/resource-lease.json'), 'utf8'));
  if (minioLease.status !== 'ready' || !processArgs(minioLease.pid).includes('minio')) throw new Error('Boss MinIO preflight failed');
  const bucketObjects = listMinioObjects(allocation.objectStore.bucket);
  if (bucketObjects.length !== 0) throw new Error('run-owned Boss MinIO bucket is not empty before this run');
  return {
    status: 'ready', checkedAt: new Date().toISOString(), mysql: facts,
    redis: { ...allocation.redis, ping, databaseSizes: sizes },
    api: { ...allocation.api, free: true },
    objectStore: { bucket: allocation.objectStore.bucket, objectPrefix: allocation.objectStore.objectPrefix, objectCount: bucketObjects.length, listingSha256: hashJson(bucketObjects) },
    activeNpcWriterProcessCount: 0,
    formalDatabaseWrites: false,
  };
}
function buildBossDependencyManifest({ runId, runKey, databases, localNpcRows, localItemRows, maintNpcRows, maintItemRows }) {
  const dependencies = [];
  const sourceRows = {};
  const add = (id, sourceTable, targetTable, keyColumn, rows, columns) => {
    dependencies.push({
      id,
      purpose: id,
      source: { database: sourceTable.startsWith('maint_') ? 'terria_v1_maint' : 'terria_v1_local', table: sourceTable },
      target: { database: sourceTable.startsWith('maint_') ? databases.maint : databases.local, table: targetTable },
      keyColumns: [keyColumn],
      keyValues: rows.map((row) => ({ [keyColumn]: Number(row[keyColumn]) })),
      columns: [...columns],
      rowHashes: [],
      expectedRowCount: rows.length,
    });
    sourceRows[id] = rows;
  };
  add('boss-exact-local-npc-dependencies', 'npcs', 'npcs', 'id', localNpcRows, NPC_COLUMNS);
  add('boss-exact-local-item-dependencies', 'items', 'items', 'id', localItemRows, ITEM_COLUMNS);
  add('boss-exact-maint-npc-dependencies', 'maint_npcs', 'maint_npcs', 'source_id', maintNpcRows, MAINT_NPC_COLUMNS);
  add('boss-exact-maint-item-dependencies', 'maint_items', 'maint_items', 'source_id', maintItemRows, MAINT_ITEM_COLUMNS);
  return buildDependencyManifest({
    manifest: { schemaVersion: 1, domain: 'bosses', runId, runKey, dependencies },
    sourceRows,
  });
}
async function runBossMaintainedChain(context, { source, state, mysql, credentials, privateDirectory, allocation, redisPassword }) {
  const connection = await createConnection(mysql, credentials, context.databases.local);
  const temp = path.join(privateDirectory, 'boss');
  fs.mkdirSync(temp, { recursive: true, mode: 0o700 });
  const bossInput = path.join(temp, 'bosses.json');
  const lootInput = path.join(temp, 'loot.json');
  const npcMapPath = path.join(temp, 'npc-map.json');
  const bossReportPath = path.join(temp, 'boss-import.json');
  const lootReportPath = path.join(temp, 'boss-loot-import.json');
  fs.writeFileSync(bossInput, JSON.stringify({ entity: 'wiki_bosses', generatedAt: source.generatedAt, records: source.bossRecords }), { mode: 0o600 });
  fs.writeFileSync(lootInput, JSON.stringify(state.lootBundle), { mode: 0o600 });
  fs.writeFileSync(npcMapPath, JSON.stringify(source.npcMap), { mode: 0o600 });
  if (!context.dependencySeedEvidence?.readbackVerified) throw new Error('Boss exact dependencies are not independently seeded');

  let importSummary;
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE npcs SET is_boss=0,boss_group_id=NULL,boss_role=NULL WHERE id IN (${state.targetNpcIds.map(() => '?').join(',')})`,
      state.targetNpcIds,
    );
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }

  try {
    await connection.beginTransaction();
    importSummary = await runBossImport({
      input: bossInput,
      offline: 'true',
      strict: 'false',
      'write-report': 'false',
      'allow-non-primary-db': 'true',
      database: context.databases.local,
      managedUrlPrefix: 'http://localhost:9000/terrapedia-images/bosses',
    }, {
      connection,
      transactionOwner: 'caller',
      generatedNpcMap: state.npcMap,
      imageUploader: null,
      bossImageCache: state.imageCache,
      isolatedTarget: { profile: 't1', runKey: RUN_KEY, database: context.databases.local, host: credentials.host, port: credentials.port },
    });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }

  const lootResult = execFileSync(process.execPath, [
    path.join(ROOT, 'pipelines/import/import-boss-loot-to-db.mjs'),
    `--bundle=${lootInput}`,
    '--regenerate-bundle=false',
    `--report-json=${lootReportPath}`,
    `--host=${credentials.host}`,
    `--port=${credentials.port}`,
    `--user=${credentials.username}`,
    `--password=${credentials.password}`,
    `--database=${context.databases.local}`,
    '--profile=t1',
    `--run-id=${RUN_ID}`,
    `--run-key=${RUN_KEY}`,
  ], { cwd: ROOT, encoding: 'utf8', timeout: 120_000, env: { ...process.env, TERRAPEDIA_DB_HOST: credentials.host, TERRAPEDIA_DB_PORT: String(credentials.port), TERRAPEDIA_DB_USERNAME: credentials.username, TERRAPEDIA_DB_PASSWORD: credentials.password, TERRAPEDIA_DB_NAME: context.databases.local } });
  const lootImportReport = JSON.parse(fs.readFileSync(lootReportPath, 'utf8'));
  if (lootImportReport.database !== context.databases.local || lootImportReport.totalBossRecords !== 33 || lootImportReport.importedBosses !== 32) {
    throw new Error(`Boss loot importer did not bind the 33 Boss owners and 32 non-reference owners: ${JSON.stringify(lootImportReport)}`);
  }

  const landingEntries = source.bossRecords.map((record) => ({
    datasetType: 'bosses_raw',
    provider: 'terraria.wiki.gg',
    sourceKind: 'wiki_page',
    sourceKey: `wiki.page.boss:${record.pageId}`,
    sourceLocator: record.sourceUrl,
    sourcePage: record.pageTitleEn,
    sourceRevisionTimestamp: record.revisionTimestamp,
    contentHash: hashBytes(Buffer.from(JSON.stringify(record), 'utf8')).slice(7),
    fetchedAt: source.generatedAt,
    parsedAt: source.generatedAt,
    parseStatus: record.status,
    payload: record,
  }));
  const landingImport = await runLandingImport({ apply: true, reportPath: null, repoRoot: ROOT, db: { host: credentials.host, port: credentials.port, user: credentials.username, password: credentials.password, database: context.databases.local } }, {
    mysqlModule: mysql,
    locateDatasetEntries: async () => landingEntries,
    writeReport: async () => null,
  });
  const landingConnection = await createConnection(mysql, credentials, context.databases.local);
  let landingRows;
  try {
    const [rows] = await landingConnection.query(
      'SELECT id,dataset_type,provider,source_key,source_page,source_revision_timestamp,content_hash,payload_json,fetched_at,parsed_at FROM source_dataset_landings WHERE dataset_type=? AND provider=? AND source_key LIKE ? ORDER BY source_page',
      ['bosses_raw', 'terraria.wiki.gg', 'wiki.page.boss:%'],
    );
    if (rows.length !== 33) throw new Error('Boss source landing readback did not return all 33 revision-bound pages');
    landingRows = rows;
  } finally { await landingConnection.end(); }
  const maintSync = await runMaintSync({ apply: true, scopes: ['bosses'], host: credentials.host, port: credentials.port, user: credentials.username, password: credentials.password, database: context.databases.maint }, {
    mysqlModule: mysql,
    config: { database: { host: credentials.host, port: credentials.port, username: credentials.username, password: credentials.password } },
    loadLandingRows: async () => landingRows,
    writeReport: async () => null,
  });
  if (Number(maintSync.writes.inserted) + Number(maintSync.writes.updated) !== 33) throw new Error('Boss maintained sync did not write all 33 Boss rows');

  const relation = await runSync({ apply: true, createDatabase: false, maintDatabase: context.databases.maint, localDatabase: context.databases.local, relationDatabase: context.databases.relation, allowLocalItemImageFallback: false, scopes: ['boss'] }, {
    config: { database: { host: credentials.host, port: credentials.port, username: credentials.username, password: credentials.password } },
    writeReports: async () => ({ auditJsonPath: path.join(temp, 'audit.json'), auditMdPath: path.join(temp, 'audit.md'), conflictsPath: path.join(temp, 'conflicts.json'), unresolvedPath: path.join(temp, 'unresolved.json') }),
  });
  const localReadback = await createConnection(mysql, credentials, context.databases.local);
  let groups; let members; let lootRows; let memberIdsAfter;
  try {
    [groups] = await localReadback.query('SELECT id,code,name_en,name_zh,image_url,progression_order,deleted FROM boss_groups ORDER BY progression_order,id');
    [members] = await localReadback.query('SELECT id,internal_name,game_id,is_boss,boss_group_id,boss_role,image_url FROM npcs WHERE boss_group_id IS NOT NULL ORDER BY id');
    [lootRows] = await localReadback.query('SELECT id,npc_id,item_id,drop_source_kind,quantity_text,chance_text,sort_order FROM npc_loot_entries ORDER BY npc_id,sort_order');
    [memberIdsAfter] = await localReadback.query('SELECT id FROM npcs WHERE boss_group_id IS NOT NULL ORDER BY id');
  } finally { await localReadback.end(); }
  const relationBosses = relation.results?.relationBosses ?? [];
  if (groups.length !== 33 || members.length !== state.sourceMemberIds.length || relationBosses.length !== 33
      || relation.results?.projectionBosses?.length !== 33
      || memberIdsAfter.some((row) => !state.sourceMemberIds.includes(Number(row.id)))) {
    throw new Error('Boss full source group/member/relation projection readback differs from exact source ownership');
  }
  if (lootImportReport.unresolvedBosses.length || lootImportReport.unresolvedItems.length) {
    throw new Error(`Boss local loot bundle has unresolved owners/items: ${JSON.stringify({ bosses: lootImportReport.unresolvedBosses.slice(0, 3), items: lootImportReport.unresolvedItems.slice(0, 3) })}`);
  }
  const apiExpectations = buildBossApiExpectations(groups, members);
  const apiBinding = await refreshBossApiBinding(mysql, credentials, allocation, redisPassword);
  return {
    status: 'passed',
    maintainedChainStatus: 'passed',
    v2AutomaticIngestionStatus: 'blocked',
    sourceMode: source.sourceMode,
    wikiUnchanged: false,
    sourceManifestSha256: state.sourceManifestFile.sha256,
    dependencyManifestSha256: state.dependencyManifestSha256,
    dependencyManifestFileSha256: state.dependencyFile.sha256,
    sourceSelection: { bossCount: 33, sourceMemberCount: state.sourceMemberIds.length, targetNpcDependencyCount: state.targetNpcIds.length, lootItemDependencyCount: state.itemByInternalName.size },
    sourceMapCrosswalk: state.sourceMapCrosswalk,
    imageCacheEvidence: state.imageCacheEvidence,
    imageCoverageStatus: 'blocked-read-only-source-cache-no-local-boss-image-bytes',
    bossImport: importSummary,
    bossLootImport: lootImportReport,
    landingImport,
    maintSync,
    relationCounts: { relationBosses: relationBosses.length, bossRewards: relation.results.bossItemRewardRelations?.length ?? 0, bossEffects: relation.results.bossEffectRelations?.length ?? 0, projectionBosses: relation.results.projectionBosses?.length ?? 0 },
    rowHashes: { groups: rowHash(groups), members: rowHash(members), loot: rowHash(lootRows), relationBosses: rowHash(relationBosses), bossRewards: rowHash(relation.results.bossItemRewardRelations ?? []), projectionBosses: rowHash(relation.results.projectionBosses ?? []) },
    apiExpectations,
    apiReadbackPreflight: apiBinding.preflight,
    objectStoreMode: 'read-only-source-cache',
    formalDatabaseWrites: false,
    productionReadinessStatus: 'blocked-by-stale-wiki-source-and-image-coverage',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.run !== 'true') throw new Error('run the Boss isolated T1 operation explicitly with --run=true');
  if (process.versions.node !== '22.23.0') throw new Error('Boss isolated T1 requires pinned Node 22.23.0');
  const executionManifest = readJson(path.join(ROOT, EXECUTION_MANIFEST_PATH), 'Boss execution manifest').value;
  const bossFile = readJson(path.join(ROOT, BOSS_SOURCE_PATH), 'Boss source');
  const npcMapFile = readJson(path.join(ROOT, NPC_MAP_PATH), 'NPC standardized map');
  const lootFile = readJson(path.join(ROOT, LOOT_PATH), 'Boss loot bundle');
  const outageFile = readJson(path.join(ROOT, OUTAGE_EVIDENCE_PATH), 'Boss Wiki outage evidence');
  const offline = buildBossLocalOfflineSource({
    bossSource: bossFile.value,
    npcMap: npcMapFile.value,
    lootBundle: lootFile.value,
    bossSourceSha256: hashBytes(bossFile.bytes),
    npcMapSha256: hashBytes(npcMapFile.bytes),
    lootBundleSha256: hashBytes(lootFile.bytes),
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: outageFile.value.status,
      actionId: outageFile.value.actionId,
      artifactPath: OUTAGE_EVIDENCE_PATH,
      sha256: hashBytes(outageFile.bytes),
    },
  });
  const source = Object.freeze({
    ...offline,
    bossRecords: bossFile.value.records,
    npcMap: npcMapFile.value,
    lootBundle: lootFile.value,
  });
  const config = loadLocalStackConfig(ROOT);
  const mysql = loadMysqlModule({ repoRoot: ROOT });
  const privateRoot = path.join(ROOT, PRIVATE_ROOT, 'bosses');
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  const registry = openDurableRunKeyRegistry(path.join(privateRoot, 'run-key-mappings.json'));
  const plan = buildEightDomainAllocationPlan({ manifest: executionManifest, domain: 'bosses', repoRoot: ROOT, runKeyRegistry: registry });
  const redisPassword = readPrivateText(path.join(ROOT, PRIVATE_ROOT, 'redis/redis.auth'));
  const credentials = { host: config.database.host, port: Number(config.database.port), username: config.database.username, password: config.database.password };
  const preflight = await runBossPreflight({ mysql, credentials, executionManifest, allocation: plan, redisPassword });
  if (args['preflight-only'] === 'true') {
    process.stdout.write(`${JSON.stringify({ status: 'preflight-passed', domain: 'bosses', runId: plan.runId, runKey: plan.runKey, sourceMode: source.sourceMode, wikiUnchanged: false, preflight }, null, 2)}\n`);
    return;
  }
  const allocation = { ...plan, preflight: { status: 'ready', observedAt: preflight.checkedAt } };
  const formalBefore = await readFormalFingerprints(mysql, credentials);
  const runDir = path.join(ROOT, allocation.automaticArtifactRoot, 'acceptance-runs', `bosses-offline-${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().slice(0, 12)}`);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(runDir, 0o700);
  const sourceManifestPath = path.join(runDir, 'boss-source-manifest.json');
  const dependencyManifestPath = path.join(runDir, 'boss-dependency-manifest.json');
  const evidencePath = path.join(ROOT, allocation.evidenceRoot, 'isolated-real-ingestion.json');
  try { fs.lstatSync(evidencePath); throw new Error('Boss isolated evidence already exists for this fixed run key'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const state = {};
  const dependencyManifestFactory = async ({ databases, readonlyClient } = {}) => {
    const formalGroups = parseRows(await readonlyClient.query(sqlObject(['id','code','name_en','name_zh','boss_type','image_url','progression_order','notes','source_page','source_revision_timestamp','status','deleted'], 'boss_groups', '`deleted`=0', 'id'), 'terria_v1_local'), 'formal boss groups');
    const formalNpcs = await readRows(readonlyClient, 'terria_v1_local', 'npcs', NPC_COLUMNS, 'id', null);
    const formalItems = await readRows(readonlyClient, 'terria_v1_local', 'items', ITEM_COLUMNS, 'id', null);
    const projection = buildBossImportProjection({ records: source.bossRecords, currentBossGroups: formalGroups, currentNpcs: formalNpcs, npcRows: formalNpcs });
    const sourceMembers = Object.values(projection.mappingByCode).flatMap((mapping) => mapping.members);
    const mapCrosswalk = sourceMembers.map((member) => {
      const gameId = Number(member.gameId);
      const mapped = source.npcMap.records[String(gameId)];
      if (!Number.isSafeInteger(gameId) || !mapped || mapped.internalName !== member.internalName) {
        throw new Error(`Boss source member NPC-map identity mismatch: ${member.internalName}`);
      }
      return { id: Number(member.id), gameId, internalName: member.internalName, role: member.role };
    });
    const sourceMemberIds = [...new Set(sourceMembers.map((row) => Number(row.id)))].sort((a, b) => a - b);
    const existingBossGroupIds = new Set(formalGroups.map((row) => Number(row.id)));
    const previousOwnerNpcIds = formalNpcs.filter((row) => existingBossGroupIds.has(Number(row.boss_group_id))).map((row) => Number(row.id));
    const targetNpcIds = [...new Set([...sourceMemberIds, ...previousOwnerNpcIds])].sort((a, b) => a - b);
    const lootNames = new Set((source.lootBundle.bosses ?? []).flatMap((boss) => (boss.drops ?? []).map((drop) => String(drop.itemInternalName ?? '').toLowerCase())).filter(Boolean));
    const localNpcRows = formalNpcs.filter((row) => targetNpcIds.includes(Number(row.id)));
    const localItemRows = await readRowsByTextValues(readonlyClient, 'terria_v1_local', 'items', ITEM_COLUMNS, 'internal_name', [...lootNames]);
    if (localNpcRows.length !== targetNpcIds.length || localItemRows.length !== lootNames.size) throw new Error('Boss exact local dependency identities are incomplete');
    const npcSourceIds = localNpcRows.map((row) => Number(row.source_id));
    const maintNpcRows = await readRows(readonlyClient, 'terria_v1_maint', 'maint_npcs', MAINT_NPC_COLUMNS, 'source_id', npcSourceIds);
    const itemIds = localItemRows.map((row) => Number(row.id));
    const maintItemRows = await readRows(readonlyClient, 'terria_v1_maint', 'maint_items', MAINT_ITEM_COLUMNS, 'source_id', itemIds);
    if (maintNpcRows.length !== targetNpcIds.length || maintItemRows.length !== itemIds.length) throw new Error('Boss exact maint dependency identities are incomplete');
    const imageCache = buildBossReadOnlyImageCache({ bossRecords: source.bossRecords, formalBossGroups: formalGroups });
    const ownerByCode = Object.fromEntries(Object.entries(projection.mappingByCode).flatMap(([code, mapping]) => {
      const primary = mapping.members.find((member) => member.role === 'primary');
      return primary ? [[code, primary]] : [];
    }));
    state.imageCache = imageCache.cache;
    state.imageCacheEvidence = { mode: imageCache.mode, count: imageCache.count, codesSha256: imageCache.codesSha256, urlsSha256: imageCache.urlsSha256 };
    state.ownerByCode = ownerByCode;
    state.itemByInternalName = new Map(localItemRows.map((row) => [String(row.internal_name).toLowerCase(), row]));
    state.npcMap = source.npcMap;
    state.sourceMapCrosswalk = mapCrosswalk;
    state.lootBundle = source.lootBundle;
    state.targetNpcIds = targetNpcIds;
    state.sourceMemberIds = sourceMemberIds;
    state.sourceManifestFile = writePrivate(sourceManifestPath, { schemaVersion: 1, manifestKind: 'boss_local_offline_source_manifest', source, imageCache, projection: { groups: projection.groups.length, members: projection.members.length, mappingByCode: projection.mappingByCode } }, 'Boss source manifest');
    state.dependencyManifest = buildBossDependencyManifest({ runId: plan.runId, runKey: plan.runKey, databases, localNpcRows, localItemRows, maintNpcRows, maintItemRows });
    state.dependencyManifestSha256 = dependencyManifestSha256(state.dependencyManifest);
    state.dependencyFile = writePrivate(dependencyManifestPath, state.dependencyManifest, 'Boss dependency manifest');
    state.preflightProjection = { groups: projection.groups.length, members: projection.members.length, targetNpcDependencies: targetNpcIds.length, currentOwnerNpcIds: previousOwnerNpcIds, itemDependencies: itemIds.length, referenceBosses: Object.entries(projection.mappingByCode).filter(([,value]) => value.sourceMode === 'reference').map(([code]) => code), mappingByCode: projection.mappingByCode };
    return state.dependencyManifest;
  };

  const minioEnv = readEnvFile(path.join(ROOT, PRIVATE_ROOT, 'minio/minio.env'));
  const result = await runLiveAutomationAcceptance({
    profile: 't1', runId: plan.runId, mysql: credentials,
    redis: { host: plan.redis.host, port: plan.redis.port, logicalDb: plan.redis.logicalDb, password: redisPassword },
    privateDirectory: path.join(runDir, 'runtime'), maxRowsPerTable: 2, scope: 'boss-canonical',
    acceptanceExecutor: (context) => runBossMaintainedChain(context, { source, state, mysql, credentials, privateDirectory: runDir, allocation, redisPassword }),
    dependencyManifestFactory, isolatedAllocation: allocation,
    isolatedApiLifecycleFactory: async ({ manifest, adapter }) => {
      const apiCredentials = buildBossRunOwnedApiCredentials({
        mysql: { host: credentials.host, port: credentials.port },
        apiAccount: adapter.apiAccounts.apiReadonly,
        redisPassword,
        runKey: allocation.runKey,
        allocation: { ...allocation, objectStore: { ...allocation.objectStore, domain: 'bosses' } },
        minio: { endpoint: allocation.objectStore.endpoint, accessKey: minioEnv.MINIO_ROOT_USER, secretKey: minioEnv.MINIO_ROOT_PASSWORD },
      });
      return buildIsolatedApiLifecycle({ allocation, mode: 'consumer-readback', credentials: apiCredentials, migrationEvidence: manifest.migrationEvidence, routes: buildBossApiRoutes(), sourceManifestPath, sourceStatePath: sourceManifestPath, validateResponse: validateBossApiResponse });
    },
  });
  const formalAfter = await readFormalFingerprints(mysql, credentials);
  if (JSON.stringify(formalBefore) !== JSON.stringify(formalAfter)) throw new Error('Boss formal fingerprints changed during isolated T1');
  const cleanup = await verifyBossCleanup(mysql, credentials, allocation, redisPassword);
  if (result.cleanupPassed !== true || result.isolatedApi?.stop?.cleanupVerified !== true
      || cleanup.schemaCount !== 0 || cleanup.accountCount !== 0
      || cleanup.redisDatabaseSizes.some((size) => size !== 0)
      || cleanup.apiPortFree !== true || cleanup.objectCountAfter !== 0) throw new Error('Boss isolated cleanup failed');
  const evidence = { schemaVersion: 1, operation: 'eight-domain-bosses-isolated-t1-local-offline', generatedAt: new Date().toISOString(), status: 'passed', domain: 'bosses', runId: plan.runId, runKey: plan.runKey, sourceMode: source.sourceMode, wikiUnchanged: false, source: { sourcePath: BOSS_SOURCE_PATH, npcMapPath: NPC_MAP_PATH, lootPath: LOOT_PATH, hashes: source.sourceHashes, bossCount: source.bossCount, lootDropCount: source.lootDropCount }, preflight, acceptance: result.acceptance, apiReadback: result.isolatedApi.readback, formalFingerprints: { unchanged: true, before: formalBefore, after: formalAfter }, cleanup: { ...cleanup, passed: true, apiStop: result.isolatedApi.stop }, imageCoverageStatus: 'blocked-read-only-source-cache-no-local-boss-image-bytes', objectStoreMode: 'read-only-source-cache', formalDatabaseWrites: false, schemaOrAccountWrites: true, v2AutomaticIngestionStatus: 'blocked', productionReadinessStatus: 'blocked-by-stale-wiki-source-and-image-coverage' };
  const evidenceSha256 = writeEvidence(evidencePath, evidence);
  process.stdout.write(`${JSON.stringify({ status: evidence.status, domain: evidence.domain, sourceMode: evidence.sourceMode, bossCount: source.bossCount, memberCount: result.acceptance.relationSummary?.projectionBosses ?? null, imageCoverageStatus: evidence.imageCoverageStatus, evidencePath: path.relative(ROOT, evidencePath).replaceAll('\\', '/'), evidenceSha256 }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
