#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { buildLocalProjectileSourceBinding, buildProjectileDependencyManifest, buildProjectileOfflineSourceDecision, buildProjectileSourceRelationEvidence, PROJECTILE_MAINT_ITEM_COLUMNS, PROJECTILE_SOURCE_KEY, REQUIRED_PROJECTILE_COUNT } from './projectile-offline-source.mjs';
import { dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import { importProjectiles } from '../import/import-independent-entities-to-db.mjs';
import { runLandingImport } from '../landing/import-source-dataset-landings.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from '../automation/eight-domain-isolated-allocation.mjs';
import { buildIsolatedApiLifecycle, buildRunOwnedApiCredentials, runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { buildLiveResourceNames } from '../automation/run-live-automation-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const EXECUTION_MANIFEST_PATH = `${EXECUTION_ROOT}/execution-manifest.json`;
const STANDARDIZED_PATH = 'data/standardized/projectiles.standardized.json';
const VIEW_META_PATH = 'data/standardized-view/projectiles/_meta.json';
const PRIOR_SOURCE_REPORT_PATH = 'reports/authorization/canonical/l1-runs/projectiles/projectiles_l1_20260829_serial03/source.json';
const OUTAGE_EVIDENCE_PATH = `${PRIVATE_ROOT}/npcs/source-decision.json`;
const API_JAR_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const HASH = /^sha256:[a-f0-9]{64}$/;
const RELATION_INPUT_COLUMNS = Object.freeze(['source_id', 'internal_name', 'english_name', 'raw_json']);
const UNRESOLVED_PROJECTILE_IDS = Object.freeze([1112, 1113, 1117, 1118, 1119, 1122]);
const MUTABLE_TABLES = Object.freeze({
  local: new Set(['source_dataset_landings', 'projectiles']),
  maint: new Set(['maint_projectiles']),
  relation: new Set([
    'relation_runs', 'relation_run_reports', 'relation_items', 'relation_projectiles',
    'relation_projectile_images', 'item_projectile_relations', 'item_projectile_audits',
    'projection_items', 'projection_projectiles', 'relation_item_rarities',
  ]),
});
const FORMAL_FINGERPRINT_TABLES = Object.freeze([
  ['terria_v1_local', 'projectiles'],
  ['terria_v1_maint', 'maint_items'],
  ['terria_v1_maint', 'maint_npcs'],
  ['terria_v1_maint', 'maint_projectiles'],
  ['terria_v1_relation', 'relation_projectiles'],
  ['terria_v1_relation', 'projection_projectiles'],
  ['terria_v1_relation', 'relation_projectile_images'],
  ['terria_v1_relation', 'item_projectile_relations'],
  ['terria_v1_relation', 'item_projectile_audits'],
  ['terria_v1_relation', 'npc_projectile_relations'],
  ['terria_v1_relation', 'npc_projectile_audits'],
]);

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

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireSafeIdentifier(value, label) {
  const text = String(value ?? '');
  if (!/^[a-z0-9_]+$/.test(text)) throw new Error(`${label} is not a safe SQL identifier`);
  return text;
}

function readOrdinaryFile(relativePath, label) {
  const fullPath = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} path escapes the repository`);
  const stat = fs.lstatSync(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return { fullPath, bytes: fs.readFileSync(fullPath) };
}

function readJsonFile(relativePath, label) {
  const file = readOrdinaryFile(relativePath, label);
  try {
    return { ...file, value: JSON.parse(file.bytes.toString('utf8')) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function writePrivateJson(filePath, value, label) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  fs.chmodSync(parent, 0o700);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, 0o600);
  return Object.freeze({ path: filePath, sha256: hashBytes(bytes), label });
}

function writePublicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const descriptor = fs.openSync(filePath, 'wx', 0o644);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, 0o644);
  return hashBytes(bytes);
}

function readPrivateText(relativePath, label) {
  const { fullPath } = { fullPath: path.resolve(ROOT, relativePath) };
  const stat = fs.lstatSync(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${label} must be a private ordinary file`);
  }
  return fs.readFileSync(fullPath, 'utf8').trim();
}

function assertRepositoryFrozenSourcePaths() {
  const paths = [STANDARDIZED_PATH, VIEW_META_PATH];
  const status = execFileSync('git', ['status', '--short', '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (status) throw new Error('Projectile standardized source or view metadata has uncommitted changes');
}

function assertViewPartsMatch(standardized, binding) {
  const metaFile = readJsonFile(VIEW_META_PATH, 'Projectile view metadata');
  const meta = metaFile.value;
  if (meta.entity !== 'projectiles' || meta.mode !== 'array' || meta.sourceFile !== STANDARDIZED_PATH
      || meta.totalRecords !== REQUIRED_PROJECTILE_COUNT || !Array.isArray(meta.parts)) {
    throw new Error('Projectile view metadata does not bind the fixed standardized source');
  }
  const viewIds = [];
  let partCount = 0;
  for (const part of meta.parts) {
    const name = String(part?.name ?? '');
    if (!name || path.basename(name) !== name || !/^part-[0-9]{4}\.json$/.test(name)) {
      throw new Error('Projectile view metadata contains an unsafe part name');
    }
    const partFile = readJsonFile(`data/standardized-view/projectiles/${name}`, `Projectile view part ${name}`);
    const payload = partFile.value;
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.records) ? payload.records : null;
    if (!rows || rows.length !== part.records) throw new Error(`Projectile view part count drift: ${name}`);
    partCount += rows.length;
    for (const row of rows) viewIds.push(Number(row?.id));
  }
  if (partCount !== REQUIRED_PROJECTILE_COUNT
      || JSON.stringify([...viewIds].sort((a, b) => a - b))
        !== JSON.stringify(standardized.records.map((row) => Number(row.id)).sort((a, b) => a - b))) {
    throw new Error('Projectile standardized view parts do not contain the bound source identities');
  }
  if (hashJson([...new Set(viewIds)].sort((a, b) => a - b)) !== binding.stableIdsSha256) {
    throw new Error('Projectile view part stable identities differ from the source binding');
  }
  return { partCount: meta.parts.length, recordCount: partCount, viewMetaSha256: binding.viewMetaSha256 };
}

export function buildProjectileLandingEntry({ standardized, localBinding, sourceIdentity } = {}) {
  const source = requireObject(standardized, 'standardized Projectile source');
  if (source.entity !== 'projectiles' || !Array.isArray(source.records)
      || source.records.length !== REQUIRED_PROJECTILE_COUNT
      || localBinding?.sourceKey !== PROJECTILE_SOURCE_KEY
      || localBinding.recordCount !== REQUIRED_PROJECTILE_COUNT
      || localBinding.stableIdCount !== REQUIRED_PROJECTILE_COUNT
      || !HASH.test(localBinding.standardizedSha256 ?? '')) {
    throw new Error('Projectile landing requires the complete hash-bound 1,111-record local source');
  }
  const identity = requireObject(sourceIdentity, 'prior Projectile module identity');
  if (Number(identity.pageId) !== 18025
      || identity.revisionTimestamp !== localBinding.sourceRevisionTimestamp
      || !HASH.test(identity.moduleContentSha256 ?? '')) {
    throw new Error('Projectile landing does not match the prior module page and revision identity');
  }
  const records = [...source.records].sort((left, right) => Number(left.id) - Number(right.id));
  const ids = records.map((row) => Number(row.id));
  if (new Set(ids).size !== REQUIRED_PROJECTILE_COUNT || ids.some((id, index) => id !== index)) {
    throw new Error('Projectile landing requires the complete stable ID range 0 through 1,110');
  }
  const payload = {
    source: 'terraria.wiki.gg:Module:Projectileinfo/data',
    sourceApi: source.upstreamMeta?.sourceApi ?? 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: source.upstreamMeta?.sourcePageTitle ?? 'Module:Projectileinfo/data',
    sourceRevisionTimestamp: identity.revisionTimestamp,
    fetchedAt: source.upstreamMeta?.fetchedAt ?? null,
    moduleGeneratedAt: source.upstreamMeta?.moduleGeneratedAt ?? null,
    moduleGeneratedFrom: source.upstreamMeta?.moduleGeneratedFrom ?? null,
    totalProjectiles: records.length,
    projectiles: records.map((record) => ({
      ...record,
      damage: record.combat?.damage ?? null,
      knockBack: record.combat?.knockBack ?? null,
      penetrate: record.combat?.penetrate ?? null,
      timeLeft: record.lifecycle?.timeLeft ?? null,
      width: record.dimensions?.width ?? null,
      height: record.dimensions?.height ?? null,
      scale: record.dimensions?.scale ?? null,
      friendly: record.flags?.friendly ?? null,
      hostile: record.flags?.hostile ?? null,
      tileCollide: record.flags?.tileCollide ?? null,
    })),
  };
  const payloadJson = JSON.stringify(payload);
  const contentHash = createHash('sha256').update(payloadJson, 'utf8').digest('hex');
  return Object.freeze({
    datasetType: 'projectiles_raw',
    provider: 'terraria.wiki.gg',
    sourceKind: 'module',
    sourceKey: PROJECTILE_SOURCE_KEY,
    sourceLocator: 'https://terraria.wiki.gg/wiki/Module:Projectileinfo/data',
    sourcePage: 'Module:Projectileinfo/data',
    sourceRevisionTimestamp: identity.revisionTimestamp,
    fetchedAt: payload.fetchedAt,
    parsedAt: payload.fetchedAt,
    parseStatus: 'ok',
    payloadBytes: Buffer.byteLength(payloadJson, 'utf8'),
    contentHash,
    artifactRole: 'legacy_compat',
    producerId: 'eight-domain-projectiles-acceptance',
    producerVersion: 'v1',
    payload,
  });
}

export function buildProjectileApiRoutes() {
  return Object.freeze([
    Object.freeze({ routeId: 'public-projectiles', params: Object.freeze({}) }),
    Object.freeze({ routeId: 'admin-projectiles', params: Object.freeze({}) }),
    Object.freeze({ routeId: 'admin-projectile-detail', params: Object.freeze({ id: '1' }) }),
  ]);
}

export function buildProjectileOfflineSourceManifest({ runId, runKey, source, viewEvidence, relationEvidence, dependencyManifestSha256 } = {}) {
  const boundSource = requireObject(source, 'offline Projectile source binding');
  const decision = requireObject(boundSource.sourceDecision, 'offline Projectile source decision');
  if (decision.sourceMode !== 'local-offline-authorized' || decision.wikiUnchanged !== false
      || boundSource.localBinding?.recordCount !== REQUIRED_PROJECTILE_COUNT
      || !HASH.test(relationEvidence?.manifestSha256 ?? '')
      || !HASH.test(dependencyManifestSha256 ?? '')) {
    throw new Error('Projectile source manifest requires complete local-offline, relation, and dependency bindings');
  }
  return Object.freeze({
    schemaVersion: 1,
    manifestKind: 'projectile_local_offline_source_manifest',
    domain: 'projectiles',
    runId,
    runKey,
    sourceMode: decision.sourceMode,
    wikiUnchanged: false,
    sourceIdentity: boundSource.sourceIdentity,
    localBinding: boundSource.localBinding,
    viewEvidence,
    offlineSourceDecision: decision,
    relationEvidence,
    dependencyManifestSha256,
  });
}

function buildApiExpectations(records) {
  return Object.freeze({
    totalRecords: records.length,
    pageOne: Object.freeze(records.slice(0, 20).map((record, index) => Object.freeze({
      id: index + 1,
      sourceId: Number(record.id),
      internalName: String(record.internalName),
    }))),
    detail: Object.freeze({
      id: 1,
      sourceId: Number(records[0].id),
      internalName: String(records[0].internalName),
    }),
  });
}

export function validateProjectileApiResponse({ routeId, payload, acceptance } = {}) {
  const body = requireObject(payload, `Projectile API ${routeId} response`);
  if (body.success !== true) throw new Error(`Projectile API ${routeId} returned an unsuccessful envelope`);
  const expected = requireObject(acceptance?.apiExpectations, 'Projectile API expectations');
  if (routeId === 'public-projectiles' || routeId === 'admin-projectiles') {
    if (!Array.isArray(body.data) || !body.pagination
        || Number(body.pagination.total) !== expected.totalRecords
        || body.data.length !== expected.pageOne.length) {
      throw new Error(`Projectile API ${routeId} count differs from the isolated database readback`);
    }
    for (const [index, row] of body.data.entries()) {
      const sample = expected.pageOne[index];
      if (Number(row.id) !== sample.id || Number(row.sourceId) !== sample.sourceId
          || String(row.internalName ?? '') !== sample.internalName) {
        throw new Error(`Projectile API ${routeId} stable identity differs from the isolated database readback`);
      }
    }
    return { recordCount: Number(body.pagination.total), pageRowsVerified: body.data.length };
  }
  if (routeId === 'admin-projectile-detail') {
    const row = requireObject(body.data, 'Projectile admin detail');
    if (Number(row.id) !== expected.detail.id || Number(row.sourceId) !== expected.detail.sourceId
        || String(row.internalName ?? '') !== expected.detail.internalName) {
      throw new Error('Projectile admin detail stable identity differs from the isolated database readback');
    }
    return { id: Number(row.id), sourceId: Number(row.sourceId), identityVerified: true };
  }
  throw new Error(`Projectile API response validator has no registered route: ${routeId}`);
}

export function validateProjectileApiReadbackResult(value) {
  const expectedRouteIds = ['public-projectiles', 'admin-projectiles', 'admin-projectile-detail'];
  if (!Array.isArray(value) || value.length !== expectedRouteIds.length
      || value.some((route, index) => route?.routeId !== expectedRouteIds[index] || route.status !== 200)) {
    throw new Error('Projectile API readback must contain the three registered HTTP 200 routes');
  }
  return value;
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
    try { return JSON.parse(line); } catch (error) { throw new Error(`${label} returned malformed JSON`, { cause: error }); }
  });
}

function jsonObjectSelect(columns, table, predicate = '1=1', orderBy = 'source_id') {
  const projection = columns.flatMap((column) => [`'${column}'`, `\`${requireSafeIdentifier(column, 'column')}\``]).join(', ');
  return `SELECT JSON_OBJECT(${projection}) FROM \`${requireSafeIdentifier(table, 'table')}\` WHERE ${predicate} ORDER BY \`${requireSafeIdentifier(orderBy, 'order column')}\``;
}

async function readFormalRows(readonlyClient, database, table, columns, predicate = '1=1', orderBy = 'source_id') {
  return parseJsonRows(await readonlyClient.query(jsonObjectSelect(columns, table, predicate, orderBy), database), `${database}.${table}`);
}

function assertExpectedRelationInventory(evidence) {
  const counts = evidence.counts;
  const unresolvedIds = evidence.unresolvedItemSamples.map((row) => Number(row.projectileSourceId)).sort((a, b) => a - b);
  if (evidence.sourceInventory.itemRowsWithExplicitProjectileField !== 726
      || counts.itemExplicitAuditCount !== 726
      || counts.itemRelationCount !== 720
      || counts.unresolvedItemRelationCount !== 6
      || evidence.dependencies.itemSourceIds.length !== 726
      || evidence.sourceInventory.maintainedNpcRows !== 762
      || counts.npcExplicitAuditCount !== 0
      || counts.npcRelationCount !== 0
      || counts.unresolvedNpcRelationCount !== 0
      || JSON.stringify(unresolvedIds) !== JSON.stringify(UNRESOLVED_PROJECTILE_IDS)) {
    throw new Error(`Projectile formal relation inventory drifted from the bound baseline: ${JSON.stringify(counts)}`);
  }
}

function buildPriorSourceIdentity(report) {
  const source = requireObject(report?.source, 'prior Projectile source manifest source');
  const raw = requireObject(report?.raw, 'prior Projectile source manifest raw response');
  if (report.domainId !== 'projectiles' || source.sourceKind !== 'module'
      || raw.pageTitle !== 'Module:Projectileinfo/data' || Number(raw.pageId) !== 18025
      || raw.revisionTimestamp !== '2026-03-14T09:34:58Z'
      || typeof raw.moduleContent !== 'string' || !raw.moduleContent.length) {
    throw new Error('prior Projectile source report does not bind the expected Wiki module identity');
  }
  return Object.freeze({
    sourceKey: PROJECTILE_SOURCE_KEY,
    pageId: Number(raw.pageId),
    revisionId: raw.revisionId == null ? null : Number(raw.revisionId),
    revisionTimestamp: raw.revisionTimestamp,
    moduleContentSha256: hashBytes(Buffer.from(raw.moduleContent, 'utf8')),
    priorReportSourceContentHash: source.contentHash ?? null,
  });
}

function assertExecutionSourceMode(executionManifest, binding) {
  const source = requireObject(executionManifest?.sourceModes?.projectiles, 'Projectile execution source allocation');
  if (source.mode !== 'repository-frozen'
      || source.source !== `${STANDARDIZED_PATH} + ${VIEW_META_PATH}`
      || source.recordCount !== REQUIRED_PROJECTILE_COUNT
      || binding.recordCount !== source.recordCount) {
    throw new Error('Projectile local source differs from the fixed execution-manifest source allocation');
  }
}

function readProcessStartIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  return stat.slice(close + 2).trim().split(/\s+/)[19] ?? '';
}

function redisCommand({ host, port, password }, database, ...commands) {
  const output = execFileSync('redis-cli', ['--raw', '-h', host, '-p', String(port), '-n', String(database), ...commands.map(String)], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, REDISCLI_AUTH: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.trim();
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

export function refreshProjectileApiReadbackPreflight({ allocation, evidence } = {}) {
  const target = requireObject(allocation, 'Projectile allocation');
  const current = requireObject(evidence, 'Projectile API readback preflight evidence');
  const expectedSchemas = ['local', 'maint', 'relation'].map((role) => target.mysql?.databases?.[role]).sort();
  const observedSchemas = [...(current.mysql?.databases ?? [])].sort();
  if (current.status !== 'ready'
      || current.mysql?.serverUuid !== target.mysql?.serverUuid
      || JSON.stringify(observedSchemas) !== JSON.stringify(expectedSchemas)
      || current.redis?.host !== target.redis?.host
      || Number(current.redis?.port) !== Number(target.redis?.port)
      || Number(current.redis?.logicalDb) !== Number(target.redis?.logicalDb)
      || current.redis?.ping !== 'PONG'
      || current.api?.host !== target.api?.host
      || Number(current.api?.port) !== Number(target.api?.port)
      || current.api?.listening !== true) {
    throw new Error('Projectile API readback preflight does not match the live MySQL, Redis, and API allocation');
  }
  const checkedAt = Date.parse(String(current.checkedAt ?? ''));
  if (!Number.isFinite(checkedAt) || checkedAt > Date.now() || Date.now() - checkedAt > 120_000) {
    throw new Error('Projectile API readback preflight evidence is stale');
  }
  target.preflight = { status: 'ready', observedAt: new Date(checkedAt).toISOString() };
  return target;
}

async function assertPortListening(host, port) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => socket.destroy(new Error('API listener probe timed out')), 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function runProjectileApiReadbackPreflight({ allocation, mysql, credentials, redisPassword } = {}) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    connectTimeout: 3000,
  });
  let serverUuid;
  let databases;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const prefix = `terria_v1_automation_acceptance_${allocation.runKey}_`;
    const [rows] = await connection.query(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE ? ORDER BY schema_name',
      [`${prefix}%`],
    );
    serverUuid = server.serverUuid ?? server.SERVER_UUID;
    databases = rows.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
  const ping = redisCommand({
    host: allocation.redis.host,
    port: allocation.redis.port,
    password: redisPassword,
  }, allocation.redis.logicalDb, 'PING');
  await assertPortListening(allocation.api.host, allocation.api.port);
  return refreshProjectileApiReadbackPreflight({
    allocation,
    evidence: {
      status: 'ready',
      checkedAt: new Date().toISOString(),
      mysql: { serverUuid, databases },
      redis: {
        host: allocation.redis.host,
        port: allocation.redis.port,
        logicalDb: allocation.redis.logicalDb,
        ping,
      },
      api: { host: allocation.api.host, port: allocation.api.port, listening: true },
    },
  });
}

async function captureFormalFingerprints(mysql, credentials) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    connectTimeout: 3000,
    dateStrings: true,
  });
  const fingerprints = {};
  try {
    await connection.query('START TRANSACTION READ ONLY');
    for (const [database, table] of FORMAL_FINGERPRINT_TABLES) {
      const db = requireSafeIdentifier(database, 'formal schema');
      const name = requireSafeIdentifier(table, 'formal table');
      const [[exists]] = await connection.query(
        'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=? AND table_name=? AND table_type=\'BASE TABLE\'',
        [db, name],
      );
      if (Number(exists.total) !== 1) throw new Error(`formal fingerprint table is missing: ${db}.${name}`);
      const [rows] = await connection.query(`SELECT * FROM \`${db}\`.\`${name}\``);
      const canonicalRows = rows.map((row) => JSON.stringify(canonicalValue(row))).sort();
      fingerprints[`${db}.${name}`] = { rowCount: rows.length, sha256: hashBytes(Buffer.from(JSON.stringify(canonicalRows), 'utf8')) };
    }
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
  return Object.freeze(fingerprints);
}

async function runReadOnlyPreflight({ executionManifest, allocation, config, redisPassword, mysql } = {}) {
  const credentials = {
    host: config.database.host,
    port: Number(config.database.port),
    username: config.database.username,
    password: config.database.password,
  };
  if (credentials.host !== '127.0.0.1' || credentials.port !== allocation.mysql.port) {
    throw new Error('Projectile MySQL endpoint differs from the fixed allocation');
  }
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    connectTimeout: 3000,
    dateStrings: true,
  });
  let dbFacts;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const [formal] = await connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (?,?,?,?) ORDER BY schema_name', [
      ...executionManifest.mysql.formalDatabases,
      ...executionManifest.mysql.historicalDatabases,
    ]);
    const liveNames = buildLiveResourceNames({ profile: 't1', runKey: allocation.runKey });
    const expectedAccounts = [
      liveNames.accounts.provisioner,
      liveNames.accounts.readonly,
      liveNames.isolatedApiAccounts.apiReadonly,
      liveNames.isolatedApiAccounts.apiV2Test,
    ];
    const [accountRows] = await connection.query(
      `SELECT User AS userName FROM mysql.user WHERE User IN (${expectedAccounts.map(() => '?').join(',')}) ORDER BY User`,
      expectedAccounts,
    );
    dbFacts = {
      serverUuid: server.serverUuid ?? server.SERVER_UUID,
      automationSchemas: schemas.map((row) => row.schema_name ?? row.SCHEMA_NAME),
      formalSchemas: formal.map((row) => row.schema_name ?? row.SCHEMA_NAME),
      existingRunOwnedAccounts: accountRows.map((row) => row.userName ?? row.User),
    };
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
  const expectedFormal = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases].sort();
  if (dbFacts.serverUuid !== allocation.mysql.serverUuid || dbFacts.automationSchemas.length !== 0
      || JSON.stringify(dbFacts.formalSchemas) !== JSON.stringify(expectedFormal)
      || dbFacts.existingRunOwnedAccounts.length !== 0) {
    throw new Error('Projectile MySQL UUID, schema inventory, or run-owned account preflight failed');
  }

  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisSizes = {};
  for (let logicalDb = 1; logicalDb <= 8; logicalDb += 1) {
    redisSizes[logicalDb] = Number(redisCommand(redis, logicalDb, 'DBSIZE'));
  }
  const ping = redisCommand(redis, allocation.redis.logicalDb, 'PING');
  const appendOnly = redisCommand(redis, allocation.redis.logicalDb, 'CONFIG', 'GET', 'appendonly');
  const redisLeasePath = path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json');
  const redisLease = readJsonFile(path.relative(ROOT, redisLeasePath), 'Projectile Redis resource lease').value;
  if (ping !== 'PONG' || Object.values(redisSizes).some((size) => size !== 0)
      || !/^appendonly\s+no$/im.test(appendOnly)
      || redisLease.status !== 'ready' || redisLease.host !== allocation.redis.host || redisLease.port !== allocation.redis.port
      || redisLease.binarySha256 !== allocation.redis.binarySha256
      || readProcessStartIdentity(Number(redisLease.pid)) !== String(redisLease.processStartIdentity)) {
    throw new Error('Projectile Redis preflight requires the bound live process and empty allocated DBs');
  }

  await assertPortFree(allocation.api.host, allocation.api.port);
  const expectedJar = executionManifest.installation?.backendJarSha256;
  const jar = readOrdinaryFile(API_JAR_PATH, 'Projectile run-owned API JAR');
  const jarSha256 = hashBytes(jar.bytes);
  if (!HASH.test(expectedJar ?? '')) throw new Error('Projectile installed artifact manifest has no valid backend JAR hash');
  const processLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const writerPattern = /(?:fetch-wiki-(?:item|npc|projectile)|item-pages.*(?:crawl|refresh)|npc.*(?:crawl|refresh|acceptance)|(?:run|start).*automation.*(?:sweep|worker))/i;
  const activeWriters = processLines.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return pid !== process.pid && writerPattern.test(line);
  });
  if (activeWriters.length > 0) throw new Error('an active Item/NPC/Projectile crawler or automation writer conflicts with the Projectile run');

  return Object.freeze({
    status: 'ready',
    checkedAt: new Date().toISOString(),
    mysql: {
      serverUuid: dbFacts.serverUuid,
      formalSchemas: dbFacts.formalSchemas,
      automationSchemaCount: 0,
      existingRunOwnedAccounts: dbFacts.existingRunOwnedAccounts.length,
      readOnlyTransaction: true,
    },
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, databaseSizes: redisSizes, ping, appendOnly: false },
    api: { host: allocation.api.host, port: allocation.api.port, free: true },
    activeCrawlerWriters: 0,
    jarSha256,
    installedJarManifestSha256: expectedJar,
    installedJarManifestMatch: jarSha256 === expectedJar,
    formalDatabaseWrites: false,
    schemaOrAccountWrites: false,
  });
}

function snapshotRowHash(rows) {
  const canonicalRows = rows.map((row) => JSON.stringify(canonicalValue(row))).sort();
  return { rowCount: rows.length, sha256: hashBytes(Buffer.from(JSON.stringify(canonicalRows), 'utf8')) };
}

async function captureRunSchemaSnapshots(connection, databases) {
  const snapshots = {};
  for (const role of ['local', 'maint', 'relation']) {
    const database = requireSafeIdentifier(databases[role], `${role} target database`);
    const [tableRows] = await connection.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_type=\'BASE TABLE\' ORDER BY table_name',
      [database],
    );
    snapshots[role] = {};
    for (const tableRow of tableRows) {
      const table = requireSafeIdentifier(tableRow.table_name ?? tableRow.TABLE_NAME, `${role} table`);
      if (table === '__automation_acceptance_probe') continue;
      const [rows] = await connection.query(`SELECT * FROM \`${database}\`.\`${table}\``);
      snapshots[role][table] = snapshotRowHash(rows);
    }
  }
  return snapshots;
}

function changedSchemaTables(before, after) {
  const changes = [];
  for (const role of ['local', 'maint', 'relation']) {
    const names = new Set([...Object.keys(before[role] ?? {}), ...Object.keys(after[role] ?? {})]);
    for (const table of [...names].sort()) {
      if (JSON.stringify(before[role]?.[table] ?? null) !== JSON.stringify(after[role]?.[table] ?? null)) {
        changes.push(`${role}.${table}`);
      }
    }
  }
  return changes;
}

function assertOwnedTableMutations(changes) {
  const unexpected = changes.filter((entry) => {
    const [role, table] = entry.split('.');
    return !MUTABLE_TABLES[role]?.has(table);
  });
  if (unexpected.length > 0) throw new Error(`Projectile T1 wrote outside its declared table set: ${unexpected.join(', ')}`);
}

function compareIdentityRows(actualRows, expectedRows, { idColumn = 'source_id', nameColumn = 'internal_name', expectedId = (row) => row.id, expectedName = (row) => row.internalName, label } = {}) {
  if (actualRows.length !== expectedRows.length) throw new Error(`${label} identity count mismatch: expected=${expectedRows.length}, actual=${actualRows.length}`);
  const expected = new Map(expectedRows.map((row) => [Number(expectedId(row)), String(expectedName(row)).toLowerCase()]));
  for (const row of actualRows) {
    const id = Number(row[idColumn]);
    if (expected.get(id) !== String(row[nameColumn] ?? '').toLowerCase()) throw new Error(`${label} stable identity mismatch at source ID ${id}`);
  }
}

function compareRelationRows(actualRows, expectedRelations) {
  const expected = expectedRelations
    .filter((row) => row.sourceKind === 'item')
    .map((row) => ({ itemSourceId: Number(row.sourceId), projectileSourceId: Number(row.projectileSourceId), sourceField: row.sourceField }))
    .sort((left, right) => left.itemSourceId - right.itemSourceId || left.projectileSourceId - right.projectileSourceId);
  const actual = actualRows.map((row) => ({
    itemSourceId: Number(row.item_source_id),
    projectileSourceId: Number(row.projectile_source_id),
    sourceField: String(row.source_field),
  })).sort((left, right) => left.itemSourceId - right.itemSourceId || left.projectileSourceId - right.projectileSourceId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('isolated Item-to-Projectile relation rows differ from explicit source evidence');
  return { count: actual.length, sha256: hashJson(actual) };
}

function assertUnresolvedAudits(actualRows, expectedTargets) {
  const unresolved = actualRows.filter((row) => row.audit_status === 'projectile_missing')
    .map((row) => Number(row.projectile_source_id)).sort((a, b) => a - b);
  if (JSON.stringify(unresolved) !== JSON.stringify([...expectedTargets].sort((a, b) => a - b))) {
    throw new Error('isolated unresolved Projectile audit target IDs differ from the source manifest');
  }
  return { totalAuditRows: actualRows.length, unresolvedCount: unresolved.length, unresolvedProjectileIds: unresolved };
}

export function buildProjectileRelationReadback({
  itemRelationRows,
  itemAuditRows,
  npcRelationRows,
  npcAuditRows,
  explicitRelations,
  unresolvedProjectileIds,
} = {}) {
  for (const [value, label] of [
    [itemRelationRows, 'Item Projectile relations'],
    [itemAuditRows, 'Item Projectile audits'],
    [npcRelationRows, 'NPC Projectile relations'],
    [npcAuditRows, 'NPC Projectile audits'],
    [explicitRelations, 'explicit source relations'],
    [unresolvedProjectileIds, 'unresolved Projectile IDs'],
  ]) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  }
  if (npcRelationRows.length !== 0 || npcAuditRows.length !== 0) {
    throw new Error('Projectile isolated NPC relation coverage must remain zero');
  }
  const itemRelations = compareRelationRows(itemRelationRows, explicitRelations);
  const itemAudits = assertUnresolvedAudits(itemAuditRows, unresolvedProjectileIds);
  if (itemAuditRows.length !== itemRelations.count + itemAudits.unresolvedCount) {
    throw new Error('isolated Item Projectile audit count differs from resolved relations plus unresolved targets');
  }
  return Object.freeze({
    itemRelations: Object.freeze(itemRelations),
    itemAudits: Object.freeze(itemAudits),
    npcRelationCount: npcRelationRows.length,
    npcAuditCount: npcAuditRows.length,
  });
}

async function runProjectileMaintainedChain(context, { source, landingEntry, relationState, privateDirectory, config, allocation, redisPassword } = {}) {
  const mysql = loadMysqlModule({ repoRoot: ROOT });
  const sql = {
    host: context.mysql.host,
    port: Number(context.mysql.port),
    user: context.mysql.username,
    password: context.mysql.password,
  };
  if (!sql.user || !sql.password || !context.dependencySeedEvidence?.readbackVerified) {
    throw new Error('Projectile chain requires a verified exact-key dependency seed and run-owned MySQL account');
  }
  const databases = context.databases;
  const connection = await mysql.createConnection({ ...sql, database: databases.local, multipleStatements: false, dateStrings: true });
  let beforeSnapshots;
  try {
    const [[localCount]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${databases.local}\`.projectiles`);
    const [[maintCount]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${databases.maint}\`.maint_projectiles`);
    const [[relationCount]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${databases.relation}\`.relation_projectiles`);
    if (Number(localCount.total) !== 0 || Number(maintCount.total) !== 0 || Number(relationCount.total) !== 0) {
      throw new Error('Projectile run-derived owned tables must be empty before business ingestion');
    }
    beforeSnapshots = await captureRunSchemaSnapshots(connection, databases);
  } finally {
    await connection.end();
  }

  const landingSummary = await runLandingImport({
    apply: true,
    reportPath: null,
    repoRoot: ROOT,
    db: { ...sql, database: databases.local },
  }, {
    mysqlModule: mysql,
    locateDatasetEntries: async () => [landingEntry],
    writeReport: async () => null,
  });

  const sourceConnection = await mysql.createConnection({ ...sql, database: databases.local, dateStrings: true });
  let landingRow;
  try {
    const [rows] = await sourceConnection.query(
      'SELECT id,dataset_type,provider,source_key,source_page,source_revision_timestamp,content_hash,payload_json,fetched_at,parsed_at,parse_status FROM source_dataset_landings WHERE dataset_type=? AND provider=? AND source_key=? AND source_page=? AND is_current=1 ORDER BY id',
      [landingEntry.datasetType, landingEntry.provider, landingEntry.sourceKey, landingEntry.sourcePage],
    );
    if (rows.length !== 1 || rows[0].content_hash !== landingEntry.contentHash) {
      throw new Error('Projectile source landing readback differs from the hash-bound offline source');
    }
    landingRow = rows[0];
  } finally {
    await sourceConnection.end();
  }

  const localConnection = await mysql.createConnection({ ...sql, database: databases.local, multipleStatements: false, dateStrings: true });
  const importStats = { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
  try {
    const sourceBytes = readOrdinaryFile(STANDARDIZED_PATH, 'Projectile standardized source').bytes;
    if (hashBytes(sourceBytes) !== source.localBinding.standardizedSha256) {
      throw new Error('Projectile standardized source changed after the source binding was created');
    }
    await importProjectiles(localConnection, source.records, importStats);
  } finally {
    await localConnection.end();
  }
  if (importStats.input !== REQUIRED_PROJECTILE_COUNT || importStats.created !== REQUIRED_PROJECTILE_COUNT
      || importStats.updated !== 0 || importStats.skipped !== 0 || importStats.errors.length !== 0) {
    throw new Error(`Projectile local import mismatch: ${JSON.stringify(importStats)}`);
  }

  const zhSourceIndexes = {
    projectilesByInternalName: new Map(source.records.map((record) => [String(record.internalName).toLowerCase(), {
      nameZh: record.localized?.zh?.name ?? record.nameZh ?? null,
      imageUrl: record.imageUrl ?? record.image_url ?? record.image ?? null,
    }])),
  };
  const maintConfig = { database: { ...sql, username: sql.user, name: databases.maint } };
  const normalizedLanding = {
    ...landingRow,
    source_revision_timestamp: landingRow.source_revision_timestamp,
    content_hash: landingRow.content_hash,
    payload_json: landingRow.payload_json,
  };
  const maintSync = await runMaintSync({
    apply: true,
    scopes: ['projectiles'],
    host: sql.host,
    port: sql.port,
    user: sql.user,
    password: sql.password,
    database: databases.maint,
    reportPath: null,
  }, {
    mysqlModule: mysql,
    config: maintConfig,
    zhSourceIndexes,
    loadLandingRows: async () => [normalizedLanding],
    writeReport: async () => null,
  });
  const maintWrites = Number(maintSync?.writes?.inserted ?? 0) + Number(maintSync?.writes?.updated ?? 0);
  if (maintWrites !== REQUIRED_PROJECTILE_COUNT) throw new Error(`Projectile maint sync wrote ${maintWrites} rows`);

  const relationReportPaths = Object.fromEntries([
    ['auditJsonPath', 'projectile-relation-audit.json'],
    ['auditMdPath', 'projectile-relation-audit.md'],
    ['conflictsPath', 'projectile-relation-conflicts.json'],
    ['unresolvedPath', 'projectile-relation-unresolved.json'],
  ].map(([key, name]) => [key, path.join(privateDirectory, name)]));
  const relationSync = await runSync({
    apply: true,
    createDatabase: false,
    maintDatabase: databases.maint,
    localDatabase: databases.local,
    relationDatabase: databases.relation,
    allowLocalItemImageFallback: false,
    scopes: ['projectile'],
  }, {
    config: { database: { host: sql.host, port: sql.port, username: sql.user, password: sql.password } },
    writeReports: async () => relationReportPaths,
  });
  const results = relationSync.results ?? {};
  if (results.relationProjectiles?.length !== REQUIRED_PROJECTILE_COUNT
      || results.projectionProjectiles?.length !== REQUIRED_PROJECTILE_COUNT
      || results.itemProjectileRelations?.length !== 720
      || results.npcProjectileRelations?.length !== 0) {
    throw new Error('Projectile relation sync result counts differ from the source-bound T1 expectations');
  }

  const readbackConnection = await mysql.createConnection({ ...sql, database: databases.local, dateStrings: true });
  let identityReadback;
  let relationReadback;
  let tableSnapshots;
  let tableChanges;
  try {
    const [localRows] = await readbackConnection.query(
      `SELECT id,source_id,internal_name,name,name_zh,image_url,ai_style,damage,knock_back,penetrate,time_left,width,height,scale,friendly,hostile,tile_collide,raw_json,status,deleted FROM \`${databases.local}\`.projectiles ORDER BY source_id`,
    );
    const [maintRows] = await readbackConnection.query(
      `SELECT source_id,internal_name,english_name,landing_source_id,landing_source_key,landing_content_hash,raw_json,status,deleted FROM \`${databases.maint}\`.maint_projectiles ORDER BY source_id`,
    );
    const [relationRows] = await readbackConnection.query(
      `SELECT source_id,internal_name,english_name,landing_source_key,landing_content_hash,raw_json,status,deleted FROM \`${databases.relation}\`.relation_projectiles ORDER BY source_id`,
    );
    const [projectionRows] = await readbackConnection.query(
      `SELECT id,source_id,internal_name,name,name_zh,source_items_json,source_npcs_json,raw_json,status,deleted FROM \`${databases.relation}\`.projection_projectiles ORDER BY source_id`,
    );
    const [dependencyRows] = await readbackConnection.query(
      `SELECT source_id,internal_name,raw_json FROM \`${databases.maint}\`.maint_items ORDER BY source_id`,
    );
    const [relationDependencyRows] = await readbackConnection.query(
      `SELECT source_id,internal_name FROM \`${databases.relation}\`.relation_items ORDER BY source_id`,
    );
    const [projectionDependencyRows] = await readbackConnection.query(
      `SELECT id,internal_name FROM \`${databases.relation}\`.projection_items ORDER BY id`,
    );
    const [itemRelationRows] = await readbackConnection.query(
      `SELECT item_source_id,projectile_source_id,source_field,source_value FROM \`${databases.relation}\`.item_projectile_relations ORDER BY item_source_id,projectile_source_id`,
    );
    const [itemAuditRows] = await readbackConnection.query(
      `SELECT item_source_id,projectile_source_id,audit_status,available_fields_json FROM \`${databases.relation}\`.item_projectile_audits ORDER BY item_source_id,projectile_source_id`,
    );
    const [npcRelationRows] = await readbackConnection.query(`SELECT npc_source_id FROM \`${databases.relation}\`.npc_projectile_relations`);
    const [npcAuditRows] = await readbackConnection.query(`SELECT npc_source_id FROM \`${databases.relation}\`.npc_projectile_audits`);
    const [projectileImageRows] = await readbackConnection.query(`SELECT * FROM \`${databases.relation}\`.relation_projectile_images ORDER BY record_key`);

    compareIdentityRows(localRows, source.records, { idColumn: 'source_id', nameColumn: 'internal_name', label: 'local Projectile' });
    compareIdentityRows(maintRows, source.records, { idColumn: 'source_id', nameColumn: 'internal_name', label: 'maint Projectile' });
    compareIdentityRows(relationRows, source.records, { idColumn: 'source_id', nameColumn: 'internal_name', label: 'relation Projectile' });
    compareIdentityRows(projectionRows, source.records, { idColumn: 'source_id', nameColumn: 'internal_name', label: 'projection Projectile' });
    if (localRows.some((row, index) => Number(row.id) !== index + 1)) {
      throw new Error('isolated Projectile local primary IDs do not match the deterministic empty-schema import order');
    }
    const expectedItemIds = relationState.dependencyManifest.dependencies
      .find((entry) => entry.id === 'projectile-explicit-item-projectile-dependencies')
      .keyValues.map((entry) => Number(entry.source_id)).sort((a, b) => a - b);
    if (dependencyRows.length !== expectedItemIds.length
        || JSON.stringify(dependencyRows.map((row) => Number(row.source_id)).sort((a, b) => a - b)) !== JSON.stringify(expectedItemIds)) {
      throw new Error('isolated maintained Item dependency identities differ from the exact source manifest');
    }
    if (relationDependencyRows.length !== expectedItemIds.length
        || JSON.stringify(relationDependencyRows.map((row) => Number(row.source_id)).sort((a, b) => a - b)) !== JSON.stringify(expectedItemIds)
        || projectionDependencyRows.length !== expectedItemIds.length
        || JSON.stringify(projectionDependencyRows.map((row) => Number(row.id)).sort((a, b) => a - b)) !== JSON.stringify(expectedItemIds)) {
      throw new Error('isolated relation/projection Item dependency identities differ from the exact source manifest');
    }
    relationReadback = buildProjectileRelationReadback({
      itemRelationRows,
      itemAuditRows,
      npcRelationRows,
      npcAuditRows,
      explicitRelations: relationState.relationEvidence.explicitRelations,
      unresolvedProjectileIds: UNRESOLVED_PROJECTILE_IDS,
    });
    if (itemAuditRows.length !== 726) {
      throw new Error('isolated Projectile audit or NPC relation coverage differs from the exact source inventory');
    }
    const [[relationRunCount]] = await readbackConnection.query(`SELECT COUNT(*) AS total FROM \`${databases.relation}\`.relation_runs`);
    const [[relationReportCount]] = await readbackConnection.query(`SELECT COUNT(*) AS total FROM \`${databases.relation}\`.relation_run_reports`);
    const [[raritySupportCount]] = await readbackConnection.query(`SELECT COUNT(*) AS total FROM \`${databases.relation}\`.relation_item_rarities`);
    if (Number(relationRunCount.total) !== 1 || Number(relationReportCount.total) !== 4 || Number(raritySupportCount.total) !== 16) {
      throw new Error('Projectile relation sync run, report, or shared rarity support rows are incomplete');
    }
    tableSnapshots = await captureRunSchemaSnapshots(readbackConnection, databases);
    tableChanges = changedSchemaTables(beforeSnapshots, tableSnapshots);
    assertOwnedTableMutations(tableChanges);
    identityReadback = {
      localProjectiles: snapshotRowHash(localRows),
      maintProjectiles: snapshotRowHash(maintRows),
      relationProjectiles: snapshotRowHash(relationRows),
      projectionProjectiles: snapshotRowHash(projectionRows),
      maintainedItemDependencies: snapshotRowHash(dependencyRows),
      relationItemDependencies: snapshotRowHash(relationDependencyRows),
      projectionItemDependencies: snapshotRowHash(projectionDependencyRows),
      itemProjectileRelations: relationReadback.itemRelations,
      itemProjectileAudits: { ...snapshotRowHash(itemAuditRows), ...relationReadback.itemAudits },
      npcProjectileRelations: { rowCount: npcRelationRows.length, sha256: hashJson(npcRelationRows) },
      npcProjectileAudits: { rowCount: npcAuditRows.length, sha256: hashJson(npcAuditRows) },
      relationProjectileImages: snapshotRowHash(projectileImageRows),
      changedTables: tableChanges,
      schemaSnapshots: tableSnapshots,
    };
  } finally {
    await readbackConnection.end();
  }
  const apiReadbackPreflight = await runProjectileApiReadbackPreflight({
    allocation,
    mysql,
    credentials: {
      host: config.database.host,
      port: Number(config.database.port),
      username: config.database.username,
      password: config.database.password,
    },
    redisPassword,
  });

  const accepted = {
    status: 'passed',
    maintainedChainStatus: 'passed',
    v2AutomaticIngestionStatus: 'blocked',
    sourceMode: source.sourceDecision.sourceMode,
    wikiUnchanged: false,
    sourceManifestSha256: relationState.sourceManifestFile.sha256,
    dependencyManifestSha256: relationState.dependencyManifestSha256,
    dependencyManifestFileSha256: relationState.dependencyFile.sha256,
    relationEvidenceSha256: relationState.relationEvidence.manifestSha256,
    landing: {
      id: Number(landingRow.id),
      sourceKey: landingRow.source_key,
      sourceRevisionTimestamp: landingRow.source_revision_timestamp,
      contentHash: `sha256:${landingRow.content_hash}`,
      summary: landingSummary,
    },
    localImport: importStats,
    maintSync: { writes: maintSync.writes, rows: maintSync.rows },
    relationSync: {
      summary: relationSync.summary,
      relationProjectiles: results.relationProjectiles.length,
      projectionProjectiles: results.projectionProjectiles.length,
      itemProjectileRelations: results.itemProjectileRelations.length,
      npcProjectileRelations: results.npcProjectileRelations.length,
      itemProjectileAudits: results.itemProjectileAudits.length,
      npcProjectileAudits: results.npcProjectileAudits.length,
    },
    relationEvidence: {
      sourceInventory: relationState.relationEvidence.sourceInventory,
      counts: relationState.relationEvidence.counts,
      unresolvedProjectileIds: relationState.relationEvidence.unresolvedItemSamples.map((row) => Number(row.projectileSourceId)).sort((a, b) => a - b),
      itemSourceIdsSha256: hashJson(relationState.relationEvidence.dependencies.itemSourceIds),
      explicitRelationsSha256: hashJson(relationState.relationEvidence.explicitRelations),
      unresolvedAudits: relationReadback.itemAudits,
    },
    dependencySeedEvidence: {
      manifestSha256: context.dependencySeedEvidence.manifestSha256,
      readbackVerified: context.dependencySeedEvidence.readbackVerified,
      dependencies: context.dependencySeedEvidence.dependencies,
    },
    identityReadback,
    apiExpectations: buildApiExpectations(source.records),
    apiReadbackPreflight,
    apiRelationReadbackStatus: 'not-exposed-by-projectile-api-route-contract',
  };
  return Object.freeze(accepted);
}

function buildFinalEvidence({ executionManifest, allocation, preflight, source, relationState, execution, formalFingerprintsBefore, formalFingerprintsAfter, cleanup } = {}) {
  const acceptance = execution.acceptance;
  const apiReadback = execution.isolatedApi?.readback;
  const apiReadbackRoutes = validateProjectileApiReadbackResult(apiReadback);
  if (execution.status !== 'passed' || execution.cleanupPassed !== true
      || acceptance?.maintainedChainStatus !== 'passed'
      || execution.isolatedApi?.stop?.cleanupVerified !== true
      || JSON.stringify(formalFingerprintsBefore) !== JSON.stringify(formalFingerprintsAfter)
      || cleanup?.derivedSchemas !== 0 || cleanup?.runOwnedAccounts !== 0
      || cleanup?.redisDatabaseSizes?.some((size) => size !== 0) || cleanup?.apiPortFree !== true) {
    throw new Error('Projectile isolated T1 cleanup, formal no-write, or API readback evidence is incomplete');
  }
  return Object.freeze({
    schemaVersion: 1,
    operation: 'eight-domain-projectiles-isolated-t1-full-local-offline',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    domain: 'projectiles',
    runId: allocation.runId,
    runKey: allocation.runKey,
    sourceMode: source.sourceDecision.sourceMode,
    wikiUnchanged: false,
    sourceIdentity: source.sourceIdentity,
    localSourceBinding: {
      sourceKey: source.localBinding.sourceKey,
      recordCount: source.localBinding.recordCount,
      stableIdCount: source.localBinding.stableIdCount,
      standardizedPath: source.localBinding.standardizedPath,
      standardizedSha256: source.localBinding.standardizedSha256,
      viewMetaPath: source.localBinding.viewMetaPath,
      viewMetaSha256: source.localBinding.viewMetaSha256,
      stableIdsSha256: source.localBinding.stableIdsSha256,
      sourceManifestContentHash: source.localBinding.sourceManifestContentHash,
    },
    sourceReport: {
      path: PRIOR_SOURCE_REPORT_PATH,
      reportSha256: source.priorSourceReportSha256,
      moduleContentSha256: source.sourceIdentity.moduleContentSha256,
      reportDeclaredContentHash: source.sourceIdentity.priorReportSourceContentHash,
    },
    offlineSourceDecision: source.sourceDecision,
    relationEvidenceSha256: relationState.relationEvidence.manifestSha256,
    dependencyManifestSha256: relationState.dependencyManifestSha256,
    dependencyManifestFileSha256: relationState.dependencyFile.sha256,
    preflight,
    resources: {
      mysql: { host: allocation.mysql.host, port: allocation.mysql.port, serverUuid: allocation.mysql.serverUuid },
      redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb },
      databases: allocation.mysql.databases,
    },
    acceptance,
    apiReadback: {
      routeResults: apiReadbackRoutes,
      apiEntityIdentityStatus: 'passed',
      relationParityStatus: acceptance.apiRelationReadbackStatus,
    },
    formalFingerprints: {
      unchanged: true,
      before: formalFingerprintsBefore,
      after: formalFingerprintsAfter,
    },
    cleanup: {
      passed: execution.cleanupPassed,
      derivedSchemas: cleanup.derivedSchemas,
      runOwnedAccounts: cleanup.runOwnedAccounts,
      redisDatabaseSizes: cleanup.redisDatabaseSizes,
      apiPortFree: cleanup.apiPortFree,
      apiStop: execution.isolatedApi.stop,
    },
    formalDatabaseWrites: false,
    databaseWritesToFormalRuntime: false,
    schemaOrAccountWrites: true,
    v2AutomaticIngestionStatus: 'blocked',
  });
}

async function verifyPostRunCleanup(mysql, credentials, allocation, redisPassword, runKey) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.username,
    password: credentials.password,
    database: 'terria_v1_local',
    connectTimeout: 3000,
  });
  let derivedSchemas;
  let runOwnedAccounts;
  try {
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%'");
    derivedSchemas = schemas.length;
    const accounts = buildLiveResourceNames({ profile: 't1', runKey });
    const names = [accounts.accounts.provisioner, accounts.accounts.readonly, accounts.isolatedApiAccounts.apiReadonly, accounts.isolatedApiAccounts.apiV2Test];
    const [users] = await connection.query(`SELECT User AS userName FROM mysql.user WHERE User IN (${names.map(() => '?').join(',')})`, names);
    runOwnedAccounts = users.length;
  } finally {
    await connection.end();
  }
  const redis = { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword };
  const redisDatabaseSizes = [];
  for (let logicalDb = 1; logicalDb <= 8; logicalDb += 1) redisDatabaseSizes.push(Number(redisCommand(redis, logicalDb, 'DBSIZE')));
  let apiPortFree = true;
  try { await assertPortFree(allocation.api.host, allocation.api.port); } catch { apiPortFree = false; }
  return Object.freeze({ derivedSchemas, runOwnedAccounts, redisDatabaseSizes, apiPortFree });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.run !== 'true') throw new Error('run this Projectiles T1 operation explicitly with --run=true');
  if (process.versions.node !== '22.23.0') throw new Error('Projectiles isolated full T1 run requires pinned Node 22.23.0');
  assertRepositoryFrozenSourcePaths();

  const executionFile = readJsonFile(EXECUTION_MANIFEST_PATH, 'eight-domain execution manifest');
  const executionManifest = executionFile.value;
  const sourceFile = readJsonFile(STANDARDIZED_PATH, 'standardized Projectile source');
  const standardized = sourceFile.value;
  const priorSourceFile = readJsonFile(PRIOR_SOURCE_REPORT_PATH, 'prior Projectile source report');
  const sourceIdentity = buildPriorSourceIdentity(priorSourceFile.value);
  const wikiManifestRecord = {
    sourceKey: sourceIdentity.sourceKey,
    pageId: sourceIdentity.pageId,
    revisionId: sourceIdentity.revisionId,
    revisionTimestamp: sourceIdentity.revisionTimestamp,
    contentHash: sourceIdentity.moduleContentSha256,
  };
  const localBinding = buildLocalProjectileSourceBinding({
    standardizedPath: STANDARDIZED_PATH,
    viewMetaPath: VIEW_META_PATH,
    wikiManifestRecord,
  });
  assertExecutionSourceMode(executionManifest, localBinding);
  const viewEvidence = assertViewPartsMatch(standardized, localBinding);
  const sortedRecords = [...standardized.records].sort((left, right) => Number(left.id) - Number(right.id));
  const source = Object.freeze({
    standardized: Object.freeze({ ...standardized, records: sortedRecords }),
    records: Object.freeze(sortedRecords),
    localBinding,
    sourceIdentity,
    priorSourceReportSha256: hashBytes(priorSourceFile.bytes),
  });
  const outageFile = readJsonFile(OUTAGE_EVIDENCE_PATH, 'Wiki outage evidence');
  const outage = requireObject(outageFile.value, 'Wiki outage evidence');
  const sourceDecision = buildProjectileOfflineSourceDecision({
    localBinding,
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: outage.status,
      actionId: outage.actionId,
      phase: outage.phase,
      artifactPath: OUTAGE_EVIDENCE_PATH,
      artifactSha256: hashBytes(outageFile.bytes),
      reason: outage.reason,
    },
  });
  const sourceWithDecision = Object.freeze({ ...source, sourceDecision });
  const landingEntry = buildProjectileLandingEntry({
    standardized: source.standardized,
    localBinding,
    sourceIdentity,
  });

  const config = loadLocalStackConfig(ROOT);
  const mysqlModule = loadMysqlModule({ repoRoot: ROOT });
  const privateRoot = path.join(ROOT, PRIVATE_ROOT, 'projectiles');
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  const registry = openDurableRunKeyRegistry(path.join(privateRoot, 'run-key-mappings.json'));
  const plan = buildEightDomainAllocationPlan({
    manifest: executionManifest,
    domain: 'projectiles',
    repoRoot: ROOT,
    runKeyRegistry: registry,
  });
  const redisPassword = readPrivateText(`${PRIVATE_ROOT}/redis/redis.auth`, 'Projectile Redis auth secret');
  const mysql = {
    host: config.database.host,
    port: Number(config.database.port),
    username: config.database.username,
    password: config.database.password,
  };
  const redis = {
    host: plan.redis.host,
    port: plan.redis.port,
    logicalDb: plan.redis.logicalDb,
    password: redisPassword,
  };
  const preflight = await runReadOnlyPreflight({
    executionManifest,
    allocation: plan,
    config,
    redisPassword,
    mysql: mysqlModule,
  });
  if (args['preflight-only'] === 'true') {
    process.stdout.write(`${JSON.stringify({
      status: 'preflight-passed',
      domain: 'projectiles',
      runId: plan.runId,
      runKey: plan.runKey,
      sourceMode: sourceDecision.sourceMode,
      wikiUnchanged: false,
      preflight,
    }, null, 2)}\n`);
    return;
  }
  const allocation = { ...plan, preflight: { status: 'ready', observedAt: preflight.checkedAt } };
  const formalFingerprintsBefore = await captureFormalFingerprints(mysqlModule, mysql);

  const attempt = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const privateDirectory = path.join(ROOT, allocation.automaticArtifactRoot, 'acceptance-runs', `projectiles-offline-${attempt}`);
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const sourceManifestPath = path.join(privateDirectory, 'projectile-source-manifest.json');
  const dependencyManifestPath = path.join(privateDirectory, 'projectile-dependency-manifest.json');
  const evidencePath = path.join(ROOT, allocation.evidenceRoot, 'isolated-real-ingestion.json');
  try {
    fs.lstatSync(evidencePath);
    throw new Error('Projectile full-source T1 evidence already exists for this fixed run key');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const relationState = {};
  const dependencyManifestFactory = async ({ databases, readonlyClient } = {}) => {
    if (JSON.stringify(['local', 'maint', 'relation'].map((role) => databases?.[role]))
        !== JSON.stringify(['local', 'maint', 'relation'].map((role) => allocation.mysql.databases[role]))) {
      throw new Error('Projectile dependency factory received different run-derived target schemas');
    }
    if (!readonlyClient || typeof readonlyClient.query !== 'function') {
      throw new Error('Projectile dependency generation requires the formal read-only snapshot account');
    }
    const itemInventory = await readFormalRows(
      readonlyClient,
      'terria_v1_maint',
      'maint_items',
      RELATION_INPUT_COLUMNS,
    );
    const npcInventory = await readFormalRows(
      readonlyClient,
      'terria_v1_maint',
      'maint_npcs',
      RELATION_INPUT_COLUMNS,
    );
    const relationEvidence = buildProjectileSourceRelationEvidence({
      projectiles: source.records,
      itemRows: itemInventory,
      npcRows: npcInventory,
    });
    assertExpectedRelationInventory(relationEvidence);
    const itemIds = relationEvidence.dependencies.itemSourceIds;
    const exactItemRows = await readFormalRows(
      readonlyClient,
      'terria_v1_maint',
      'maint_items',
      PROJECTILE_MAINT_ITEM_COLUMNS,
      `\`source_id\` IN (${itemIds.map((id) => Number(id)).join(',')})`,
    );
    if (exactItemRows.length !== itemIds.length) throw new Error('Projectile exact Item dependency source readback is incomplete');
    const dependencyManifest = buildProjectileDependencyManifest({
      runId: allocation.runId,
      runKey: allocation.runKey,
      databases,
      itemRows: exactItemRows,
      relationSourceIds: itemIds,
    });
    const dependencyHash = dependencyManifestSha256(dependencyManifest);
    const sourceManifest = buildProjectileOfflineSourceManifest({
      runId: allocation.runId,
      runKey: allocation.runKey,
      source: sourceWithDecision,
      viewEvidence,
      relationEvidence,
      dependencyManifestSha256: dependencyHash,
    });
    relationState.relationEvidence = relationEvidence;
    relationState.dependencyManifest = dependencyManifest;
    relationState.dependencyManifestSha256 = dependencyHash;
    relationState.sourceManifestFile = writePrivateJson(sourceManifestPath, sourceManifest, 'Projectile source manifest');
    relationState.dependencyFile = writePrivateJson(dependencyManifestPath, dependencyManifest, 'Projectile dependency manifest');
    return dependencyManifest;
  };

  const result = await runLiveAutomationAcceptance({
    profile: 't1',
    runId: allocation.runId,
    mysql,
    redis,
    privateDirectory,
    maxRowsPerTable: 2,
    scope: 'projectile-canonical',
    acceptanceExecutor: (context) => runProjectileMaintainedChain(context, {
      source: sourceWithDecision,
      landingEntry,
      relationState,
      privateDirectory,
      config,
      allocation,
      redisPassword,
    }),
    dependencyManifestFactory,
    isolatedAllocation: allocation,
    isolatedApiLifecycleFactory: async ({ manifest, adapter } = {}) => {
      if (!relationState.sourceManifestFile) throw new Error('Projectile API startup requires the bound source-relation manifest');
      const apiCredentials = buildRunOwnedApiCredentials({
        mysql: { host: mysql.host, port: Number(mysql.port) },
        apiAccount: adapter.apiAccounts.apiReadonly,
        redisPassword,
        runKey: allocation.runKey,
      });
      return buildIsolatedApiLifecycle({
        allocation,
        mode: 'consumer-readback',
        credentials: apiCredentials,
        migrationEvidence: manifest.migrationEvidence,
        routes: buildProjectileApiRoutes(),
        sourceManifestPath,
        sourceStatePath: sourceManifestPath,
        validateResponse: validateProjectileApiResponse,
      });
    },
  });

  const formalFingerprintsAfter = await captureFormalFingerprints(mysqlModule, mysql);
  if (JSON.stringify(formalFingerprintsBefore) !== JSON.stringify(formalFingerprintsAfter)) {
    throw new Error('formal database fingerprints changed during the Projectile isolated T1 run');
  }
  const cleanup = await verifyPostRunCleanup(mysqlModule, mysql, allocation, redisPassword, allocation.runKey);
  const evidence = buildFinalEvidence({
    executionManifest,
    allocation,
    preflight,
    source: { ...sourceWithDecision, priorSourceReportSha256: source.priorSourceReportSha256 },
    relationState,
    execution: result,
    formalFingerprintsBefore,
    formalFingerprintsAfter,
    cleanup,
  });
  const reportSha256 = writePublicJson(evidencePath, evidence);
  process.stdout.write(`${JSON.stringify({
    status: evidence.status,
    domain: evidence.domain,
    sourceMode: evidence.sourceMode,
    recordCount: evidence.localSourceBinding.recordCount,
    itemProjectileRelations: evidence.acceptance.relationSync.itemProjectileRelations,
    unresolvedProjectileIds: evidence.acceptance.relationEvidence.unresolvedProjectileIds,
    npcProjectileRelations: evidence.acceptance.relationSync.npcProjectileRelations,
    apiEntityIdentityStatus: evidence.apiReadback.apiEntityIdentityStatus,
    apiRelationParityStatus: evidence.apiReadback.relationParityStatus,
    cleanupPassed: evidence.cleanup.passed,
    evidencePath: path.relative(ROOT, evidencePath).replaceAll('\\', '/'),
    evidenceSha256: reportSha256,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
