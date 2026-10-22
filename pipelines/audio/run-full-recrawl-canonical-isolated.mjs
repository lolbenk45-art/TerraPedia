#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  AUDIO_HISTORICAL_BGM_NAMES_PATH,
  AUDIO_HISTORICAL_BGM_NAMES_SHA256,
  AUDIO_HISTORICAL_SOURCE_PATH,
  AUDIO_HISTORICAL_SOURCE_SHA256,
  buildAudioLocalOfflineSource,
  verifyAudioLocalAssetFiles,
} from './audio-offline-source.mjs';
import {
  buildAudioAssetRows,
  buildAudioLinkRows,
  runAudioAssetImport,
} from '../import/import-wiki-audio-assets-to-db.mjs';
import { buildDependencyManifest, dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from '../automation/eight-domain-isolated-allocation.mjs';
import { buildIsolatedApiLifecycle, buildRunOwnedApiCredentials, buildLiveResourceNames, runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const EXECUTION_MANIFEST_PATH = `${EXECUTION_ROOT}/execution-manifest.json`;
const OUTAGE_EVIDENCE_PATH = `${PRIVATE_ROOT}/npcs/source-decision.json`;
const API_JAR_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const HASH = /^sha256:[a-f0-9]{64}$/;
const ITEM_COLUMNS = Object.freeze(['id', 'name', 'name_zh', 'internal_name', 'category_id', 'status', 'deleted']);
const NPC_COLUMNS = Object.freeze(['id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'raw_json', 'status', 'deleted']);
const AUDIO_TABLES = Object.freeze(['audio_assets', 'audio_asset_links']);
const FORMAL_FINGERPRINT_TABLES = Object.freeze([
  ['terria_v1_local', 'audio_assets'],
  ['terria_v1_local', 'audio_asset_links'],
  ['terria_v1_local', 'items'],
  ['terria_v1_local', 'npcs'],
]);
const MUTABLE_LOCAL_TABLES = new Set(['audio_assets', 'audio_asset_links']);

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return hashBytes(Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8'));
}

function rowHash(rows) {
  const values = rows.map((row) => JSON.stringify(canonicalValue(row))).sort();
  return { rowCount: rows.length, sha256: hashBytes(Buffer.from(JSON.stringify(values), 'utf8')) };
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireIdentifier(value, label) {
  const text = String(value ?? '');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(text)) throw new Error(`${label} is not a safe SQL identifier`);
  return text;
}

function readOrdinaryFile(filePath, label, { insideRoot = ROOT } = {}) {
  const fullPath = path.resolve(filePath);
  if (insideRoot) {
    const relative = path.relative(path.resolve(insideRoot), fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} path escapes its bound root`);
  }
  const stat = fs.lstatSync(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return { fullPath, bytes: fs.readFileSync(fullPath) };
}

function readJsonFile(filePath, label, options) {
  const file = readOrdinaryFile(filePath, label, options);
  try { return { ...file, value: JSON.parse(file.bytes.toString('utf8')) }; }
  catch (error) { throw new Error(`${label} is not valid JSON`, { cause: error }); }
}

function writePrivateJson(filePath, value, label) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filePath), 0o700);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  fs.chmodSync(filePath, 0o600);
  return Object.freeze({ path: filePath, sha256: hashBytes(bytes), label });
}

function writeEvidenceJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(filePath, 'wx', 0o644);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  fs.chmodSync(filePath, 0o644);
  return hashBytes(bytes);
}

function parseArgs(argv) {
  const output = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, ...rest] = token.slice(2).split('=');
    output[key] = rest.join('=') || 'true';
  }
  return output;
}

function parseJsonRows(output, label) {
  const text = String(output ?? '').trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${label} returned malformed JSON`, { cause: error }); }
  });
}

function sqlColumns(columns) {
  return columns.flatMap((column) => [`'${column}'`, `\`${requireIdentifier(column, 'column')}\``]).join(', ');
}

async function readFormalRows(readonlyClient, table, columns, ids, keyColumn) {
  if (ids != null && (!Array.isArray(ids) || ids.length === 0)) return [];
  const values = ids == null ? [] : ids.map((value) => Number(value));
  if (values.some((value) => !Number.isSafeInteger(value))) throw new Error('Audio dependency keys must be safe integers');
  const predicate = ids == null ? '1=1' : `\`${requireIdentifier(keyColumn, 'key column')}\` IN (${values.join(',')})`;
  const orderColumn = ids == null ? 'source_id' : keyColumn;
  const sql = `SELECT JSON_OBJECT(${sqlColumns(columns)}) FROM \`${requireIdentifier(table, 'source table')}\` WHERE ${predicate} ORDER BY \`${requireIdentifier(orderColumn, 'sort column')}\``;
  return parseJsonRows(await readonlyClient.query(sql, 'terria_v1_local'), `terria_v1_local.${table}`);
}

function audioItemSourceId(asset) {
  const match = /^Item[_-](\d+)$/i.exec(String(asset?.sourceKey ?? ''));
  return match ? Number(match[1]) : null;
}

function npcSoundKeys(row) {
  let raw;
  try { raw = typeof row?.raw_json === 'string' ? JSON.parse(row.raw_json) : row?.raw_json; }
  catch { return []; }
  const value = raw?.extras?.HitSound ?? raw?.extras?.hitSound;
  return String(value ?? '').split(',').map((key) => key.trim()).filter(Boolean);
}

function discoverExactAudioDependencies(source, formalNpcRows) {
  const itemIds = [...new Set(source.assets.filter((asset) => asset.scope === 'items')
    .map(audioItemSourceId).filter(Number.isSafeInteger))].sort((a, b) => a - b);
  if (itemIds.length !== 50) throw new Error('Audio local sample must bind exactly 50 stable Item source IDs');
  const npcKeys = [...new Set(source.assets.filter((asset) => asset.scope === 'npc_hit').map((asset) => String(asset.sourceKey)))];
  const wanted = new Set(npcKeys);
  const ownersBySoundKey = Object.fromEntries(npcKeys.map((key) => [key, []]));
  const npcRowsBySourceId = new Map();
  for (const row of formalNpcRows) {
    const sourceId = Number(row.source_id);
    if (!Number.isSafeInteger(sourceId)) continue;
    const matchingKeys = npcSoundKeys(row).filter((key) => wanted.has(key));
    if (!matchingKeys.length) continue;
    npcRowsBySourceId.set(sourceId, row);
    for (const key of matchingKeys) ownersBySoundKey[key].push({
      sourceId,
      id: Number(row.id),
      internalName: String(row.internal_name ?? ''),
    });
  }
  return Object.freeze({
    itemSourceIds: Object.freeze(itemIds),
    npcSourceIds: Object.freeze([...npcRowsBySourceId.keys()].sort((a, b) => a - b)),
    npcSoundKeys: Object.freeze(ownersBySoundKey),
  });
}

export function buildAudioDependencyManifest({ runId, runKey, databases, itemRows, npcRows } = {}) {
  const exactItems = [...itemRows].sort((a, b) => Number(a.id) - Number(b.id));
  const exactNpcs = [...npcRows].sort((a, b) => Number(a.source_id) - Number(b.source_id));
  if (exactItems.length !== 50 || exactItems.some((row) => !Number.isSafeInteger(Number(row.id)))) {
    throw new Error('Audio dependency manifest requires exactly 50 stable Item rows');
  }
  if (exactNpcs.length === 0 || exactNpcs.some((row) => !Number.isSafeInteger(Number(row.source_id)))) {
    throw new Error('Audio dependency manifest requires exact stable NPC HitSound owner rows');
  }
  const dependencies = [];
  const sourceRows = {};
  const add = ({ id, table, keyColumn, rows, columns }) => {
    dependencies.push({
      id,
      purpose: id,
      source: { database: 'terria_v1_local', table },
      target: { database: databases.local, table },
      keyColumns: [keyColumn],
      keyValues: rows.map((row) => ({ [keyColumn]: Number(row[keyColumn]) })),
      columns: [...columns],
      rowHashes: [],
      expectedRowCount: rows.length,
    });
    sourceRows[id] = rows;
  };
  add({ id: 'audio-exact-item-audio-dependencies', table: 'items', keyColumn: 'id', rows: exactItems, columns: ITEM_COLUMNS });
  add({ id: 'audio-exact-npc-hit-sound-dependencies', table: 'npcs', keyColumn: 'source_id', rows: exactNpcs, columns: NPC_COLUMNS });
  return buildDependencyManifest({
    manifest: { schemaVersion: 1, domain: 'audio', runId, runKey, dependencies },
    sourceRows,
  });
}

export function buildAudioApiRoutes() {
  return Object.freeze([
    Object.freeze({ routeId: 'public-audio-assets', params: Object.freeze({}) }),
    Object.freeze({ routeId: 'public-audio-asset-detail', params: Object.freeze({ id: '1' }) }),
    Object.freeze({ routeId: 'admin-audio-assets', params: Object.freeze({}) }),
  ]);
}

function compareText(left, right) {
  const a = String(left ?? '').toLowerCase();
  const b = String(right ?? '').toLowerCase();
  return a.localeCompare(b);
}

export function buildAudioApiExpectations({ assets, assetRows, linkRows } = {}) {
  if (!Array.isArray(assets) || !Array.isArray(assetRows) || !Array.isArray(linkRows)
      || assets.length === 0 || assetRows.length !== assets.length || linkRows.length !== assets.length) {
    throw new Error('Audio API expectations require matching non-empty source, asset, and link sets');
  }
  const linksByAssetId = new Map();
  for (const row of linkRows) {
    const id = String(row.asset_id ?? row.assetId ?? '');
    if (!id) throw new Error('Audio API link row is missing its asset identity');
    const statuses = linksByAssetId.get(id) ?? [];
    statuses.push(String(row.match_status ?? row.matchStatus ?? ''));
    linksByAssetId.set(id, statuses);
  }
  const sourceByAssetId = new Map(assets.map((asset) => [String(asset.assetId), asset]));
  const normalizedRows = assetRows.map((row) => {
    const assetId = String(row.asset_id ?? row.assetId ?? '');
    const source = sourceByAssetId.get(assetId);
    if (!source) throw new Error('Audio API database readback contains an undeclared asset ID');
    const statuses = [...new Set(linksByAssetId.get(assetId) ?? [])].sort(compareText);
    return {
      id: Number(row.id),
      assetId,
      shard: String(row.shard),
      kind: String(row.kind),
      sourceKey: String(row.source_key ?? row.sourceKey ?? ''),
      matchStatuses: statuses.join(','),
      expected: source,
    };
  });
  if (normalizedRows.some((row) => !Number.isSafeInteger(row.id) || !row.matchStatuses)) {
    throw new Error('Audio API expectations contain an invalid row or a missing link status');
  }
  const ordered = normalizedRows.sort((a, b) => compareText(a.shard, b.shard)
    || compareText(a.kind, b.kind) || compareText(a.sourceKey, b.sourceKey) || a.id - b.id);
  const detail = normalizedRows.find((row) => row.id === 1);
  if (!detail) throw new Error('Audio API detail identity id=1 is missing');
  return Object.freeze({
    totalAssets: normalizedRows.length,
    pageOne: Object.freeze(ordered.slice(0, 20).map((row) => Object.freeze({
      id: row.id,
      assetId: row.assetId,
      shard: row.shard,
      kind: row.kind,
      sourceKey: row.sourceKey,
      matchStatuses: row.matchStatuses,
    }))),
    detail: Object.freeze({ id: detail.id, assetId: detail.assetId, sourceKey: detail.sourceKey }),
  });
}

export function validateAudioApiResponse({ routeId, payload, acceptance } = {}) {
  const body = requireObject(payload, `Audio API ${routeId} response`);
  if (body.success !== true) throw new Error(`Audio API ${routeId} returned an unsuccessful response`);
  const expected = requireObject(acceptance?.apiExpectations, 'Audio API expectations');
  if (routeId === 'public-audio-assets' || routeId === 'admin-audio-assets') {
    if (!Array.isArray(body.data) || Number(body.pagination?.total) !== expected.totalAssets
        || body.data.length !== expected.pageOne.length) {
      throw new Error(`Audio API ${routeId} total differs from the isolated database readback`);
    }
    for (const [index, row] of body.data.entries()) {
      const sample = expected.pageOne[index];
      if (Number(row.id) !== sample.id || String(row.assetId ?? '') !== sample.assetId
          || String(row.shard ?? '') !== sample.shard || String(row.kind ?? '') !== sample.kind
          || String(row.sourceKey ?? '') !== sample.sourceKey) {
        throw new Error(`Audio API ${routeId} stable asset identity differs from isolated readback`);
      }
      if (routeId === 'admin-audio-assets'
          && String(row.matchStatuses ?? '') !== sample.matchStatuses) {
        throw new Error('Audio admin API match status differs from isolated link rows');
      }
      if (routeId === 'admin-audio-assets' && String(row.localPath ?? '').startsWith('/')) {
        throw new Error('Audio admin API exposed an absolute local path');
      }
    }
    return {
      totalAssets: Number(body.pagination.total),
      pageRowsVerified: body.data.length,
      ...(routeId === 'admin-audio-assets' ? { linkStatusesVerified: body.data.length } : {}),
    };
  }
  if (routeId === 'public-audio-asset-detail') {
    const row = requireObject(body.data, 'public Audio detail');
    if (Number(row.id) !== expected.detail.id || String(row.assetId ?? '') !== expected.detail.assetId
        || String(row.sourceKey ?? '') !== expected.detail.sourceKey) {
      throw new Error('public Audio detail identity differs from isolated database readback');
    }
    return { id: Number(row.id), assetId: row.assetId, identityVerified: true };
  }
  throw new Error(`Audio API response validator has no registered route: ${routeId}`);
}

function normalizeRowsHash(rows) {
  const values = rows.map((row) => JSON.stringify(canonicalValue(row))).sort();
  return hashBytes(Buffer.from(JSON.stringify(values), 'utf8'));
}

function buildSchemaSnapshot({ itemRows, npcRows, assetRows, linkRows } = {}) {
  return Object.freeze({
    localItemDependencies: rowHash(itemRows),
    localNpcDependencies: rowHash(npcRows),
    audioAssets: rowHash(assetRows),
    audioAssetLinks: rowHash(linkRows),
  });
}

function assertSnapshotsDifferOnlyInAudio(before, after) {
  for (const table of ['localItemDependencies', 'localNpcDependencies']) {
    if (JSON.stringify(before[table]) !== JSON.stringify(after[table])) throw new Error(`Audio importer changed seeded ${table}`);
  }
  if (after.audioAssets.rowCount !== 150 || after.audioAssetLinks.rowCount !== 150) {
    throw new Error('Audio importer did not write exactly 150 asset and 150 link rows');
  }
}

async function createMysqlConnection(mysql, credentials, database) {
  return mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username ?? credentials.user,
    password: credentials.password,
    database,
    connectTimeout: 5000,
    dateStrings: true,
    multipleStatements: false,
  });
}


async function runMySqlPreflight({ mysql, credentials, executionManifest, allocation } = {}) {
  const connection = await createMysqlConnection(mysql, credentials, 'terria_v1_local');
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const formalNames = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases];
    const [formal] = await connection.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${formalNames.map(() => '?').join(',')}) ORDER BY schema_name`,
      formalNames,
    );
    const accounts = buildLiveResourceNames({ profile: 't1', runKey: allocation.runKey });
    const accountNames = [accounts.accounts.provisioner, accounts.accounts.readonly,
      accounts.isolatedApiAccounts.apiReadonly, accounts.isolatedApiAccounts.apiV2Test];
    const [users] = await connection.query(
      `SELECT User AS userName FROM mysql.user WHERE User IN (${accountNames.map(() => '?').join(',')})`,
      accountNames,
    );
    const formalSchemas = formal.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    const expectedFormal = [...formalNames].sort();
    if ((server.serverUuid ?? server.SERVER_UUID) !== allocation.mysql.serverUuid
        || schemas.length !== 0 || users.length !== 0
        || JSON.stringify(formalSchemas) !== JSON.stringify(expectedFormal)) {
      throw new Error('Audio MySQL UUID, schema, or run-account preflight failed');
    }
    await connection.rollback();
    return { serverUuid: allocation.mysql.serverUuid, formalSchemas, automationSchemaCount: schemas.length, existingRunAccounts: users.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { await connection.end(); }
}

function readPrivateText(filePath, label) {
  const file = readOrdinaryFile(path.resolve(ROOT, filePath), label);
  const stat = fs.statSync(file.fullPath);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must have mode 0600`);
  return file.bytes.toString('utf8').trim();
}

function redisCommand({ host, port, password }, database, ...commands) {
  return execFileSync('redis-cli', ['--raw', '-h', host, '-p', String(port), '-n', String(database), ...commands.map(String)], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, REDISCLI_AUTH: password },
  }).trim();
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function readProcessArgs(pid) {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function inspectPriorAudioAttempt() {
  const progressFile = readJsonFile('data/generated/wiki-audio-assets-progress.latest.json', 'Audio prior progress');
  if (progressFile.value.status !== 'failed' || progressFile.value.phase !== 'failed'
      || Number(progressFile.value.current) !== 0 || Number(progressFile.value.total) !== 0) {
    throw new Error('Audio offline run requires the prior bounded attempt to remain a failed zero-record attempt');
  }
  const lockFile = readJsonFile(`${PRIVATE_ROOT}/audio/refresh.lock`, 'Audio stale refresh lock');
  if (lockFile.value.actionId !== 'wiki-audio-assets-refresh') throw new Error('Audio lock belongs to another action');
  const lockOwnerArgs = readProcessArgs(lockFile.value.pid);
  if (lockOwnerArgs && /fetch-wiki-audio-assets\.mjs/.test(lockOwnerArgs)) {
    throw new Error('Audio refresh lock owner is still running');
  }
  return Object.freeze({
    progressPath: 'data/generated/wiki-audio-assets-progress.latest.json',
    priorProgressStatus: progressFile.value.status,
    priorProgressPhase: progressFile.value.phase,
    priorProgressCurrent: Number(progressFile.value.current),
    priorProgressTotal: Number(progressFile.value.total),
    staleLockPath: `${PRIVATE_ROOT}/audio/refresh.lock`,
    staleLockPid: Number(lockFile.value.pid),
    staleLockOwnerRunning: Boolean(lockOwnerArgs),
    staleLockPreserved: true,
  });
}

async function runReadOnlyPreflight({ mysql, credentials, executionManifest, allocation, redisPassword } = {}) {
  const mysqlFacts = await runMySqlPreflight({ mysql, credentials, executionManifest, allocation });
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisSizes = {};
  for (let db = 1; db <= 8; db += 1) redisSizes[db] = Number(redisCommand(redis, db, 'DBSIZE'));
  const ping = redisCommand(redis, allocation.redis.logicalDb, 'PING');
  const appendOnly = redisCommand(redis, allocation.redis.logicalDb, 'CONFIG', 'GET', 'appendonly');
  const leasePath = path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json');
  const lease = readJsonFile(leasePath, 'Audio Redis lease').value;
  if (ping !== 'PONG' || Object.values(redisSizes).some((size) => size !== 0)
      || !/^appendonly\s+no$/im.test(appendOnly) || lease.status !== 'ready'
      || lease.host !== allocation.redis.host || Number(lease.port) !== Number(allocation.redis.port)
      || lease.binarySha256 !== allocation.redis.binarySha256
      || readProcessArgs(lease.pid).indexOf('redis-server') < 0) {
    throw new Error('Audio Redis endpoint, persistence, process, or DB preflight failed');
  }
  await assertPortFree(allocation.api.host, allocation.api.port);
  const activeLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const activeAudio = activeLines.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return pid !== process.pid && /fetch-wiki-audio-assets\.mjs/.test(line);
  });
  if (activeAudio.length) throw new Error('an Audio crawler is active during the local-offline run');
  const jar = readOrdinaryFile(path.join(ROOT, API_JAR_PATH), 'Audio API JAR');
  const jarSha256 = hashBytes(jar.bytes);
  const manifestJarSha256 = executionManifest.installation?.backendJarSha256 ?? null;
  const priorAudioAttempt = inspectPriorAudioAttempt();
  return Object.freeze({
    status: 'ready',
    checkedAt: new Date().toISOString(),
    mysql: mysqlFacts,
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, ping, databaseSizes: redisSizes, appendOnly: false },
    api: { host: allocation.api.host, port: allocation.api.port, free: true },
    activeAudioWriters: 0,
    priorAudioAttempt,
    currentJarSha256: jarSha256,
    installedJarManifestSha256: manifestJarSha256,
    installedJarManifestMatch: jarSha256 === manifestJarSha256,
    formalDatabaseWrites: false,
  });
}

async function runAudioMaintainedChain(context, { source, state, mysql, credentials } = {}) {
  if (!context.dependencySeedEvidence?.readbackVerified) throw new Error('Audio exact dependencies were not independently seeded');
  const connection = await createMysqlConnection(mysql, credentials, context.databases.local);
  let itemDependencyRows;
  let npcDependencyRows;
  let importReport;
  let assetRows;
  let linkRows;
  let beforeSnapshot;
  let afterSnapshot;
  try {
    const [itemRows] = await connection.query(
      `SELECT id,name,name_zh,internal_name,category_id,status,deleted FROM items WHERE id IN (${state.dependencies.itemSourceIds.map(() => '?').join(',')}) ORDER BY id`,
      state.dependencies.itemSourceIds,
    );
    const [npcRows] = await connection.query(
      `SELECT id,game_id,source_id,internal_name,name,name_zh,raw_json,status,deleted FROM npcs WHERE source_id IN (${state.dependencies.npcSourceIds.map(() => '?').join(',')}) ORDER BY source_id`,
      state.dependencies.npcSourceIds,
    );
    if (itemRows.length !== state.dependencies.itemSourceIds.length
        || npcRows.length !== state.dependencies.npcSourceIds.length) throw new Error('Audio target exact Item/NPC dependencies are incomplete');
    itemDependencyRows = itemRows;
    npcDependencyRows = npcRows;
    const [[assetCount]] = await connection.query('SELECT COUNT(*) AS total FROM audio_assets');
    const [[linkCount]] = await connection.query('SELECT COUNT(*) AS total FROM audio_asset_links');
    if (Number(assetCount.total) !== 0 || Number(linkCount.total) !== 0) throw new Error('Audio isolated asset/link tables must be empty before importer execution');
    beforeSnapshot = buildSchemaSnapshot({ itemRows, npcRows, assetRows: [], linkRows: [] });

    const audioItemRows = itemRows.map((row) => ({ ...row, source_id: Number(row.id) }));
    const bgmDisplayNameRows = source.assets.filter((asset) => asset.shard === 'bgm').map((asset) => ({
      sourceKey: asset.sourceKey,
      displayNameZh: asset.displayNameZh,
      displayNameEn: asset.displayNameEn,
    }));
    await connection.beginTransaction();
    try {
      importReport = await runAudioAssetImport({
        apply: true,
        inputJsonPath: state.metadataFile.path,
        reportPath: null,
        db: { ...credentials, database: context.databases.local },
      }, {
        connection,
        transactionOwner: 'caller',
        itemRows: audioItemRows,
        npcRows,
        localBgmDisplayNameRows: bgmDisplayNameRows,
        writeReport: async () => null,
      });
      if (importReport.failures.length !== 0 || importReport.summary.valid !== 150
          || importReport.summary.insertedAssets !== 150 || importReport.summary.insertedLinks !== 150
          || importReport.summary.matched !== 50 || importReport.summary.ambiguous !== 0) {
        throw new Error(`Audio importer summary differs from the local sample contract: ${JSON.stringify(importReport.summary)}`);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    const [assets] = await connection.query(
      'SELECT id,asset_id,shard,kind,source_key,display_name_zh,display_name_en,file_title,wiki_file_url,source_url,local_path,absolute_local_path,mime,size_bytes,sha256,provider,status,last_verified_at,crawl_report_path,raw_json,deleted FROM audio_assets ORDER BY asset_id',
    );
    const [links] = await connection.query(
      'SELECT aal.id,aa.asset_id,aal.entity_type,aal.entity_id,aal.source_key,aal.relation_type,aal.match_status,aal.match_reason,aal.sort_order,aal.deleted FROM audio_asset_links aal JOIN audio_assets aa ON aa.id=aal.audio_asset_id ORDER BY aa.asset_id,aal.entity_type,aal.source_key,aal.relation_type',
    );
    assetRows = assets;
    linkRows = links;
    if (assets.length !== 150 || new Set(assets.map((row) => row.asset_id)).size !== 150 || links.length !== 150) {
      throw new Error('Audio independent asset/link readback count differs from the exact 150-row sample');
    }
    const selectedIds = new Set(source.assets.map((asset) => asset.assetId));
    if (assets.some((row) => !selectedIds.has(String(row.asset_id)))) throw new Error('Audio target contains an undeclared asset ID');
    const expectedAssets = buildAudioAssetRows(source.assets, {
      itemRows: audioItemRows,
      npcRows,
      bgmDisplayNameRows,
      verifiedAt: new Date('2026-10-21T00:00:00Z'),
    });
    const expectedAssetById = new Map(expectedAssets.map((row) => [row.assetId, row]));
    for (const row of assets) {
      const expected = expectedAssetById.get(String(row.asset_id));
      if (!expected || row.shard !== expected.shard || row.kind !== expected.kind
          || row.source_key !== expected.sourceKey || row.display_name_zh !== expected.displayNameZh
          || row.display_name_en !== expected.displayNameEn || row.file_title !== expected.fileTitle
          || row.source_url !== expected.sourceUrl || row.local_path !== expected.localPath
          || Number(row.size_bytes) !== expected.sizeBytes || row.sha256 !== expected.sha256
          || row.raw_json !== expected.rawJson) throw new Error(`Audio asset row readback mismatch: ${row.asset_id}`);
    }
    const expectedLinks = new Map(buildAudioLinkRows(source.assets, audioItemRows).map((row) => [row.assetId, row]));
    for (const row of links) {
      const expected = expectedLinks.get(String(row.asset_id));
      if (!expected || row.entity_type !== expected.entityType
          || Number(row.entity_id ?? 0) !== Number(expected.entityId ?? 0)
          || row.source_key !== expected.sourceKey || row.relation_type !== expected.relationType
          || row.match_status !== expected.matchStatus || row.match_reason !== expected.matchReason) {
        throw new Error(`Audio asset link readback mismatch: ${row.asset_id}`);
      }
    }
    const statusCounts = Object.fromEntries(['matched', 'unmatched', 'ambiguous'].map((status) => [
      status, links.filter((row) => row.match_status === status).length,
    ]));
    if (statusCounts.matched !== 50 || statusCounts.unmatched !== 100 || statusCounts.ambiguous !== 0) {
      throw new Error(`Audio source link status distribution changed: ${JSON.stringify(statusCounts)}`);
    }
    afterSnapshot = buildSchemaSnapshot({ itemRows, npcRows, assetRows: assets, linkRows: links });
    assertSnapshotsDifferOnlyInAudio(beforeSnapshot, afterSnapshot);
  } finally { await connection.end(); }

  return Object.freeze({
    status: 'passed',
    maintainedChainStatus: 'passed',
    v2AutomaticIngestionStatus: 'blocked',
    sourceMode: source.sourceMode,
    wikiUnchanged: false,
    sourceManifestSha256: state.sourceManifestFile.sha256,
    dependencyManifestSha256: state.dependencyManifestSha256,
    dependencyManifestFileSha256: state.dependencyFile.sha256,
    selection: source.selection,
    missingBgmDisplayNameSourceKeys: source.missingBgmDisplayNameSourceKeys,
    localFileVerification: state.localFileVerification,
    historicalInputs: source.historicalInputs,
    outageEvidence: source.outageEvidence,
    importReport,
    assetRows: rowHash(assetRows),
    linkRows: rowHash(linkRows),
    itemDependencyRows: rowHash(itemDependencyRows),
    npcDependencyRows: rowHash(npcDependencyRows),
    dependencySeedEvidence: context.dependencySeedEvidence,
    linkStatusCounts: { matched: 50, unmatched: 100, ambiguous: 0 },
    apiExpectations: buildAudioApiExpectations({ assets: source.assets, assetRows, linkRows }),
    objectStorageMode: 'metadata-link-only',
    binaryUploadTested: false,
    productionReadinessStatus: 'blocked-by-historical-offline-source-and-unmatched-owner-links',
  });
}

async function readOnlyPreflight({ mysql, credentials, executionManifest, allocation, redisPassword } = {}) {
  const connection = await createMysqlConnection(mysql, credentials, 'terria_v1_local');
  let mysqlFacts;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const formalNames = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases];
    const [formal] = await connection.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${formalNames.map(() => '?').join(',')}) ORDER BY schema_name`, formalNames);
    const runNames = buildLiveResourceNames({ profile: 't1', runKey: allocation.runKey });
    const accountNames = [runNames.accounts.provisioner, runNames.accounts.readonly, runNames.isolatedApiAccounts.apiReadonly, runNames.isolatedApiAccounts.apiV2Test];
    const [users] = await connection.query(`SELECT User FROM mysql.user WHERE User IN (${accountNames.map(() => '?').join(',')})`, accountNames);
    const formalSchemas = formal.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    if ((server.serverUuid ?? server.SERVER_UUID) !== allocation.mysql.serverUuid
        || schemas.length || users.length
        || JSON.stringify(formalSchemas) !== JSON.stringify([...formalNames].sort())) {
      throw new Error('Audio MySQL UUID, schema, or account preflight failed');
    }
    mysqlFacts = { serverUuid: allocation.mysql.serverUuid, formalSchemas, automationSchemaCount: 0, existingRunAccounts: 0 };
    await connection.rollback();
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }

  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisSizes = {};
  for (let db = 1; db <= 8; db += 1) redisSizes[db] = Number(redisCommand(redis, db, 'DBSIZE'));
  const ping = redisCommand(redis, allocation.redis.logicalDb, 'PING');
  const persistence = redisCommand(redis, allocation.redis.logicalDb, 'CONFIG', 'GET', 'appendonly');
  const redisLease = readJsonFile(path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json'), 'Audio Redis lease').value;
  if (ping !== 'PONG' || Object.values(redisSizes).some((size) => size !== 0)
      || !/^appendonly\s+no$/im.test(persistence) || redisLease.status !== 'ready'
      || redisLease.host !== allocation.redis.host || Number(redisLease.port) !== Number(allocation.redis.port)
      || redisLease.binarySha256 !== allocation.redis.binarySha256
      || !readProcessArgs(redisLease.pid).includes('redis-server')) throw new Error('Audio Redis preflight failed');
  await assertPortFree(allocation.api.host, allocation.api.port);
  const writerLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
    .filter((line) => Number(line.trim().split(/\s+/, 1)[0]) !== process.pid && /fetch-wiki-audio-assets\.mjs/.test(line));
  if (writerLines.length) throw new Error('Audio crawler conflicts with the offline Audio T1 run');
  const jar = readOrdinaryFile(path.join(ROOT, API_JAR_PATH), 'Audio API JAR');
  return Object.freeze({
    status: 'ready', checkedAt: new Date().toISOString(), mysql: mysqlFacts,
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, ping, databaseSizes: redisSizes, appendOnly: false },
    api: { host: allocation.api.host, port: allocation.api.port, free: true },
    activeAudioWriters: 0, currentJarSha256: hashBytes(jar.bytes),
    installedJarManifestSha256: executionManifest.installation?.backendJarSha256 ?? null,
    installedJarManifestMatch: hashBytes(jar.bytes) === (executionManifest.installation?.backendJarSha256 ?? null),
    formalDatabaseWrites: false,
  });
}

function parseSimpleEnv(filePath) {
  const file = readOrdinaryFile(filePath, 'Redis auth file');
  if ((fs.statSync(file.fullPath).mode & 0o077) !== 0) throw new Error('Redis auth file must have mode 0600');
  return file.bytes.toString('utf8').trim();
}

function parseOutageEvidence() {
  const file = readJsonFile(path.join(ROOT, OUTAGE_EVIDENCE_PATH), 'Wiki outage evidence');
  return {
    status: file.value.status,
    actionId: file.value.actionId,
    artifactPath: OUTAGE_EVIDENCE_PATH,
    sha256: hashBytes(file.bytes),
  };
}

function assertAudioProgressAndLock() {
  const progress = readJsonFile(path.join(ROOT, 'data/generated/wiki-audio-assets-progress.latest.json'), 'Audio progress').value;
  if (progress.status !== 'failed' || progress.phase !== 'failed' || Number(progress.current) !== 0 || Number(progress.total) !== 0) {
    throw new Error('Audio prior bounded crawler attempt is not a terminal failed zero-record state');
  }
  const lock = readJsonFile(path.join(ROOT, PRIVATE_ROOT, 'audio/refresh.lock'), 'preserved Audio refresh lock').value;
  if (lock.actionId !== 'wiki-audio-assets-refresh') throw new Error('Audio refresh lock action identity differs');
  const ownerArgs = readProcessArgs(lock.pid);
  if (ownerArgs.includes('fetch-wiki-audio-assets.mjs')) throw new Error('Audio crawler process still owns the refresh lock');
  return { status: progress.status, phase: progress.phase, current: 0, total: 0, lockPid: Number(lock.pid), lockOwnerRunning: Boolean(ownerArgs), lockPreserved: true };
}

async function captureFormalFingerprints(mysql, credentials) {
  const connection = await createMysqlConnection(mysql, credentials, 'terria_v1_local');
  const fingerprints = {};
  try {
    await connection.query('START TRANSACTION READ ONLY');
    for (const [database, table] of FORMAL_FINGERPRINT_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${database}\`.\`${table}\``);
      fingerprints[`${database}.${table}`] = rowHash(rows);
    }
    await connection.rollback();
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }
  return Object.freeze(fingerprints);
}

async function verifyCleanup(mysql, credentials, allocation, redisPassword) {
  const connection = await createMysqlConnection(mysql, credentials, 'terria_v1_local');
  let schemaCount;
  let accountCount;
  try {
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%'");
    schemaCount = schemas.length;
    const names = buildLiveResourceNames({ profile: 't1', runKey: allocation.runKey });
    const users = [names.accounts.provisioner, names.accounts.readonly, names.isolatedApiAccounts.apiReadonly, names.isolatedApiAccounts.apiV2Test];
    const [accounts] = await connection.query(`SELECT User FROM mysql.user WHERE User IN (${users.map(() => '?').join(',')})`, users);
    accountCount = accounts.length;
  } finally { await connection.end(); }
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisDatabaseSizes = [];
  for (let db = 1; db <= 8; db += 1) redisDatabaseSizes.push(Number(redisCommand(redis, db, 'DBSIZE')));
  let apiPortFree = true;
  try { await assertPortFree(allocation.api.host, allocation.api.port); }
  catch { apiPortFree = false; }
  return Object.freeze({ schemaCount, accountCount, redisDatabaseSizes, apiPortFree });
}

function buildFinalEvidence({ executionManifest, allocation, preflight, source, state, execution, formalBefore, formalAfter, cleanup } = {}) {
  const acceptance = execution.acceptance;
  const apiRoutes = execution.isolatedApi?.readback;
  if (execution.status !== 'passed' || execution.cleanupPassed !== true
      || acceptance?.maintainedChainStatus !== 'passed'
      || execution.isolatedApi?.stop?.cleanupVerified !== true
      || !Array.isArray(apiRoutes) || apiRoutes.length !== 3
      || JSON.stringify(formalBefore) !== JSON.stringify(formalAfter)
      || cleanup.schemaCount !== 0 || cleanup.accountCount !== 0
      || cleanup.redisDatabaseSizes.some((size) => size !== 0) || cleanup.apiPortFree !== true) {
    throw new Error('Audio isolated T1 cleanup, formal no-write, or API readback evidence is incomplete');
  }
  return Object.freeze({
    schemaVersion: 1,
    operation: 'eight-domain-audio-isolated-t1-local-offline',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    domain: 'audio',
    runId: allocation.runId,
    runKey: allocation.runKey,
    sourceMode: source.sourceMode,
    wikiUnchanged: false,
    sourceManifestSha256: state.sourceManifestFile.sha256,
    dependencyManifestSha256: state.dependencyManifestSha256,
    dependencyManifestFileSha256: state.dependencyFile.sha256,
    offlineSource: {
      historicalInputs: source.historicalInputs,
      sourceSelection: source.selection,
      missingBgmDisplayNameSourceKeys: source.missingBgmDisplayNameSourceKeys,
      localFileVerification: state.localFileVerification,
      outageEvidence: source.outageEvidence,
      priorAudioAttempt: preflight.priorAudioAttempt,
    },
    preflight,
    resources: {
      mysql: { host: allocation.mysql.host, port: allocation.mysql.port, serverUuid: allocation.mysql.serverUuid },
      redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb },
      databases: allocation.mysql.databases,
    },
    acceptance,
    apiReadback: { routeResults: apiRoutes, status: 'passed' },
    formalFingerprints: { unchanged: true, before: formalBefore, after: formalAfter },
    cleanup: { passed: true, ...cleanup, apiStop: execution.isolatedApi.stop },
    formalDatabaseWrites: false,
    databaseWritesToFormalRuntime: false,
    schemaOrAccountWrites: true,
    objectStorageMode: 'metadata-link-only',
    binaryUploadTested: false,
    productionReadinessStatus: acceptance.productionReadinessStatus,
    v2AutomaticIngestionStatus: 'blocked',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.run !== 'true') throw new Error('run the Audio isolated T1 operation explicitly with --run=true');
  if (process.versions.node !== '22.23.0') throw new Error('Audio isolated T1 run requires pinned Node 22.23.0');
  const executionManifest = readJsonFile(path.join(ROOT, EXECUTION_MANIFEST_PATH), 'eight-domain execution manifest').value;
  const sourceFile = readJsonFile(path.join(ROOT, AUDIO_HISTORICAL_SOURCE_PATH), 'historical Audio source report');
  const bgmFile = readJsonFile(AUDIO_HISTORICAL_BGM_NAMES_PATH, 'historical BGM name source', { insideRoot: null });
  const offlineSource = buildAudioLocalOfflineSource({
    source: sourceFile.value,
    bgmNames: bgmFile.value,
    sourceSha256: hashBytes(sourceFile.bytes),
    bgmNamesSha256: hashBytes(bgmFile.bytes),
    authorization: 'user-directed-local-offline',
    outageEvidence: parseOutageEvidence(),
    sourcePath: AUDIO_HISTORICAL_SOURCE_PATH,
    bgmNamesPath: AUDIO_HISTORICAL_BGM_NAMES_PATH,
  });
  const localFileVerification = verifyAudioLocalAssetFiles(offlineSource.assets);
  const priorAudioAttempt = assertAudioProgressAndLock();
  const source = Object.freeze({ ...offlineSource, localFileVerification, priorAudioAttempt });

  const config = loadLocalStackConfig(ROOT);
  const mysql = loadMysqlModule({ repoRoot: ROOT });
  const privateRoot = path.join(ROOT, PRIVATE_ROOT, 'audio');
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  const registryPath = path.join(privateRoot, 'acceptance/run-key-mappings.json');
  const registry = openDurableRunKeyRegistry(registryPath);
  const plan = buildEightDomainAllocationPlan({
    manifest: executionManifest,
    domain: 'audio',
    repoRoot: ROOT,
    runKeyRegistry: registry,
  });
  if (plan.source.mode !== 'bounded-live-capture' || plan.objectStore !== null) {
    throw new Error('Audio fixed allocation must remain bounded-capture/metadata-link-only; offline authorization is separate');
  }
  const redisPassword = readPrivateText(path.join(ROOT, PRIVATE_ROOT, 'redis/redis.auth'), 'Audio Redis secret');
  const credentials = {
    host: config.database.host,
    port: Number(config.database.port),
    username: config.database.username,
    password: config.database.password,
  };
  const redis = { host: plan.redis.host, port: plan.redis.port, logicalDb: plan.redis.logicalDb, password: redisPassword };
  const preflight = await readOnlyPreflight({ mysql, credentials, executionManifest, allocation: plan, redisPassword });
  if (args['preflight-only'] === 'true') {
    process.stdout.write(`${JSON.stringify({
      status: 'preflight-passed',
      domain: 'audio',
      runId: plan.runId,
      runKey: plan.runKey,
      sourceMode: source.sourceMode,
      wikiUnchanged: false,
      sourceSelection: source.selection,
      missingBgmDisplayNameSourceKeys: source.missingBgmDisplayNameSourceKeys,
      preflight,
    }, null, 2)}\n`);
    return;
  }
  const allocation = { ...plan, preflight: { status: 'ready', observedAt: preflight.checkedAt } };
  const formalBefore = await captureFormalFingerprints(mysql, credentials);

  const attemptId = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const privateDirectory = path.join(ROOT, allocation.automaticArtifactRoot, 'acceptance-runs', `audio-offline-${attemptId}`);
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const metadataPath = path.join(privateDirectory, 'audio-metadata.json');
  const sourceManifestPath = path.join(privateDirectory, 'audio-source-manifest.json');
  const dependencyManifestPath = path.join(privateDirectory, 'audio-dependency-manifest.json');
  const metadataFile = writePrivateJson(metadataPath, {
    schemaVersion: 1,
    generatedAt: source.historicalInputs.sourceGeneratedAt,
    source: { mode: 'local-offline-authorized', wikiUnchanged: false },
    assets: source.assets,
  }, 'selected Audio metadata');
  const evidencePath = path.join(ROOT, allocation.evidenceRoot, 'isolated-real-ingestion.json');
  try { fs.lstatSync(evidencePath); throw new Error('Audio isolated T1 evidence already exists for this run key'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const state = { metadataFile, localFileVerification, dependencies: null };
  const dependencyManifestFactory = async ({ databases, readonlyClient } = {}) => {
    if (!readonlyClient || typeof readonlyClient.query !== 'function') throw new Error('Audio dependencies require the formal read-only snapshot account');
    const itemSourceIds = [...new Set(source.assets.filter((asset) => asset.shard === 'items')
      .map((asset) => audioItemSourceId(asset)).filter(Number.isSafeInteger))].sort((a, b) => a - b);
    const formalItemRows = await readFormalRows(readonlyClient, 'items', ITEM_COLUMNS, itemSourceIds, 'id');
    if (formalItemRows.length !== itemSourceIds.length) throw new Error('Audio exact formal Item dependencies are incomplete');
    const standardizedFile = readJsonFile(path.join(ROOT, 'data/standardized/items.standardized.json'), 'standardized Item identity source');
    const standardizedById = new Map(standardizedFile.value.records.map((row) => [Number(row.id), String(row.internalName)]));
    for (const row of formalItemRows) {
      if (String(row.internal_name).toLowerCase() !== String(standardizedById.get(Number(row.id))).toLowerCase()) {
        throw new Error(`Audio Item dependency identity drift at source ID ${row.id}`);
      }
    }
    const formalNpcRows = await readFormalRows(readonlyClient, 'npcs', NPC_COLUMNS, null, null);
    const discovered = discoverExactAudioDependencies(source, formalNpcRows);
    const exactNpcRows = formalNpcRows.filter((row) => discovered.npcSourceIds.includes(Number(row.source_id)));
    const dependencyManifest = buildAudioDependencyManifest({
      runId: allocation.runId,
      runKey: allocation.runKey,
      databases,
      itemRows: formalItemRows,
      npcRows: exactNpcRows,
    });
    const sourceManifest = {
      schemaVersion: 1,
      manifestKind: 'audio_local_offline_source_manifest',
      domain: 'audio',
      runId: allocation.runId,
      runKey: allocation.runKey,
      sourceMode: source.sourceMode,
      wikiUnchanged: false,
      audioSource: source,
      standardizedItemSourceSha256: hashBytes(standardizedFile.bytes),
      dependencies: {
        itemSourceIds,
        npcSourceIds: discovered.npcSourceIds,
        npcSoundKeys: discovered.npcSoundKeys,
      },
      dependencyManifestSha256: dependencyManifestSha256(dependencyManifest),
    };
    state.dependencies = discovered;
    state.sourceManifestFile = writePrivateJson(sourceManifestPath, sourceManifest, 'Audio source manifest');
    state.dependencyManifest = dependencyManifest;
    state.dependencyManifestSha256 = dependencyManifestSha256(dependencyManifest);
    state.dependencyFile = writePrivateJson(dependencyManifestPath, dependencyManifest, 'Audio dependency manifest');
    return dependencyManifest;
  };

  const result = await runLiveAutomationAcceptance({
    profile: 't1',
    runId: allocation.runId,
    mysql: credentials,
    redis,
    privateDirectory: path.join(privateDirectory, 'runtime'),
    maxRowsPerTable: 2,
    scope: 'audio-canonical',
    acceptanceExecutor: (context) => runAudioMaintainedChain(context, { source, state, mysql, credentials }),
    dependencyManifestFactory,
    isolatedAllocation: allocation,
    isolatedApiLifecycleFactory: async ({ manifest, adapter } = {}) => {
      if (!state.sourceManifestFile) throw new Error('Audio API startup requires the bound local source manifest');
      const apiCredentials = buildRunOwnedApiCredentials({
        mysql: { host: credentials.host, port: credentials.port },
        apiAccount: adapter.apiAccounts.apiReadonly,
        redisPassword,
        runKey: allocation.runKey,
      });
      return buildIsolatedApiLifecycle({
        allocation,
        mode: 'consumer-readback',
        credentials: apiCredentials,
        migrationEvidence: manifest.migrationEvidence,
        routes: buildAudioApiRoutes(),
        sourceManifestPath,
        sourceStatePath: sourceManifestPath,
        validateResponse: validateAudioApiResponse,
      });
    },
  });

  const formalAfter = await captureFormalFingerprints(mysql, credentials);
  if (JSON.stringify(formalBefore) !== JSON.stringify(formalAfter)) throw new Error('formal fingerprints changed during Audio isolated T1');
  const cleanup = await verifyCleanup(mysql, credentials, allocation, redisPassword);
  const evidence = buildFinalEvidence({
    executionManifest, allocation, preflight, source, state, execution: result, formalBefore, formalAfter, cleanup,
  });
  const evidenceSha256 = writeEvidenceJson(evidencePath, evidence);
  process.stdout.write(`${JSON.stringify({
    status: evidence.status,
    domain: evidence.domain,
    sourceMode: evidence.sourceMode,
    metadataRecords: evidence.acceptance.selection.total,
    linkStatusCounts: evidence.acceptance.linkStatusCounts,
    missingBgmDisplayNameSourceKeys: evidence.acceptance.missingBgmDisplayNameSourceKeys,
    apiReadbackStatus: evidence.apiReadback.status,
    productionReadinessStatus: evidence.productionReadinessStatus,
    cleanupPassed: evidence.cleanup.passed,
    evidencePath: path.relative(ROOT, evidencePath).replaceAll('\\', '/'),
    evidenceSha256,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
