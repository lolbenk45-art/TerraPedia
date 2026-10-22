#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { runLiveAutomationAcceptance, buildIsolatedApiLifecycle, buildRunOwnedApiCredentials, buildLiveResourceNames } from '../automation/run-live-automation-acceptance.mjs';
import { buildEightDomainAllocationPlan } from '../automation/eight-domain-isolated-allocation.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import { buildDependencyManifest, buildDependencySelectSql, dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runSync } from '../relation/sync-maint-to-relation.mjs';
import { resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';
import { buildArmorLocalSourceManifest } from './armor-canonical-t1-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const DOMAIN = 'armor_sets';
const RUN_ID = 'e8pr-armor_sets-20261017-v1';
const RUN_KEY = 'e8p_c53071f9272a09c4';
const mysql = createRequire(path.join(ROOT, 'apps/admin-console', 'package.json'))('mysql2/promise');

const LOCAL_ITEM_COLUMNS = Object.freeze([
  'id', 'name', 'name_zh', 'internal_name', 'image', 'category_id', 'description', 'damage', 'defense',
  'knockback', 'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'rarity_id', 'game_period_id',
  'game_model_id', 'is_stackable', 'stack_size', 'status', 'deleted',
]);
const MAINT_ITEM_COLUMNS = Object.freeze([
  'id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page',
  'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
  'landing_content_hash', 'module_generated_at', 'terraria_version', 'major_value', 'combat_value',
  'defense_value', 'use_time', 'stack_size', 'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted',
]);

function hashBytes(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function hashRows(rows) { return hashBytes(Buffer.from(JSON.stringify(rows.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))))); }
function stablePositiveBigIntId(value) {
  const text = String(value ?? '').trim();
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}
function databaseCredentials(config) {
  return {
    host: config.database.host,
    port: Number(config.database.port),
    user: config.database.username,
    password: config.database.password,
  };
}
function writeJson(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.chmodSync(filePath, mode);
}
function parseEnvFile(filePath) {
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}
function redisSize(port, password, logicalDb) {
  return Number(execFileSync('redis-cli', ['--raw', '-h', '127.0.0.1', '-p', String(port), '-n', String(logicalDb), 'DBSIZE'], {
    encoding: 'utf8', env: { ...process.env, REDISCLI_AUTH: password },
  }).trim());
}
function isPortFree(host, port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve(true)));
  });
}
function listMinioObjects(bucket, prefix, credentials) {
  const encoded = `${encodeURIComponent(credentials.MINIO_ROOT_USER)}:${encodeURIComponent(credentials.MINIO_ROOT_PASSWORD)}`;
  const output = execFileSync('/home/lolben/.local/bin/mc', ['ls', '--recursive', '--json', `e8pr/${bucket}/${prefix}`], {
    encoding: 'utf8', env: { ...process.env, MC_HOST_e8pr: `http://${encoded}@127.0.0.1:19100` },
  });
  return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.type !== 'folder');
}
async function readExactRows(client, entry) {
  const output = await client.query(buildDependencySelectSql(entry), entry.source.database);
  return String(output).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function buildDependencySkeleton({ databases, ids }) {
  const local = {
    id: 'armor-item-dependencies-local', purpose: 'armor-set-stable-item-dependencies',
    source: { database: 'terria_v1_local', table: 'items' }, target: { database: databases.local, table: 'items' },
    keyColumns: ['id'], columns: [...LOCAL_ITEM_COLUMNS], keyValues: ids.map((id) => ({ id })), expectedRowCount: ids.length, rowHashes: [],
  };
  const maint = {
    id: 'armor-item-dependencies-maint', purpose: 'armor-set-stable-item-maint-dependencies',
    source: { database: 'terria_v1_maint', table: 'maint_items' }, target: { database: databases.maint, table: 'maint_items' },
    keyColumns: ['source_id'], columns: [...MAINT_ITEM_COLUMNS], keyValues: ids.map((source_id) => ({ source_id })), expectedRowCount: ids.length, rowHashes: [],
  };
  return { schemaVersion: 1, domain: DOMAIN, runId: RUN_ID, runKey: RUN_KEY, dependencies: [local, maint] };
}
async function buildArmorDependencyManifest({ databases, readonlyClient, outputPath }) {
  const source = buildArmorLocalSourceManifest({ repoRoot: ROOT });
  const requested = source.dependencyItemIds;
  const skeleton = buildDependencySkeleton({ databases, ids: requested });
  const groups = {};
  const missing = {};
  for (const entry of skeleton.dependencies) {
    const rows = await readExactRows(readonlyClient, entry);
    const key = entry.keyColumns[0];
    const observed = new Set(rows.map((row) => Number(row[key])));
    missing[entry.id] = requested.filter((id) => !observed.has(id));
    groups[entry.id] = rows;
  }
  if (missing['armor-item-dependencies-local'].length || missing['armor-item-dependencies-maint'].length) {
    throw new Error(`Armor dependency closure is incomplete: ${JSON.stringify(missing)}`);
  }
  const manifest = buildDependencyManifest({ manifest: skeleton, sourceRows: groups });
  writeJson(outputPath, manifest);
  return { manifest, missing, source, sha256: dependencyManifestSha256(manifest) };
}
async function captureFormalFingerprints(config) {
  const connection = await mysql.createConnection({ ...databaseCredentials(config), dateStrings: true });
  const tables = [
    ['terria_v1_local', 'armor_sets'],
    ['terria_v1_maint', 'maint_armor_sets'], ['terria_v1_maint', 'maint_armor_set_images'],
    ['terria_v1_relation', 'relation_armor_sets'], ['terria_v1_relation', 'relation_armor_set_items'],
    ['terria_v1_relation', 'relation_armor_set_images'], ['terria_v1_relation', 'projection_armor_sets'],
    ['terria_v1_relation', 'projection_item_armor_attributes'], ['terria_v1_relation', 'projection_equipment_effect_attributes'],
  ];
  const result = {};
  try {
    for (const [database, table] of tables) {
      const [[exists]] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [database, table]);
      if (!Number(exists.count)) { result[`${database}.${table}`] = null; continue; }
      const [rows] = await connection.query(`SELECT * FROM \`${database}\`.\`${table}\` ORDER BY id`);
      result[`${database}.${table}`] = { count: rows.length, sha256: hashRows(rows) };
    }
  } finally { await connection.end(); }
  return result;
}
async function runPreflight({ config, executionManifest, minioCredentials, redisPassword }) {
  const connection = await mysql.createConnection({ ...databaseCredentials(config), database: 'terria_v1_local' });
  let serverUuid; let formalSchemas; let automationSchemas; let existingAccounts;
  try {
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    serverUuid = server.serverUuid;
    const [formal] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('terria_v1_local','terria_v1_maint','terria_v1_relation','terria_v1_v55_rehearsal') ORDER BY schema_name");
    const [automation] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const resourceNames = buildLiveResourceNames({ profile: 't1', runKey: RUN_KEY });
    const expectedAccountNames = [...Object.values(resourceNames.accounts), ...Object.values(resourceNames.isolatedApiAccounts)];
    const [accountRows] = await connection.query(
      `SELECT User AS username FROM mysql.user WHERE User IN (${expectedAccountNames.map(() => '?').join(',')}) ORDER BY User`,
      expectedAccountNames,
    );
    existingAccounts = accountRows.map((row) => row.username ?? row.USERNAME);
    formalSchemas = formal.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    automationSchemas = automation.map((row) => row.schema_name ?? row.SCHEMA_NAME);
  } finally { await connection.end(); }
  const expectedFormalSchemas = [...executionManifest.mysql.formalDatabases, ...executionManifest.mysql.historicalDatabases].sort();
  if (serverUuid !== executionManifest.mysql.serverUuid || automationSchemas.length
      || existingAccounts.length
      || formalSchemas.sort().join(',') !== expectedFormalSchemas.join(',')) throw new Error('Armor MySQL preflight identity/schema/account check failed');
  const redisSizes = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, redisSize(16380, redisPassword, index + 1)]));
  if (Object.values(redisSizes).some((size) => size !== 0)) throw new Error(`Armor Redis allocated DBs are not empty: ${JSON.stringify(redisSizes)}`);
  const bucket = executionManifest.objectStore.buckets.armor_sets;
  const prefix = executionManifest.objectStore.objectPrefixes.armor_sets.replace('<runId>', RUN_ID);
  const objects = listMinioObjects(bucket, prefix, minioCredentials);
  if (objects.length) throw new Error('Armor MinIO run prefix is not empty');
  await isPortFree('127.0.0.1', 18280);
  const processLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const writers = processLines.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return pid !== process.pid && /(?:fetch-wiki|run-armor|crawler.*worker|automation.*sweep)/i.test(line);
  });
  if (writers.length) throw new Error(`Armor writer conflict: ${writers.join('; ')}`);
  return { status: 'ready', checkedAt: new Date().toISOString(), serverUuid, formalSchemas, automationSchemas, existingAccounts, redisSizes, minioObjects: objects.length, apiPortFree: true, activeWriters: writers.length };
}
async function verifyCleanup({ config, executionManifest, minioCredentials, redisPassword }) {
  const connection = await mysql.createConnection(databaseCredentials(config));
  try {
    const resourceNames = buildLiveResourceNames({ profile: 't1', runKey: RUN_KEY });
    const databaseNames = Object.values(resourceNames.databases);
    const accountNames = [...Object.values(resourceNames.accounts), ...Object.values(resourceNames.isolatedApiAccounts)];
    const [schemas] = await connection.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${databaseNames.map(() => '?').join(',')}) ORDER BY schema_name`,
      databaseNames,
    );
    const [accounts] = await connection.query(
      `SELECT User AS username FROM mysql.user WHERE User IN (${accountNames.map(() => '?').join(',')}) ORDER BY User`,
      accountNames,
    );
    const remainingSchemas = schemas.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    const remainingAccounts = accounts.map((row) => row.username ?? row.USERNAME);
    if (remainingSchemas.length || remainingAccounts.length) {
      throw new Error(`Armor run-owned MySQL cleanup failed: ${JSON.stringify({ remainingSchemas, remainingAccounts })}`);
    }
    const redisSizes = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, redisSize(16380, redisPassword, index + 1)]));
    if (Object.values(redisSizes).some((size) => size !== 0)) throw new Error(`Armor Redis cleanup failed: ${JSON.stringify(redisSizes)}`);
    const bucket = executionManifest.objectStore.buckets.armor_sets;
    const prefix = executionManifest.objectStore.objectPrefixes.armor_sets.replace('<runId>', RUN_ID);
    const minioObjects = listMinioObjects(bucket, prefix, minioCredentials);
    if (minioObjects.length) throw new Error('Armor MinIO run prefix contains objects after cleanup');
    await isPortFree('127.0.0.1', 18280);
    return { passed: true, remainingSchemas, remainingAccounts, redisSizes, minioObjectCount: minioObjects.length, apiPortFree: true };
  } finally { await connection.end(); }
}
function buildLandingRows(source) {
  const now = new Date().toISOString();
  const hashPayload = (payload) => createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
  const setsPayload = { armorSets: source.sets, sourceRevisionTimestamp: source.sourceRevision };
  const imagePayload = { armorSetImages: source.imageRows, sourceRevisionTimestamp: null };
  return [
    { id: 930001, dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'local_offline_authorized', source_key: `armor-local-offline:${RUN_KEY}:sets`, source_page: 'Module:ArmorSetBonuses', source_revision_timestamp: source.sourceRevision, content_hash: hashPayload(setsPayload), fetched_at: now, parsed_at: now, parse_status: 'ok', is_current: 1, payload_json: JSON.stringify(setsPayload) },
    { id: 930002, dataset_type: 'armor_set_images_raw', provider: 'terraria.wiki.gg', source_kind: 'local_offline_authorized', source_key: `armor-local-offline:${RUN_KEY}:images`, source_page: 'Armor set pages:imageinfo', source_revision_timestamp: null, content_hash: hashPayload(imagePayload), fetched_at: now, parsed_at: now, parse_status: 'ok', is_current: 1, payload_json: JSON.stringify(imagePayload) },
  ];
}
export function validateArmorApiResponse({ routeId, payload, acceptance }) {
  if (payload?.success !== true) throw new Error(`Armor API ${routeId} returned unsuccessful response`);
  const expected = acceptance?.readback;
  if (routeId === 'public-armor-sets' || routeId === 'admin-armor-sets') {
    const total = Number(payload.pagination?.total ?? 0);
    if (!Array.isArray(payload.data) || payload.data.length === 0 || total !== 64) throw new Error(`Armor API ${routeId} count mismatch: ${JSON.stringify({ total, dataLength: payload.data?.length ?? null, keys: Object.keys(payload) })}`);
    const sourceKeys = new Set(acceptance?.setTextKeys ?? []);
    const responseKeys = payload.data.map((row) => String(row?.textKey ?? row?.text_key ?? '').trim());
    if (!sourceKeys.size || responseKeys.some((key) => !key || !sourceKeys.has(key)) || new Set(responseKeys).size !== responseKeys.length) {
      throw new Error(`Armor API ${routeId} returned identities outside the exact source set identities`);
    }
    return { identityVerified: true, total };
  }
  if (routeId === 'public-armor-set-detail') {
    const expectedId = stablePositiveBigIntId('ArmorSetBonus.Shroomite');
    if (Number(payload.data?.id) !== expectedId || String(payload.data?.textKey) !== 'ArmorSetBonus.Shroomite') throw new Error('Armor API detail identity mismatch');
    return { identityVerified: true, id: expectedId };
  }
  throw new Error(`Unknown Armor API route ${routeId}`);
}
async function readbackTables(connection, maintConnection) {
  const tables = [
    ['maint.maint_armor_sets', maintConnection, 'maint_armor_sets'], ['maint.maint_armor_set_images', maintConnection, 'maint_armor_set_images'],
    ['relation.relation_armor_sets', connection, 'relation_armor_sets'], ['relation.relation_armor_set_items', connection, 'relation_armor_set_items'],
    ['relation.relation_armor_set_images', connection, 'relation_armor_set_images'], ['relation.relation_armor_attribute_rows', connection, 'relation_armor_attribute_rows'],
    ['relation.relation_equipment_effect_attributes', connection, 'relation_equipment_effect_attributes'], ['relation.projection_armor_sets', connection, 'projection_armor_sets'],
    ['relation.projection_item_armor_attributes', connection, 'projection_item_armor_attributes'], ['relation.projection_equipment_effect_attributes', connection, 'projection_equipment_effect_attributes'],
  ];
  const readback = {};
  for (const [key, client, table] of tables) {
    const [rows] = await client.query(`SELECT * FROM \`${table}\` WHERE deleted = 0 ORDER BY id`);
    readback[key] = { count: rows.length, sha256: hashRows(rows), rows };
  }
  return readback;
}
export async function runArmorFullCanonicalIsolated({ repoRoot = ROOT } = {}) {
  const config = loadLocalStackConfig(repoRoot);
  const executionManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, EXECUTION_ROOT, 'execution-manifest.json'), 'utf8'));
  const registryPath = path.join(repoRoot, PRIVATE_ROOT, 'armor-acceptance', 'run-key-mappings.json');
  const registry = openDurableRunKeyRegistry(registryPath);
  const plan = buildEightDomainAllocationPlan({ manifest: executionManifest, domain: DOMAIN, repoRoot, runKeyRegistry: registry });
  const redisPassword = fs.readFileSync(path.join(repoRoot, PRIVATE_ROOT, 'redis/redis.auth'), 'utf8').trim();
  const minioCredentials = parseEnvFile(path.join(repoRoot, PRIVATE_ROOT, 'minio/minio.env'));
  const source = buildArmorLocalSourceManifest({ repoRoot });
  const sourceManifestPath = path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.json');
  const sourceStatePath = path.join(repoRoot, PRIVATE_ROOT, 'source-state/armor_sets.json');
  writeJson(sourceManifestPath, source);
  writeJson(sourceStatePath, { status: 'completed', sourceMode: source.sourceMode, wikiUnchanged: source.wikiUnchanged, generatedAt: new Date().toISOString() });
  writeJson(path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.empty-wiki.json'), { records: [] });
  const preflight = await runPreflight({ config, executionManifest, minioCredentials, redisPassword });
  const allocation = Object.freeze({ ...plan, preflight: { status: 'ready', observedAt: preflight.checkedAt } });
  const formalBefore = await captureFormalFingerprints(config);
  const privateDirectory = path.join(repoRoot, plan.automaticArtifactRoot, 'acceptance-runs', `armor-local-offline-${Date.now()}`);
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  let execution;
  try {
    execution = await runLiveAutomationAcceptance({
      profile: 't1', runId: RUN_ID, privateDirectory,
      mysql: { host: config.database.host, port: Number(config.database.port), username: config.database.username, password: config.database.password },
      redis: { host: '127.0.0.1', port: 16380, password: redisPassword, logicalDb: 6 },
      scope: 'armor-canonical-isolated', acceptanceExecutor: async (context) => {
        const dependencyManifestPath = path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.dependencies.json');
        const dependencies = await buildArmorDependencyManifest({ databases: context.databases, readonlyClient: context.readonlyClient, outputPath: dependencyManifestPath });
        const target = { host: context.mysql.host, port: context.mysql.port, user: context.mysql.username, password: context.mysql.password };
        const landingRows = buildLandingRows(source);
        const maintSync = await runMaintSync({ apply: true, scopes: ['armor_sets', 'armor_set_images'], ...target, database: context.databases.maint }, { config: { database: { ...target, username: context.mysql.username } }, loadLandingRows: async () => landingRows, writeReport: async () => null });
        const relation = await runSync({ apply: true, createDatabase: false, scopes: ['armor'], maintDatabase: context.databases.maint, localDatabase: context.databases.local, relationDatabase: context.databases.relation, wikiArmorSetsInput: path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.empty-wiki.json'), allowLocalItemImageFallback: false, managedImageUrlPrefixes: resolveManagedImageUrlPrefixes({ repoRoot }) }, { config: { database: { ...target, username: context.mysql.username } }, writeReports: async () => ({ auditJsonPath: path.join(privateDirectory, 'relation-audit.json'), auditMdPath: path.join(privateDirectory, 'relation-audit.md'), conflictsPath: path.join(privateDirectory, 'relation-conflicts.json'), unresolvedPath: path.join(privateDirectory, 'relation-unresolved.json') }) });
        const relationConnection = await mysql.createConnection({ ...target, database: context.databases.relation, dateStrings: true });
        const maintConnection = await mysql.createConnection({ ...target, database: context.databases.maint, dateStrings: true });
        try {
          const readback = await readbackTables(relationConnection, maintConnection);
          if (readback['maint.maint_armor_sets'].count !== 64 || readback['relation.relation_armor_sets'].count !== 64 || readback['relation.projection_armor_sets'].count !== 64 || readback['maint.maint_armor_set_images'].count !== 175 || readback['relation.relation_armor_set_images'].count !== 175) throw new Error(`Armor T1 row counts mismatch: ${JSON.stringify(Object.fromEntries(Object.entries(readback).map(([key, value]) => [key, value.count])))}`);
          return { status: 'passed', sourceMode: source.sourceMode, wikiUnchanged: source.wikiUnchanged, dependencyManifestSha256: dependencies.sha256, dependencySeedEvidence: context.dependencySeedEvidence, maintSync, relationSummary: relation.summary, setTextKeys: source.sets.map((row) => row.textKey), readback: Object.fromEntries(Object.entries(readback).map(([key, value]) => [key, { count: value.count, sha256: value.sha256 }])) };
        } finally { await Promise.all([relationConnection.end(), maintConnection.end()]); }
      },
      dependencyManifestFactory: async ({ databases, readonlyClient }) => (await buildArmorDependencyManifest({ databases, readonlyClient, outputPath: path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.dependencies.json') })).manifest,
      isolatedAllocation: allocation,
      isolatedApiLifecycleFactory: async ({ manifest, adapter }) => {
        writeJson(path.join(repoRoot, PRIVATE_ROOT, 'source-manifests/armor_sets.json'), source);
        const credentials = {
          ...buildRunOwnedApiCredentials({ mysql: { host: '127.0.0.1', port: 13306 }, apiAccount: adapter.apiAccounts.apiReadonly, redisPassword, runKey: RUN_KEY }),
          minio: {
            url: allocation.objectStore.endpoint,
            accessKey: minioCredentials.MINIO_ROOT_USER,
            secretKey: minioCredentials.MINIO_ROOT_PASSWORD,
          },
        };
        return buildIsolatedApiLifecycle({ allocation, mode: 'consumer-readback', credentials, migrationEvidence: manifest.migrationEvidence, sourceManifestPath, sourceStatePath, routes: [
          { routeId: 'public-armor-sets', params: {} }, { routeId: 'public-armor-set-detail', params: { id: String(stablePositiveBigIntId('ArmorSetBonus.Shroomite')) } }, { routeId: 'admin-armor-sets', params: {} },
        ], validateResponse: validateArmorApiResponse });
      },
    });
  } finally { fs.rmSync(privateDirectory, { recursive: true, force: true }); }
  const formalAfter = await captureFormalFingerprints(config);
  const formalUnchanged = JSON.stringify(formalBefore) === JSON.stringify(formalAfter);
  if (!formalUnchanged) throw new Error('Armor isolated T1 changed formal fingerprints');
  const cleanup = await verifyCleanup({ config, executionManifest, minioCredentials, redisPassword });
  const report = {
    schemaVersion: 1, reportKind: 'eight_domain_armor_isolated_t1', status: execution.status === 'passed' && execution.cleanupPassed === true ? 'passed' : 'failed',
    maintainedChainStatus: execution.status === 'passed' && execution.cleanupPassed === true ? 'passed' : 'failed', sourceCoverageStatus: 'partial',
    domain: DOMAIN, runId: RUN_ID, runKey: RUN_KEY,
    sourceMode: source.sourceMode, wikiUnchanged: source.wikiUnchanged, sourceRevision: source.sourceRevision, sourceRevisionId: source.sourceRevisionId,
    sourceManifestSha256: hashBytes(fs.readFileSync(sourceManifestPath)), sourceHashes: source.sourceHashes, sourceCounts: source.counts, missingImageSetKeys: source.missingImageSetKeys,
    imageBinaryStatus: 'not-run', v2AutomaticIngestionStatus: 'not-run-by-request', productionReadinessStatus: 'blocked', formalDatabaseWrites: false, formalFingerprintsUnchanged: formalUnchanged,
    formalFingerprints: { before: formalBefore, after: formalAfter },
    preflight, execution: { status: execution.status, cleanupPassed: execution.cleanupPassed, acceptance: execution.acceptance, isolatedApi: execution.isolatedApi, dependencySeedEvidence: execution.dependencySeedEvidence },
    cleanup: { ...cleanup, passed: cleanup.passed && execution.cleanupPassed === true },
  };
  const reportPath = path.join(repoRoot, EXECUTION_ROOT, DOMAIN, RUN_KEY, 'isolated-real-ingestion.json');
  writeJson(reportPath, report);
  return Object.freeze({ ...report, reportPath });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runArmorFullCanonicalIsolated().then((result) => { process.stdout.write(`${JSON.stringify({ status: result.status, reportPath: result.reportPath, cleanup: result.cleanup }, null, 2)}\n`); if (result.status !== 'passed') process.exitCode = 1; }).catch((error) => { process.stderr.write(`Armor isolated T1 failed: ${error.stack || error.message}\n`); process.exitCode = 1; });
}
