#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { buildDependencyManifest, dependencyManifestSha256 } from '../automation/eight-domain-dependency-seeder.mjs';
import { buildEightDomainAllocationPlan } from '../automation/eight-domain-isolated-allocation.mjs';
import { openDurableRunKeyRegistry } from '../automation/automation-database-contract.mjs';
import {
  buildIsolatedApiLifecycle,
  buildLiveResourceNames,
  buildRunOwnedApiCredentials,
  runLiveAutomationAcceptance,
} from '../automation/run-live-automation-acceptance.mjs';
import {
  applyBundleChanges,
  assertShimmerImportScopeMatchesPreview,
  buildShimmerImportPreview,
  buildShimmerImportProjection,
  loadCurrentShimmerScope,
  loadVerifiedShimmerImportBundle,
} from './import-wiki-shimmer-to-db.mjs';
import { verifyShimmerGeneration } from '../transform/shimmer-generation-contract.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
const DOMAIN = 'shimmer';
const RUN_ID = 'e8pr-shimmer-20261022-v4';
const RUN_KEY = 'e8p_8deac87b8d22c5c3';
const GENERATION_ID = '379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761';
const EXPECTED_BUNDLE_SHA256 = 'sha256:68801601cfaad72b0e3827ee5f8390037b90c306b9e73ee9547c169f9c6464bb';
const GENERATION_POINTER = 'data/generated/shimmer/wiki-shimmer-current-generation.json';
const GENERATION_MANIFEST = `data/generated/shimmer/generations/${GENERATION_ID}/wiki-shimmer-manifest.json`;
const mysqlModule = loadMysqlModule({ repoRoot: ROOT });

const SHIMMER_DATASETS = Object.freeze({
  itemTransforms: Object.freeze({ table: 'shimmer_item_transforms', count: 279, reference: 'item-transforms' }),
  decraftRules: Object.freeze({ table: 'shimmer_decraft_rules', count: 248, reference: 'decraft-rules' }),
  entityTransforms: Object.freeze({ table: 'shimmer_entity_transforms', count: 121, reference: 'entity-transforms' }),
  npcTransforms: Object.freeze({ table: 'shimmer_npc_transforms', count: 29, reference: 'npc-transforms' }),
});
const LOCAL_ITEM_COLUMNS = Object.freeze(['id', 'internal_name', 'name', 'name_zh', 'status', 'deleted']);
const LOCAL_NPC_COLUMNS = Object.freeze(['id', 'source_id', 'internal_name', 'name', 'name_zh', 'status', 'deleted']);
const FORMAL_SCHEMAS = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation', 'terria_v1_v55_rehearsal']);
const EXECUTION_CODE_PATHS = Object.freeze([
  'pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs',
  'pipelines/import/import-wiki-shimmer-to-db.mjs',
  'pipelines/transform/shimmer-generation-contract.mjs',
  'pipelines/automation/eight-domain-dependency-seeder.mjs',
  'pipelines/automation/run-live-automation-acceptance.mjs',
  'pipelines/automation/provision-automation-databases.mjs',
  'pipelines/automation/mysql-automation-acceptance-adapter.mjs',
  'pipelines/automation/eight-domain-isolated-allocation.mjs',
  'pipelines/automation/automation-database-contract.mjs',
  'platform/local/run-eight-domain-isolated-api.mjs',
]);
const API_JAR_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const REPORT_TABLES = Object.freeze([
  ['local.world_contexts.SHIMMER', 'world_contexts', "`code` = 'SHIMMER'"],
  ['local.entity_source_snapshots.wiki_zh:微光', 'entity_source_snapshots', "`provider` = 'wiki_zh' AND `source_page` = '微光'"],
  ...Object.entries(SHIMMER_DATASETS).map(([key, descriptor]) => [
    `local.${descriptor.table}.wiki_zh:微光`, descriptor.table,
    "`source_provider` = 'wiki_zh' AND `source_page` = '微光' AND `deleted` = 0",
  ]),
]);
const API_DATASET_BY_ROUTE = Object.freeze(Object.fromEntries(Object.entries(SHIMMER_DATASETS).flatMap(([key, value]) => [
  [`public-shimmer-${value.reference}`, key],
  [`admin-shimmer-${value.reference}`, key],
])));

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function canonicalJson(value) { return JSON.stringify(canonical(value)); }
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function hashCanonical(value) { return hashBytes(Buffer.from(canonicalJson(value), 'utf8')); }
function hashRows(rows) {
  const normalized = rows.map(canonical).map(JSON.stringify).sort();
  return hashBytes(Buffer.from(JSON.stringify(normalized), 'utf8'));
}

export function buildShimmerPrivatePaths({ runKey = RUN_KEY } = {}) {
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey)) throw new Error('Shimmer private artifact runKey is invalid');
  return Object.freeze({
    sourceManifest: `${PRIVATE_ROOT}/source-manifests/shimmer.current-pin.${runKey}.json`,
    sourceState: `${PRIVATE_ROOT}/source-state/shimmer.${runKey}.json`,
    dependencyManifest: `${PRIVATE_ROOT}/source-manifests/shimmer.dependencies.${runKey}.json`,
  });
}

function buildExecutionCodeIdentity(root) {
  const gitHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const gitStatus = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  const fileHashes = Object.fromEntries(EXECUTION_CODE_PATHS.map((relativePath) => [
    relativePath,
    hashBytes(fs.readFileSync(path.join(root, relativePath))),
  ]));
  return Object.freeze({
    gitHead,
    workingTreeDirty: gitStatus.length > 0,
    fileHashes: Object.freeze(fileHashes),
    catalogApiJarSha256: hashBytes(fs.readFileSync(path.join(root, API_JAR_PATH))),
  });
}

function readJsonOrdinary(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  const bytes = fs.readFileSync(filePath);
  return { value: JSON.parse(bytes.toString('utf8')), bytes, sha256: hashBytes(bytes) };
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filePath), 0o700);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    const fd = fs.openSync(filePath, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(filePath);
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || !existing.equals(bytes)) {
      throw new Error(`Shimmer private manifest already exists with different content: ${filePath}`);
    }
  }
  return hashBytes(bytes);
}

export function writeShimmerDependencyManifestFile({ manifest, dependencyPath } = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Shimmer dependency manifest must be an object');
  }
  const expectedFileSha256 = hashBytes(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  const fileSha256 = writePrivateJson(dependencyPath, manifest);
  if (fileSha256 !== expectedFileSha256) throw new Error('Shimmer dependency manifest file-byte hash mismatch');
  return Object.freeze({
    path: dependencyPath,
    manifestSha256: dependencyManifestSha256(manifest),
    fileSha256,
  });
}

function collectReferenceInventory(bundle) {
  const itemReferences = [];
  const npcReferences = [];
  const add = (kind, internalName) => {
    const reference = { kind: String(kind ?? 'none'), internalName: String(internalName ?? '').trim() || null };
    if (reference.kind === 'npc') npcReferences.push(reference);
    else itemReferences.push(reference);
  };
  for (const record of bundle.itemTransformsPayload.records) {
    add(record.inputKind, record.inputInternalName);
    add(record.outputKind, record.outputInternalName);
  }
  for (const record of bundle.decraftRulesPayload.records) {
    add(record.input?.kind, record.input?.internalName);
    for (const output of record.outputs ?? []) add(output.kind, output.internalName);
  }
  for (const record of bundle.entityTransformsPayload.records) {
    add(record.input?.kind, record.input?.internalName);
    add(record.output?.kind, record.output?.internalName);
  }
  for (const record of bundle.npcTransformsPayload.records) add(record.npc?.kind, record.npc?.internalName);
  const itemNames = [...new Set(itemReferences.filter((row) => row.kind === 'item' && row.internalName).map((row) => row.internalName))].sort();
  const npcNames = [...new Set(npcReferences.filter((row) => row.internalName).map((row) => row.internalName))].sort();
  return Object.freeze({
    itemReferenceCount: itemReferences.length,
    npcReferenceCount: npcReferences.length,
    itemNames: Object.freeze(itemNames),
    npcNames: Object.freeze(npcNames),
    itemReferences: Object.freeze(itemReferences.map(Object.freeze)),
    npcReferences: Object.freeze(npcReferences.map(Object.freeze)),
    itemGroupReferences: itemReferences.filter((row) => row.kind === 'item_group').length,
    noneReferences: itemReferences.filter((row) => row.kind === 'none').length,
    nullItemInternalNameReferences: itemReferences.filter((row) => row.kind === 'item' && !row.internalName).length,
  });
}

export function buildShimmerLocalSourceManifest({ repoRoot = ROOT } = {}) {
  const root = path.resolve(repoRoot);
  const pointerPath = path.join(root, GENERATION_POINTER);
  const pointerFile = readJsonOrdinary(pointerPath, 'Shimmer current-generation pointer');
  const pointer = pointerFile.value;
  if (pointer.generationId !== GENERATION_ID || pointer.dataBundleSha256 !== EXPECTED_BUNDLE_SHA256
      || pointer.manifestPath !== `generations/${GENERATION_ID}/wiki-shimmer-manifest.json`) {
    throw new Error('Shimmer current-generation pointer differs from the fixed offline T1 generation');
  }
  const verified = verifyShimmerGeneration({ manifestPath: path.join(root, GENERATION_MANIFEST) });
  if (verified.valid !== true || verified.manifest.generationId !== GENERATION_ID
      || verified.manifest.manifestSha256 !== pointer.manifestSha256
      || verified.manifest.dataBundleSha256 !== EXPECTED_BUNDLE_SHA256) {
    throw new Error('Shimmer generation manifest does not match the fixed current pointer');
  }
  const bundle = loadVerifiedShimmerImportBundle({ bundleManifestPath: GENERATION_MANIFEST, repoRoot: root });
  const projection = buildShimmerImportProjection({ bundle });
  const referenceInventory = collectReferenceInventory(bundle);
  const scopeCounts = {
    worldContexts: 1,
    entitySourceSnapshots: 7,
    shimmerItemTransforms: bundle.itemTransformsPayload.records.length,
    shimmerDecraftRules: bundle.decraftRulesPayload.records.length,
    shimmerEntityTransforms: bundle.entityTransformsPayload.records.length,
    shimmerNpcTransforms: bundle.npcTransformsPayload.records.length,
  };
  const titleResolutionCount = bundle.titleResolutionPayload.records?.length ?? 0;
  if (canonicalJson(scopeCounts) !== canonicalJson({
    worldContexts: 1,
    entitySourceSnapshots: 7,
    shimmerItemTransforms: 279,
    shimmerDecraftRules: 248,
    shimmerEntityTransforms: 121,
    shimmerNpcTransforms: 29,
  }) || titleResolutionCount !== 820 || referenceInventory.itemNames.length !== 438
      || referenceInventory.npcNames.length !== 72 || referenceInventory.itemGroupReferences !== 279
      || referenceInventory.noneReferences !== 4 || referenceInventory.itemReferenceCount !== 1034
      || referenceInventory.npcReferenceCount !== 180) {
    throw new Error('Shimmer current generation counts differ from the reviewed offline baseline');
  }
  const generationFileHashes = Object.fromEntries(verified.manifest.files.map((entry) => [entry.name, entry.sha256]));
  const sourceManifest = Object.freeze({
    schemaVersion: 1,
    manifestKind: 'eight_domain_shimmer_local_source',
    runId: RUN_ID,
    runKey: RUN_KEY,
    generationId: GENERATION_ID,
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    sourcePage: verified.manifest.raw.pageTitle,
    sourceRevisionId: verified.manifest.raw.revisionId,
    sourceRevisionTimestamp: verified.manifest.raw.revisionTimestamp,
    langlinkRecordCount: verified.manifest.langlinks.recordCount,
    langlinkSha256: verified.manifest.langlinks.sha256,
    pointerPath: GENERATION_POINTER,
    pointerSha256: pointerFile.sha256,
    manifestPath: GENERATION_MANIFEST,
    manifestSha256: verified.manifest.manifestSha256,
    dataBundleSha256: verified.manifest.dataBundleSha256,
    generationFileHashes: Object.freeze(generationFileHashes),
    standardizedInputs: verified.manifest.standardizedInputs,
    tableRoleVersion: verified.manifest.tableRoleVersion,
    scopeCounts: Object.freeze(scopeCounts),
    titleResolutionEvidenceCount: titleResolutionCount,
    referenceInventory: Object.freeze({
      itemReferenceCount: referenceInventory.itemReferenceCount,
      npcReferenceCount: referenceInventory.npcReferenceCount,
      itemNameCount: referenceInventory.itemNames.length,
      npcNameCount: referenceInventory.npcNames.length,
      itemGroupReferences: referenceInventory.itemGroupReferences,
      noneReferences: referenceInventory.noneReferences,
      nullItemInternalNameReferences: referenceInventory.nullItemInternalNameReferences,
      itemNames: referenceInventory.itemNames,
      npcNames: referenceInventory.npcNames,
    }),
    derivedProjectionCounts: Object.freeze({
      worldContext: projection.worldContext.code === 'SHIMMER' ? 1 : 0,
      snapshots: projection.snapshots.length,
      shimmerItemTransforms: projection.shimmerTables.shimmer_item_transforms.length,
      shimmerDecraftRules: projection.shimmerTables.shimmer_decraft_rules.length,
      shimmerEntityTransforms: projection.shimmerTables.shimmer_entity_transforms.length,
      shimmerNpcTransforms: projection.shimmerTables.shimmer_npc_transforms.length,
    }),
  });
  return Object.freeze({ sourceManifest, bundle, referenceInventory, verified });
}

function validateExactDependencyRows(rows, expectedNames, label, { allowSignedIds = false } = {}) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} source rows must be an array`);
  const expected = new Set(expectedNames);
  const names = new Set();
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const internalName = String(row?.internal_name ?? '').trim();
    const id = Number(row?.id);
    if (!expected.has(internalName)) throw new Error(`${label} dependency row ${index} is outside the exact source reference set`);
    if (!Number.isSafeInteger(id) || id === 0 || (!allowSignedIds && id < 0)) {
      throw new Error(`${label} dependency row ${index} has no stable ID`);
    }
    if (names.has(internalName) || ids.has(id)) throw new Error(`${label} dependency rows contain duplicate stable identities`);
    names.add(internalName);
    ids.add(id);
  }
  return { rows, names };
}

function dependencyEntry({ id, purpose, table, columns, rows, database }) {
  if (!rows.length) return null;
  return {
    id,
    purpose,
    source: { database: 'terria_v1_local', table },
    target: { database, table },
    keyColumns: ['id'],
    columns: [...columns],
    keyValues: rows.map((row) => ({ id: Number(row.id) })),
    expectedRowCount: rows.length,
    rowHashes: [],
  };
}

export function buildShimmerDependencyManifest({ source, databases, localItemRows = [], localNpcRows = [] } = {}) {
  if (!source?.sourceManifest || !source?.referenceInventory) throw new Error('Shimmer dependency builder requires its verified source manifest');
  if (!databases || Object.keys(databases).sort().join(',') !== 'local,maint,relation') throw new Error('Shimmer dependency target requires exact T1 schema roles');
  const item = validateExactDependencyRows(localItemRows, source.referenceInventory.itemNames, 'Item');
  const npc = validateExactDependencyRows(localNpcRows, source.referenceInventory.npcNames, 'NPC', { allowSignedIds: true });
  const itemMissing = source.referenceInventory.itemNames.filter((name) => !item.names.has(name));
  const npcMissing = source.referenceInventory.npcNames.filter((name) => !npc.names.has(name));
  const missingItemNames = new Set(itemMissing);
  const missingNpcNames = new Set(npcMissing);
  const missingItemOccurrences = source.referenceInventory.itemReferences
    .filter((row) => row.kind === 'item' && row.internalName && missingItemNames.has(row.internalName)).length;
  const missingNpcOccurrences = source.referenceInventory.npcReferences
    .filter((row) => row.internalName && missingNpcNames.has(row.internalName)).length;
  const dependencies = [
    dependencyEntry({ id: 'shimmer-local-item-dependencies', purpose: 'shimmer-stable-item-reference-dependencies', table: 'items', columns: LOCAL_ITEM_COLUMNS, rows: item.rows, database: databases.local }),
    dependencyEntry({ id: 'shimmer-local-npc-dependencies', purpose: 'shimmer-stable-npc-reference-dependencies', table: 'npcs', columns: LOCAL_NPC_COLUMNS, rows: npc.rows, database: databases.local }),
  ].filter(Boolean);
  if (!dependencies.length) throw new Error('Shimmer exact stable-reference dependency closure has no source rows');
  const sourceRows = {};
  for (const dependency of dependencies) sourceRows[dependency.id] = dependency.target.table === 'items' ? item.rows : npc.rows;
  const manifest = buildDependencyManifest({
    manifest: { schemaVersion: 1, domain: 'shimmer', runId: RUN_ID, runKey: RUN_KEY, dependencies },
    sourceRows,
  });
  return Object.freeze({
    manifest,
    manifestSha256: dependencyManifestSha256(manifest),
    resolution: Object.freeze({
      requestedItemNames: source.referenceInventory.itemNames.length,
      matchedItemNames: item.names.size,
      missingItemNames: Object.freeze(itemMissing),
      missingItemOccurrences,
      requestedNpcNames: source.referenceInventory.npcNames.length,
      matchedNpcNames: npc.names.size,
      missingNpcNames: Object.freeze(npcMissing),
      missingNpcOccurrences,
      signedNpcIdentities: Object.freeze(npc.rows
        .filter((row) => Number(row.id) < 0)
        .map((row) => Object.freeze({ id: Number(row.id), internalName: String(row.internal_name) }))),
      itemGroupReferences: source.referenceInventory.itemGroupReferences,
      noneReferences: source.referenceInventory.noneReferences,
      nullItemInternalNameReferences: source.referenceInventory.nullItemInternalNameReferences,
    }),
  });
}

function sqlHexText(value) { return `CONVERT(0x${Buffer.from(value, 'utf8').toString('hex')} USING utf8mb4)`; }
function parseJsonRows(output, label) {
  return String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { throw new Error(`${label} lookup returned malformed JSON`); }
  });
}

function databaseCredentials(config) {
  return { host: config.database.host, port: Number(config.database.port), user: config.database.username, password: config.database.password };
}

function readProcessStartIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  return stat.slice(close + 2).trim().split(/\s+/)[19] ?? '';
}

function redisCommand(password, database, ...command) {
  return execFileSync('redis-cli', ['--raw', '-h', '127.0.0.1', '-p', '16380', '-n', String(database), ...command], {
    encoding: 'utf8',
    env: { ...process.env, REDISCLI_AUTH: password },
    timeout: 5000,
  }).trim();
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function runAccountNames() {
  return buildLiveResourceNames({ profile: 't1', runKey: RUN_KEY });
}

export function findActiveShimmerWriters({ processRows, selfPid = process.pid } = {}) {
  const entries = String(processRows ?? '').split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
  }).filter(Boolean);
  const parents = new Map(entries.map((entry) => [entry.pid, entry.ppid]));
  const excluded = new Set();
  let current = Number(selfPid);
  while (Number.isSafeInteger(current) && current > 0 && !excluded.has(current)) {
    excluded.add(current);
    current = parents.get(current) ?? 0;
  }
  return entries
    .filter((entry) => !excluded.has(entry.pid)
      && /(?:fetch-wiki-shimmer|run-shimmer|shimmer.*worker|automation.*sweep|run-live-automation-acceptance|run-.*canonical.*isolated)/i.test(entry.command))
    .map((entry) => entry.pid);
}

async function readFormalScopeFingerprints(config) {
  const connection = await mysqlModule.createConnection({ ...databaseCredentials(config), database: 'terria_v1_local', dateStrings: true, connectTimeout: 3000 });
  const fingerprints = {};
  try {
    for (const [key, table, where] of REPORT_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\` WHERE ${where} ORDER BY \`id\``);
      fingerprints[key] = Object.freeze({ rowCount: rows.length, sha256: hashRows(rows) });
    }
  } finally { await connection.end(); }
  return Object.freeze(fingerprints);
}

async function readTargetShimmerScope(connection) {
  const scope = {};
  const [[context]] = await connection.query("SELECT * FROM `world_contexts` WHERE `code` = 'SHIMMER' ORDER BY `id`");
  const [snapshots] = await connection.query("SELECT * FROM `entity_source_snapshots` WHERE `provider` = 'wiki_zh' AND `source_page` = '微光' ORDER BY `id`");
  scope.worldContext = context ?? null;
  scope.entitySnapshots = snapshots;
  scope.tables = {};
  for (const descriptor of Object.values(SHIMMER_DATASETS)) {
    const [rows] = await connection.query(`SELECT * FROM \`${descriptor.table}\` WHERE \`source_provider\` = 'wiki_zh' AND \`source_page\` = '微光' AND \`deleted\` = 0 ORDER BY \`id\``);
    scope.tables[descriptor.table] = rows;
  }
  return scope;
}

export function scopeCounts(scope) {
  const snapshots = scope.entitySnapshots ?? scope.snapshots;
  const tables = scope.tables ?? scope.shimmerTables;
  if (!Array.isArray(snapshots) || !tables || typeof tables !== 'object') {
    throw new TypeError('Shimmer readback is missing its snapshot or dataset scope');
  }
  const count = (table) => {
    if (!Array.isArray(tables[table])) throw new TypeError(`Shimmer readback is missing table ${table}`);
    return tables[table].length;
  };
  return {
    worldContexts: scope.worldContext == null ? 0 : 1,
    entitySourceSnapshots: snapshots.length,
    shimmerItemTransforms: count('shimmer_item_transforms'),
    shimmerDecraftRules: count('shimmer_decraft_rules'),
    shimmerEntityTransforms: count('shimmer_entity_transforms'),
    shimmerNpcTransforms: count('shimmer_npc_transforms'),
  };
}

function scopeRowHashes(scope) {
  return {
    'local.world_contexts.SHIMMER': { rowCount: scope.worldContext == null ? 0 : 1, sha256: hashRows(scope.worldContext == null ? [] : [scope.worldContext]) },
    'local.entity_source_snapshots.wiki_zh:微光': { rowCount: scope.entitySnapshots.length, sha256: hashRows(scope.entitySnapshots) },
    ...Object.fromEntries(Object.entries(scope.tables).map(([table, rows]) => [
      `local.${table}.wiki_zh:微光`, { rowCount: rows.length, sha256: hashRows(rows) },
    ])),
  };
}

function assertScopeIsEmpty(scope) {
  const counts = scopeCounts(scope);
  if (Object.values(counts).some((count) => count !== 0)) throw new Error(`Shimmer-owned scopes are not empty before T1: ${JSON.stringify(counts)}`);
}

function assertScopeCounts(scope, expected) {
  const actual = scopeCounts(scope);
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`Shimmer six-scope counts differ from the fixed generation: ${JSON.stringify({ expected, actual })}`);
}

async function queryLookupRows(readonlyClient, table, columns, names) {
  if (!names.length) return [];
  const rows = [];
  const fields = columns.flatMap((column) => [`'${column}'`, `\`${column}\``]).join(', ');
  for (let index = 0; index < names.length; index += 300) {
    const batch = names.slice(index, index + 300);
    const values = batch.map(sqlHexText).join(', ');
    const sql = `SELECT JSON_OBJECT(${fields}) FROM \`${table}\` WHERE BINARY \`internal_name\` IN (${values}) ORDER BY \`id\``;
    rows.push(...parseJsonRows(await readonlyClient.query(sql, 'terria_v1_local'), `${table} identity`));
  }
  return rows;
}

async function buildFreshShimmerDependencyManifest({ source, databases, readonlyClient, dependencyPath } = {}) {
  const localItemRows = await queryLookupRows(readonlyClient, 'items', LOCAL_ITEM_COLUMNS, source.referenceInventory.itemNames);
  const localNpcRows = await queryLookupRows(readonlyClient, 'npcs', LOCAL_NPC_COLUMNS, source.referenceInventory.npcNames);
  const built = buildShimmerDependencyManifest({ source, databases, localItemRows, localNpcRows });
  const fileIdentity = writeShimmerDependencyManifestFile({ manifest: built.manifest, dependencyPath });
  if (fileIdentity.manifestSha256 !== built.manifestSha256) throw new Error('Shimmer dependency canonical identity changed while writing');
  return Object.freeze({ ...built, fileSha256: fileIdentity.fileSha256, path: fileIdentity.path });
}

function buildApiExpected({ scope, source }) {
  const counts = scopeCounts(scope);
  const firstRows = {};
  for (const [key, descriptor] of Object.entries(SHIMMER_DATASETS)) {
    const row = scope.tables[descriptor.table][0];
    if (!row) throw new Error(`Shimmer API requires a first row for ${key}`);
    firstRows[key] = { id: Number(row.id) };
  }
  return Object.freeze({
    generationId: source.sourceManifest.generationId,
    dataBundleSha256: source.sourceManifest.dataBundleSha256,
    expectedCounts: Object.freeze(Object.fromEntries(Object.entries(SHIMMER_DATASETS).map(([key]) => [key, counts[`shimmer${key[0].toUpperCase()}${key.slice(1)}`]]))),
    worldContextId: Number(scope.worldContext.id),
    firstRows: Object.freeze(firstRows),
  });
}

function buildApiRoutes() {
  const routes = [
    { routeId: 'public-shimmer-context', params: {} },
    { routeId: 'public-shimmer-overview', params: {} },
    { routeId: 'admin-shimmer-overview', params: {} },
  ];
  for (const descriptor of Object.values(SHIMMER_DATASETS)) routes.push({ routeId: `public-shimmer-${descriptor.reference}`, params: {} });
  for (const descriptor of Object.values(SHIMMER_DATASETS)) routes.push({ routeId: `admin-shimmer-${descriptor.reference}`, params: {} });
  return Object.freeze(routes.map(Object.freeze));
}

function readSimpleJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function writeEvidence(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return hashBytes(bytes);
}

function parseAdminManifest(value, expected) {
  let manifest;
  try { manifest = JSON.parse(String(value?.payloadJson ?? '')); } catch { throw new Error('Shimmer admin overview manifest snapshot is malformed'); }
  if (manifest.generationId !== expected.generationId || manifest.dataBundleSha256 !== expected.dataBundleSha256) {
    throw new Error('Shimmer admin overview manifest generation identity mismatch');
  }
  return manifest;
}

export function validateShimmerApiResponse({ routeId, payload, acceptance } = {}) {
  if (payload?.success !== true) throw new Error(`Shimmer API ${routeId} returned unsuccessful response`);
  const expected = acceptance?.apiExpected;
  if (!expected?.generationId || !expected.expectedCounts || !expected.firstRows) throw new Error('Shimmer API response validation requires independent readback expectations');
  if (routeId === 'public-shimmer-context') {
    if (String(payload.data?.code) !== 'SHIMMER' || Number(payload.data?.id) !== expected.worldContextId) throw new Error('Shimmer API context stable identity mismatch');
    return { identityVerified: true, code: 'SHIMMER', id: Number(payload.data.id) };
  }
  if (routeId === 'public-shimmer-overview' || routeId === 'admin-shimmer-overview') {
    const datasets = payload.data?.datasets;
    if (!Array.isArray(datasets)) throw new Error(`Shimmer API ${routeId} dataset counts are missing`);
    const counts = Object.fromEntries(datasets.map((row) => [String(row.dataset), Number(row.count)]));
    for (const [key, descriptor] of Object.entries(SHIMMER_DATASETS)) {
      if (counts[descriptor.reference] !== expected.expectedCounts[key]) throw new Error(`Shimmer API ${routeId} count mismatch for ${descriptor.reference}`);
    }
    if (routeId === 'admin-shimmer-overview') parseAdminManifest(payload.data.manifest, expected);
    return { identityVerified: true, generationId: routeId === 'admin-shimmer-overview' ? expected.generationId : undefined, datasetCounts: counts };
  }
  const datasetKey = API_DATASET_BY_ROUTE[routeId];
  if (!datasetKey) throw new Error(`Shimmer API validator has no route ${routeId}`);
  const rows = payload.data;
  const expectedFirst = expected.firstRows[datasetKey];
  const total = Number(payload.pagination?.total ?? 0);
  if (!Array.isArray(rows) || rows.length === 0 || total !== expected.expectedCounts[datasetKey]
      || Number(rows[0]?.id) !== expectedFirst.id) throw new Error(`Shimmer API ${routeId} count or stable identity mismatch`);
  return { identityVerified: true, total, firstId: Number(rows[0].id) };
}

export function buildShimmerFailureArtifact({
  source,
  sourceManifestSha256,
  preflight,
  formalFingerprintsBefore,
  formalFingerprintsAfter,
  cleanup,
  acceptanceDirectory,
  dependencyBuild,
  error,
  executionCode,
} = {}) {
  const formalFingerprintsUnchanged = formalFingerprintsBefore != null
    && formalFingerprintsAfter != null
    && canonicalJson(formalFingerprintsBefore) === canonicalJson(formalFingerprintsAfter);
  return Object.freeze({
    schemaVersion: 1,
    reportKind: 'eight_domain_shimmer_isolated_t1',
    status: 'failed',
    maintainedChainStatus: 'failed',
    sourceCoverageStatus: source?.sourceManifest ? 'validated-before-run' : 'not-established',
    stableReferenceCoverageStatus: dependencyBuild == null
      ? 'not-established'
      : dependencyBuild.resolution.missingItemNames.length === 0 && dependencyBuild.resolution.missingNpcNames.length === 0
        ? 'complete'
        : 'partial',
    domain: DOMAIN,
    runId: RUN_ID,
    runKey: RUN_KEY,
    sourceMode: source?.sourceManifest?.sourceMode ?? 'local-offline-authorized',
    wikiUnchanged: false,
    source: source?.sourceManifest ?? null,
    sourceManifestSha256: sourceManifestSha256 ?? null,
    executionCode: executionCode ?? null,
    dependencyManifestSha256: dependencyBuild?.manifestSha256 ?? null,
    dependencyManifestFileSha256: dependencyBuild?.fileSha256 ?? null,
    dependencyResolution: dependencyBuild?.resolution ?? null,
    typedReferences: {
      itemGroupReferences: source?.sourceManifest?.referenceInventory?.itemGroupReferences ?? null,
      noneReferences: source?.sourceManifest?.referenceInventory?.noneReferences ?? null,
      status: 'preserved-as-typed-source-facts',
    },
    unresolvedReferenceHistory: {
      priorGenerationId: '51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd',
      priorReportedCount: 796,
      reusedForCurrentPin: false,
    },
    formalDatabaseWrites: false,
    formalFingerprintsUnchanged,
    formalFingerprints: { before: formalFingerprintsBefore ?? null, after: formalFingerprintsAfter ?? null },
    preflight: preflight ?? null,
    execution: {
      status: 'failed',
      cleanupPassed: cleanup?.passed === true,
      acceptanceDirectory: acceptanceDirectory ?? null,
      failure: describeFailure(error),
      apiReadback: null,
    },
    imageBinaryStatus: 'not-applicable',
    v2AutomaticIngestionStatus: 'not-run-by-request',
    productionReadinessStatus: 'blocked',
    cleanup: cleanup ?? { passed: false },
  });
}

function describeFailure(error) {
  const details = {
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? error ?? 'unknown Shimmer T1 failure'),
  };
  if (error instanceof AggregateError) details.errors = [...error.errors].map(describeFailure);
  if (error?.cause != null) details.cause = describeFailure(error.cause);
  return details;
}

function readbackApiSummary(value) {
  return Array.isArray(value) ? value.map((row) => ({ routeId: row.routeId, status: row.status, responseValidation: row.responseValidation })) : null;
}

export async function runShimmerFullCanonicalIsolated({ repoRoot = ROOT, now = new Date().toISOString() } = {}) {
  const root = path.resolve(repoRoot);
  const config = loadLocalStackConfig(root);
  const executionManifest = readSimpleJson(path.join(root, EXECUTION_ROOT, 'execution-manifest.json'));
  const runKeyRegistryDirectory = path.join(root, PRIVATE_ROOT, 'shimmer-acceptance');
  fs.mkdirSync(runKeyRegistryDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(runKeyRegistryDirectory, 0o700);
  const registry = openDurableRunKeyRegistry(path.join(runKeyRegistryDirectory, 'run-key-mappings.json'));
  const allocationBase = buildEightDomainAllocationPlan({ manifest: executionManifest, domain: DOMAIN, repoRoot: root, runKeyRegistry: registry });
  if (allocationBase.runId !== RUN_ID || allocationBase.runKey !== RUN_KEY || allocationBase.redis.logicalDb !== 8 || allocationBase.objectStore != null) {
    throw new Error('Shimmer allocation differs from the fixed run ID, run key, Redis DB8, or no-object-store contract');
  }
  const source = buildShimmerLocalSourceManifest({ repoRoot: root });
  const executionCode = buildExecutionCodeIdentity(root);
  const redisPassword = readPrivateEnvFile(path.join(root, PRIVATE_ROOT, 'redis/redis.auth'));
  const preflight = await runShimmerReadOnlyPreflight({ config, allocation: allocationBase, executionManifest, redisPassword });
  const allocation = Object.freeze({ ...allocationBase, preflight: Object.freeze({ status: 'ready', observedAt: preflight.checkedAt }) });
  const formalFingerprintsBefore = await readFormalScopeFingerprints(config);
  const privatePaths = buildShimmerPrivatePaths({ runKey: allocation.runKey });
  const sourceManifestRelativePath = privatePaths.sourceManifest;
  const sourceManifestPath = path.join(root, sourceManifestRelativePath);
  const sourceManifestSha256 = writePrivateJson(sourceManifestPath, source.sourceManifest);
  const sourceStateRelativePath = privatePaths.sourceState;
  const sourceStatePath = path.join(root, sourceStateRelativePath);
  writePrivateJson(sourceStatePath, {
    status: 'completed',
    runId: RUN_ID,
    runKey: allocation.runKey,
    sourceMode: source.sourceManifest.sourceMode,
    wikiUnchanged: false,
    generationId: source.sourceManifest.generationId,
    generatedAt: source.sourceManifest.generatedAt,
  });
  const acceptanceDirectory = path.join(root, allocation.automaticArtifactRoot, 'acceptance-runs', `shimmer-local-offline-${Date.now()}`);
  fs.mkdirSync(acceptanceDirectory, { recursive: true, mode: 0o700 });
  let liveResult;
  let liveError = null;
  let dependencyBuild = null;
  try {
    liveResult = await runLiveAutomationAcceptance({
      profile: 't1',
      runId: RUN_ID,
      mysql: { host: config.database.host, port: Number(config.database.port), username: config.database.username, password: config.database.password },
      redis: { host: allocation.redis.host, port: allocation.redis.port, password: redisPassword, logicalDb: allocation.redis.logicalDb },
      privateDirectory: acceptanceDirectory,
      maxRowsPerTable: 0,
      scope: 'shimmer-canonical-isolated',
      isolatedAllocation: allocation,
      dependencyManifest: null,
      dependencyManifestFactory: async ({ databases, readonlyClient }) => {
        dependencyBuild = await buildFreshShimmerDependencyManifest({
          source,
          databases,
          readonlyClient,
          dependencyPath: path.join(root, privatePaths.dependencyManifest),
        });
        return dependencyBuild.manifest;
      },
      acceptanceExecutor: async (context) => {
        const bundle = source.bundle;
        const db = { host: context.mysql.host, port: Number(context.mysql.port), user: context.mysql.username, password: context.mysql.password, database: context.databases.local, dateStrings: true };
        const connection = await mysqlModule.createConnection(db);
        const target = { host: db.host, port: db.port, database: db.database, serverUuid: context.manifest.serverIdentity.serverUuid };
        let transactionOpen = false;
        let importSummary;
        try {
          await connection.query('SET NAMES utf8mb4');
          const initial = await readTargetShimmerScope(connection);
          assertScopeIsEmpty(initial);
          const preview = buildShimmerImportPreview({ bundle, target, existing: {} });
          await connection.beginTransaction();
          transactionOpen = true;
          importSummary = await applyBundleChanges({ bundle, connection });
          const transactionReadback = await loadCurrentShimmerScope(connection, bundle);
          assertShimmerImportScopeMatchesPreview({ after: transactionReadback, preview });
          assertScopeCounts(transactionReadback, source.sourceManifest.scopeCounts);
          await connection.commit();
          transactionOpen = false;
        } catch (error) {
          if (transactionOpen) {
            try { await connection.rollback(); } catch (rollbackError) { error.message += `; rollback failed: ${rollbackError.message}`; }
          }
          throw error;
        } finally { await connection.end(); }
        const independent = await mysqlModule.createConnection(db);
        let independentScope;
        try {
          independentScope = await readTargetShimmerScope(independent);
          assertScopeCounts(independentScope, source.sourceManifest.scopeCounts);
          const independentNormalized = await loadCurrentShimmerScope(independent, bundle);
          assertShimmerImportScopeMatchesPreview({ after: independentNormalized, preview: buildShimmerImportPreview({ bundle, target, existing: {} }) });
        } finally { await independent.end(); }
        const counts = scopeCounts(independentScope);
        const rowHashes = scopeRowHashes(independentScope);
        const apiExpected = buildApiExpected({ scope: independentScope, source });
        return Object.freeze({
          status: 'passed',
          sourceMode: source.sourceManifest.sourceMode,
          wikiUnchanged: false,
          generationId: source.sourceManifest.generationId,
          dataBundleSha256: source.sourceManifest.dataBundleSha256,
          sourceManifestSha256,
          dependencyManifestSha256: dependencyBuild.manifestSha256,
          dependencyResolution: dependencyBuild.resolution,
          sourceCounts: source.sourceManifest.scopeCounts,
          readback: Object.freeze({ counts, rowHashes }),
          apiExpected,
          importSummary,
          formalDatabaseWrites: false,
        });
      },
      isolatedApiLifecycleFactory: async ({ manifest, adapter }) => {
        const credentials = buildRunOwnedApiCredentials({
          mysql: { host: allocation.mysql.host, port: allocation.mysql.port },
          apiAccount: adapter.apiAccounts.apiReadonly,
          redisPassword,
          runKey: allocation.runKey,
        });
        return buildIsolatedApiLifecycle({
          allocation,
          mode: 'consumer-readback',
          credentials,
          migrationEvidence: manifest.migrationEvidence,
          sourceManifestPath,
          sourceStatePath,
          routes: buildApiRoutes(),
          validateResponse: validateShimmerApiResponse,
        });
      },
    });
  } catch (error) {
    liveError = error;
  }
  let formalFingerprintsAfter = null;
  let formalFingerprintsUnchanged = false;
  let cleanup = null;
  const postflightErrors = [];
  try {
    formalFingerprintsAfter = await readFormalScopeFingerprints(config);
    formalFingerprintsUnchanged = canonicalJson(formalFingerprintsBefore) === canonicalJson(formalFingerprintsAfter);
    if (!formalFingerprintsUnchanged) postflightErrors.push(new Error('Shimmer isolated T1 changed formal Shimmer-owned scope fingerprints'));
  } catch (error) {
    postflightErrors.push(error);
  }
  try {
    cleanup = await verifyShimmerCleanup({ config, allocation, redisPassword });
    if (!cleanup.passed) postflightErrors.push(new Error('Shimmer isolated T1 cleanup did not pass'));
  } catch (error) {
    cleanup = { passed: false, error: String(error?.message ?? error) };
    postflightErrors.push(error);
  }
  if (liveResult && (liveResult.status !== 'passed' || liveResult.cleanupPassed !== true)) {
    postflightErrors.push(new Error('Shimmer T1 acceptance or run-owned cleanup status is not passed'));
  }
  if (liveResult && liveResult.isolatedApi?.start?.jarSha256 !== executionCode.catalogApiJarSha256) {
    postflightErrors.push(new Error('Shimmer API runtime JAR hash differs from the preflight code identity'));
  }
  const failures = [...(liveError ? [liveError] : []), ...postflightErrors];
  if (failures.length) {
    const error = failures.length === 1 ? failures[0] : new AggregateError(failures, 'Shimmer isolated T1 failed and postflight found additional problems');
    const failureArtifact = buildShimmerFailureArtifact({
      source,
      sourceManifestSha256,
      preflight,
      formalFingerprintsBefore,
      formalFingerprintsAfter,
      cleanup,
      acceptanceDirectory: path.relative(root, acceptanceDirectory),
      dependencyBuild,
      error,
      executionCode,
    });
    const attemptId = `${Date.now()}-${process.pid}`;
    const failureReportPath = path.join(root, EXECUTION_ROOT, DOMAIN, RUN_KEY, 'attempts', attemptId, 'isolated-real-ingestion.failed.json');
    const failureReportSha256 = writeEvidence(failureReportPath, failureArtifact);
    error.message = `${error.message}; failure evidence: ${path.relative(root, failureReportPath)} (${failureReportSha256})`;
    throw error;
  }
  const execution = liveResult.acceptance ?? liveResult;
  const artifact = {
    schemaVersion: 1,
    reportKind: 'eight_domain_shimmer_isolated_t1',
    status: liveResult.status === 'passed' && liveResult.cleanupPassed === true && cleanup.passed ? 'passed' : 'failed',
    maintainedChainStatus: liveResult.status === 'passed' && liveResult.cleanupPassed === true ? 'passed' : 'failed',
    sourceCoverageStatus: 'complete',
    stableReferenceCoverageStatus: 'complete',
    typedReferences: {
      itemGroupReferences: dependencyBuild.resolution.itemGroupReferences,
      noneReferences: dependencyBuild.resolution.noneReferences,
      status: 'preserved-as-typed-source-facts',
    },
    domain: DOMAIN,
    runId: RUN_ID,
    runKey: RUN_KEY,
    sourceMode: source.sourceManifest.sourceMode,
    wikiUnchanged: false,
    source: source.sourceManifest,
    sourceManifestSha256,
    executionCode,
    dependencyManifestSha256: dependencyBuild?.manifestSha256 ?? null,
    dependencyManifestFileSha256: dependencyBuild?.fileSha256 ?? null,
    dependencySeedEvidence: liveResult.dependencySeedEvidence ?? null,
    dependencyResolution: dependencyBuild?.resolution ?? null,
    unresolvedReferenceHistory: { priorGenerationId: '51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd', priorReportedCount: 796, reusedForCurrentPin: false },
    formalDatabaseWrites: false,
    formalFingerprintsUnchanged,
    formalFingerprints: { before: formalFingerprintsBefore, after: formalFingerprintsAfter },
    preflight,
    execution: {
      status: execution.status,
      cleanupPassed: liveResult.cleanupPassed,
      readback: execution.acceptance?.readback ?? execution.readback ?? null,
      apiReadback: readbackApiSummary(liveResult.isolatedApi?.readback ?? execution.isolatedApi?.readback),
      apiRuntime: liveResult.isolatedApi ? {
        mode: liveResult.isolatedApi.start?.mode,
        jarSha256: liveResult.isolatedApi.start?.jarSha256,
        pid: liveResult.isolatedApi.start?.pid,
        port: liveResult.isolatedApi.start?.port,
        stopped: liveResult.isolatedApi.stop?.stopped,
        cleanupVerified: liveResult.isolatedApi.stop?.cleanupVerified,
      } : null,
      migrationEvidence: liveResult.migrationEvidence ?? null,
      apiAccountGrantEvidence: liveResult.apiAccountGrantEvidence ?? null,
    },
    imageBinaryStatus: 'not-applicable',
    v2AutomaticIngestionStatus: 'not-run-by-request',
    productionReadinessStatus: 'blocked',
    cleanup,
  };
  const reportPath = path.join(root, EXECUTION_ROOT, DOMAIN, RUN_KEY, 'isolated-real-ingestion.json');
  const reportSha256 = writeEvidence(reportPath, artifact);
  fs.rmSync(acceptanceDirectory, { recursive: true, force: true });
  return Object.freeze({ status: artifact.status, reportPath, reportSha256, cleanup, artifact });
}

function readPrivateEnvFile(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Shimmer Redis auth file must be a private ordinary file');
  return fs.readFileSync(filePath, 'utf8').trim();
}

async function runShimmerReadOnlyPreflight({ config, allocation, executionManifest, redisPassword }) {
  const connection = await mysqlModule.createConnection({ ...databaseCredentials(config), database: 'terria_v1_local', dateStrings: true, connectTimeout: 3000 });
  let serverUuid; let formalSchemas; let automationSchemas; let runAccounts;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const [formal] = await connection.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${FORMAL_SCHEMAS.map(() => '?').join(',')}) ORDER BY schema_name`, FORMAL_SCHEMAS);
    const [automation] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const names = runAccountNames();
    const accounts = [...Object.values(names.accounts), ...Object.values(names.isolatedApiAccounts)];
    const [users] = await connection.query(`SELECT User AS username FROM mysql.user WHERE User IN (${accounts.map(() => '?').join(',')}) ORDER BY User`, accounts);
    serverUuid = server.serverUuid ?? server.SERVER_UUID;
    formalSchemas = formal.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    automationSchemas = automation.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    runAccounts = users.map((row) => row.username ?? row.USERNAME);
    await connection.rollback();
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally { await connection.end(); }
  if (serverUuid !== allocation.mysql.serverUuid || formalSchemas.sort().join(',') !== [...FORMAL_SCHEMAS].sort().join(',')
      || automationSchemas.length || runAccounts.length) throw new Error('Shimmer MySQL server/schema/account preflight failed');
  const leasePath = path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json');
  const lease = readJsonOrdinary(leasePath, 'Shimmer Redis process lease');
  const leaseStat = fs.statSync(leasePath);
  if ((leaseStat.mode & 0o077) !== 0 || lease.value.status !== 'ready' || lease.value.host !== allocation.redis.host
      || Number(lease.value.port) !== allocation.redis.port || lease.value.binarySha256 !== executionManifest.redis.binarySha256
      || readProcessStartIdentity(Number(lease.value.pid)) !== String(lease.value.processStartIdentity)) throw new Error('Shimmer Redis process lease identity mismatch');
  if (redisCommand(redisPassword, 8, 'PING') !== 'PONG') throw new Error('Shimmer Redis DB8 is unavailable');
  const redisSizes = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const database = index + 1;
    return [database, Number(redisCommand(redisPassword, database, 'DBSIZE'))];
  }));
  if (Object.values(redisSizes).some((size) => size !== 0)
      || !/^appendonly\s+no$/im.test(redisCommand(redisPassword, 8, 'CONFIG', 'GET', 'appendonly'))) throw new Error(`Shimmer Redis allocated DBs are not clean: ${JSON.stringify(redisSizes)}`);
  await assertPortFree(allocation.api.host, allocation.api.port);
  const processRows = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
  const activeWriters = findActiveShimmerWriters({ processRows });
  if (activeWriters.length) throw new Error(`Shimmer writer conflict: PIDs ${activeWriters.join(',')}`);
  return Object.freeze({ status: 'ready', checkedAt: new Date().toISOString(), mysql: { serverUuid, formalSchemas, automationSchemas, existingRunAccounts: runAccounts }, redis: { sizes: redisSizes, logicalDb: allocation.redis.logicalDb, ping: 'PONG', appendOnly: false }, api: { host: allocation.api.host, port: allocation.api.port, free: true }, activeWriters: 0, objectStore: null });
}

async function verifyShimmerCleanup({ config, allocation, redisPassword } = {}) {
  const connection = await mysqlModule.createConnection(databaseCredentials(config));
  try {
    const names = runAccountNames();
    const schemas = Object.values(names.databases);
    const accounts = [...Object.values(names.accounts), ...Object.values(names.isolatedApiAccounts)];
    const [remainingSchemas] = await connection.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (${schemas.map(() => '?').join(',')}) ORDER BY schema_name`, schemas);
    const [remainingAccounts] = await connection.query(`SELECT User AS username FROM mysql.user WHERE User IN (${accounts.map(() => '?').join(',')}) ORDER BY User`, accounts);
    const schemaNames = remainingSchemas.map((row) => row.schema_name ?? row.SCHEMA_NAME);
    const accountNames = remainingAccounts.map((row) => row.username ?? row.USERNAME);
    if (schemaNames.length || accountNames.length) throw new Error(`Shimmer run-owned MySQL cleanup failed: ${JSON.stringify({ schemaNames, accountNames })}`);
    const redisSizes = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, Number(redisCommand(redisPassword, index + 1, 'DBSIZE'))]));
    if (Object.values(redisSizes).some((size) => size !== 0)) throw new Error(`Shimmer Redis cleanup failed: ${JSON.stringify(redisSizes)}`);
    await assertPortFree(allocation.api.host, allocation.api.port);
    return Object.freeze({ passed: true, remainingSchemas: schemaNames, remainingAccounts: accountNames, redisSizes, apiPortFree: true, objectStore: null });
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.run !== 'true') throw new Error('run the bounded Shimmer T1 baseline explicitly with --run=true');
  runShimmerFullCanonicalIsolated().then((result) => {
    process.stdout.write(`${JSON.stringify({ status: result.status, reportPath: result.reportPath, reportSha256: result.reportSha256, cleanup: result.cleanup }, null, 2)}\n`);
    if (result.status !== 'passed') process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`Shimmer isolated T1 failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
