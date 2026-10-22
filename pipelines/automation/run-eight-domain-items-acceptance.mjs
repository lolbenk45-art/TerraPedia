#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { openDurableRunKeyRegistry } from './automation-database-contract.mjs';
import { buildEightDomainAllocationPlan } from './eight-domain-isolated-allocation.mjs';
import { buildExecutionCodeBundleManifest, verifyExecutionCodeBundleManifest } from './eight-domain-execution-code-bundle.mjs';
import { createMysqlCommandClient } from './mysql-automation-acceptance-adapter.mjs';
import { assertItemsDependencyManifest, buildItemsDependencyManifest, MAINT_ITEM_CATEGORY_COLUMNS } from './eight-domain-items-dependency-manifest.mjs';
import {
  buildItemsSourceManifest,
  ITEMINFO_LANDING_COLUMNS,
  ITEMS_SOURCE_PATHS,
} from './eight-domain-items-source-manifest.mjs';
import {
  buildIsolatedApiLifecycle,
  buildRunOwnedApiCredentials,
  runLiveAutomationAcceptance,
} from './run-live-automation-acceptance.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { runStandardizedImportWithConnection } from '../import/import-standardized-to-db.mjs';
import { runLandingImport } from '../landing/import-source-dataset-landings.mjs';
import { verifyExactDependencyTargets } from './eight-domain-dependency-seeder.mjs';
import { runSync as runRelationSync } from '../relation/sync-maint-to-relation.mjs';
import { runProjectionToLocalCoreSync } from '../relation/sync-projection-to-local-core-tables.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXECUTION_ROOT = 'reports/runtime/eight-domain-production-readiness/20261017';
const PRIVATE_ROOT = '.local/tmp/eight-domain-production-readiness/20261017';
export const EIGHT_DOMAIN_ITEMS_SOURCE_MANIFEST_RELATIVE_PATH = `${PRIVATE_ROOT}/source-manifests/items.selection-manifest.v3.json`;
export const EIGHT_DOMAIN_ITEMS_DEPENDENCY_MANIFEST_RELATIVE_PATH = `${PRIVATE_ROOT}/source-manifests/items.dependencies.v3.json`;
const API_JAR_RELATIVE_PATH = 'services/catalog-api/target/terrapedia-catalog-api-1.0.0.jar';
const FORMAL_SCHEMAS = ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation', 'terria_v1_v55_rehearsal'];
const HASH = /^sha256:[a-f0-9]{64}$/;
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
const LOCAL_NPC_COLUMNS = Object.freeze([
  'id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'sub_name', 'sub_name_zh', 'image_url',
  'category_id', 'game_period_id', 'game_model_id', 'is_boss', 'boss_group_id', 'boss_role', 'is_friendly',
  'is_town_npc', 'behavior_notes', 'net_id', 'npc_type', 'ai_style', 'damage', 'defense', 'life_max',
  'knock_back_resist', 'width', 'height', 'scale', 'value', 'buff_immune', 'raw_json', 'status', 'deleted',
]);
const ITEM_SOURCE_BUNDLE_TABLES = Object.freeze([
  'maint_item_images', 'maint_item_recipes', 'maint_item_sources', 'maint_item_biomes',
]);
const require = createRequire(import.meta.url);

export function buildRelationSourceLandingEntry({ source, context } = {}) {
  const manifest = assertSourceManifest(source);
  const payload = { ...manifest.itemRelations.selectedRows, snapshots: [] };
  const serialized = JSON.stringify(payload);
  const contentHash = createHash('sha256').update(serialized, 'utf8').digest('hex');
  const producerRunKey = String(context?.manifest?.runKey ?? context?.runKey ?? '').trim();
  if (!/^e8p_[0-9a-f]{16}$/.test(producerRunKey)) throw new Error('Items relation landing requires the exact runKey');
  return Object.freeze({
    datasetType: 'item_relations_bundle_raw',
    provider: 'terrapedia.generated',
    sourceKind: 'generated_bundle',
    sourceKey: `generated.item_relations_bundle:${producerRunKey}`,
    sourcePage: `item-relations.bundle:${producerRunKey}`,
    sourceLocator: `run://${producerRunKey}/item-relations.bundle.json`,
    sourceRevisionTimestamp: manifest.landing.sourceRevisionTimestamp ?? null,
    fetchedAt: manifest.landing.sourceRevisionTimestamp ?? null,
    parsedAt: manifest.landing.sourceRevisionTimestamp ?? null,
    parseStatus: 'ok',
    payloadBytes: Buffer.byteLength(serialized, 'utf8'),
    contentHash,
    payload,
    artifactRole: 'legacy_compat',
    producerId: 'eight-domain-items-acceptance',
    producerVersion: 'v3',
    producerRunKey,
  });
}

function mysqlModule() {
  try { return require('mysql2/promise'); } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    return createRequire(path.join(ROOT, 'apps/admin-console/package.json'))('mysql2/promise');
  }
}

function createRedisCommandClient({ host, port, password }) {
  return Object.freeze({
    async command(logicalDb, ...commands) {
      if (host !== '127.0.0.1' || Number(port) !== 16380 || !Number.isInteger(logicalDb) || logicalDb < 1 || logicalDb > 8) {
        throw new Error('Items Redis command target differs from the fixed isolated allocation');
      }
      const output = execFileSync('redis-cli', ['--raw', '-h', host, '-p', String(port), '-n', String(logicalDb), ...commands.map(String)], {
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, REDISCLI_AUTH: password },
      });
      return String(output).trim();
    },
  });
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return hashBytes(JSON.stringify(canonicalValue(value)));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertSourceManifest(manifest) {
  if (manifest?.manifestKind !== 'eight_domain_items_source' || manifest.runId !== 'e8pr-items-20261017-v1'
      || !HASH.test(manifest.manifestSha256 ?? '') || !Array.isArray(manifest.selectedIds)
      || manifest.selectedCount !== manifest.selectedIds.length || !manifest.itemRelations?.selectedRows
      || manifest.itemRelations.excludedSnapshots?.missingPartCount !== 31) {
    throw new Error('Items source manifest identity, selected rows, or snapshots exclusion is invalid');
  }
  const { manifestSha256, ...body } = manifest;
  if (hashJson(body) !== manifestSha256) throw new Error('Items source manifest canonical content hash drift');
  return manifest;
}

function assertPrivateOrdinaryJson(filePath, label) {
  const target = path.resolve(filePath);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error(`${label} must be a private ordinary file`);
  const bytes = fs.readFileSync(target);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function writeOrVerifyPrivateJson(filePath, value, label) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (fs.existsSync(target)) {
    const existing = assertPrivateOrdinaryJson(target, label);
    if (!existing.bytes.equals(bytes)) throw new Error(`${label} exists with different content`);
    return { path: target, sha256: hashBytes(bytes) };
  }
  const fd = fs.openSync(target, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
  fs.chmodSync(target, 0o600);
  return { path: target, sha256: hashBytes(bytes) };
}

function repositoryFile(repoRoot, relative, label) {
  const root = path.resolve(repoRoot);
  const candidate = String(relative ?? '').replaceAll('\\', '/');
  if (!candidate || path.isAbsolute(candidate) || candidate.split('/').includes('..')) throw new Error(`${label} path must stay inside repoRoot`);
  const target = path.resolve(root, candidate);
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`${label} path escapes repoRoot`);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return target;
}

function assertSourceFiles(repoRoot, source) {
  if (!Array.isArray(source.sourceFiles) || source.sourceFiles.length !== 4) throw new Error('Items source manifest must bind exactly four standardized files');
  for (const entry of source.sourceFiles) {
    const filePath = repositoryFile(repoRoot, entry.path, `source ${entry.entity}`);
    const bytes = fs.readFileSync(filePath);
    if (hashBytes(bytes) !== entry.sha256) throw new Error(`Items source file hash drift: ${entry.path}`);
    const payload = JSON.parse(bytes.toString('utf8'));
    if (entry.entity === 'items' || entry.entity === 'item_pages') {
      if (!Array.isArray(payload.records) || payload.records.length !== entry.recordCount) throw new Error(`Items source record count drift: ${entry.path}`);
    }
  }
  const metaPath = repositoryFile(repoRoot, source.itemRelations.metaPath, 'Item relation metadata');
  if (hashBytes(fs.readFileSync(metaPath)) !== source.itemRelations.metaSha256) throw new Error('Item relation metadata hash drift');
  for (const part of source.itemRelations.partHashes) {
    const partPath = repositoryFile(repoRoot, part.path, `Item relation ${part.group}`);
    const bytes = fs.readFileSync(partPath);
    if (hashBytes(bytes) !== part.sha256) throw new Error(`Item relation part hash drift: ${part.path}`);
    const payload = JSON.parse(bytes.toString('utf8'));
    const rows = Array.isArray(payload) ? payload : Object.values(payload);
    if (rows.length !== part.recordCount || rows.length !== part.declaredRecordCount) throw new Error(`Item relation part count drift: ${part.path}`);
  }
  return true;
}

export function buildItemsImportInput(manifest, { localNpcRows = [] } = {}) {
  const source = assertSourceManifest(manifest);
  const rows = requireObject(source.itemRelations.selectedRows, 'selected Item relation rows');
  const itemSources = rows.itemSources.map((row) => ({ ...row }));
  const localNpcs = new Map();
  for (const npc of localNpcRows) {
    const key = String(npc.internal_name ?? '').trim().toLowerCase();
    if (!key || localNpcs.has(key)) throw new Error('local NPC source dependencies have duplicate or missing internal_name');
    localNpcs.set(key, npc);
  }
  for (const sourceRow of itemSources) {
    if (String(sourceRow.sourceRefType ?? '').trim().toLowerCase() !== 'npc') continue;
    const sourceRefName = String(sourceRow.sourceRefInternalName ?? sourceRow.sourceRefName ?? '').trim();
    const npc = localNpcs.get(sourceRefName.toLowerCase());
    if (npc && String(npc.internal_name ?? '').trim() === sourceRefName) {
      sourceRow.sourceRefInternalName = sourceRefName;
      sourceRow.sourceRefId = Number(npc.id);
      sourceRow.sourceRefResolution = 'exact_internal_name';
    }
  }
  const relations = {
    biomes: rows.biomes,
    itemBiomes: rows.itemBiomes,
    itemImages: rows.itemImages,
    itemSources,
    recipes: rows.recipes,
    snapshots: [],
  };
  const sourceRows = {
    biomes: rows.biomes,
    itemBiomes: rows.itemBiomes,
    itemImages: rows.itemImages,
    itemSources: rows.itemSources,
    recipes: rows.recipes,
    snapshots: [],
  };
  if (hashJson(sourceRows) !== source.itemRelations.relationBundleSha256) throw new Error('Items relation bundle hash drift');
  for (const group of ['biomes', 'itemBiomes', 'itemImages', 'itemSources', 'recipes']) {
    if (hashJson(rows[group]) !== source.itemRelations.selectedRowsSha256?.[group]) throw new Error(`Items selected relation group hash drift: ${group}`);
    if (source.itemRelations.selectedRecordCounts?.[group] !== rows[group]?.length) throw new Error(`Items selected relation count drift: ${group}`);
  }
  return Object.freeze({
    itemsDataset: { entity: 'items', totalRecords: source.selectedItems.length, records: source.selectedItems },
    relationsDataset: { entity: 'item_relations', records: relations },
    relationBundleSha256: source.itemRelations.relationBundleSha256,
    snapshotsExcluded: true,
  });
}

function chooseReadbackItem(source) {
  const { selectedItems, itemRelations } = source;
  const groups = itemRelations.selectedRows;
  return selectedItems.map((item) => {
    const name = String(item.internalName).toLowerCase();
    const recipes = groups.recipes.filter((row) => String(row.resultInternalName ?? '').toLowerCase() === name).length;
    const sources = groups.itemSources.filter((row) => String(row.itemInternalName ?? '').toLowerCase() === name).length;
    const images = groups.itemImages.filter((row) => String(row.itemInternalName ?? '').toLowerCase() === name).length;
    const biomes = groups.itemBiomes.filter((row) => String(row.itemInternalName ?? '').toLowerCase() === name).length;
    return { item, score: (recipes > 0 ? 8 : 0) + (sources > 0 ? 4 : 0) + (images > 0 ? 2 : 0) + biomes };
  }).sort((a, b) => b.score - a.score || Number(a.item.id) - Number(b.item.id))[0].item;
}

export function buildItemsApiRoutes(manifest) {
  const item = chooseReadbackItem(assertSourceManifest(manifest));
  const id = String(item.id);
  return [
    { routeId: 'public-item-detail', params: { id } },
    { routeId: 'item-detail', params: { id } },
    { routeId: 'public-item-sources', params: { id } },
    { routeId: 'public-item-images', params: { id } },
    { routeId: 'admin-item-recipes', params: { id } },
  ];
}

export function normalizeMysqlSchemaNames(rows) {
  if (!Array.isArray(rows)) throw new TypeError('MySQL schema inventory must be an array');
  return rows.map((row, index) => {
    const name = row?.schema_name ?? row?.SCHEMA_NAME;
    if (typeof name !== 'string' || !name) throw new Error(`MySQL schema inventory row ${index} has no schema_name`);
    return name;
  }).sort((left, right) => left.localeCompare(right));
}

export function buildItemsAcceptanceEvidence({ sourceManifest, allocation, codeBundle, codeBundlePath, preflight, execution } = {}) {
  const source = assertSourceManifest(sourceManifest);
  requireObject(allocation, 'Items acceptance allocation');
  requireObject(execution, 'Items acceptance execution result');
  if (allocation.domain !== 'items' || allocation.runId !== source.runId
      || !HASH.test(codeBundle?.bundleSha256 ?? '') || !/^[a-f0-9]{40}$/.test(codeBundle?.baseCommit ?? '')
      || !Number.isSafeInteger(codeBundle?.fileCount) || codeBundle.fileCount < 1) {
    throw new Error('Items acceptance evidence run or code bundle identity is invalid');
  }
  const acceptance = requireObject(execution.acceptance, 'Items maintained acceptance result');
  const sourceHashes = source.sourceFiles.map(({ path: filePath, sha256, recordCount }) => ({ path: filePath, sha256, recordCount }));
  const apiReadback = Array.isArray(execution.isolatedApi?.readback) ? execution.isolatedApi.readback : [];
  const apiReadbackPassed = apiReadback.length > 0 && apiReadback.every((row) => row.status === 200);
  return Object.freeze({
    schemaVersion: 1,
    operation: 'eight-domain-items-isolated-real-ingestion',
    status: execution.status,
    generatedAt: new Date().toISOString(),
    domain: allocation.domain,
    runId: allocation.runId,
    runKey: allocation.runKey,
    sourceMode: allocation.source?.mode ?? 'repository-frozen',
    sourceManifestSha256: source.manifestSha256,
    sourceHashes,
    selectedCount: source.selectedCount,
    selectedIdsSha256: source.selectedIdsSha256,
    relationBundleSha256: source.itemRelations.relationBundleSha256,
    relationGroupCounts: source.itemRelations.selectedRecordCounts,
    recipeDependencyItemCount: source.itemRelations.recipeDependencyItemIds.length,
    sourceNpcReferenceCount: source.itemRelations.npcReferenceNames.length,
    dependencyManifestSha256: execution.dependencySeedEvidence?.manifestSha256 ?? null,
    codeBundle: Object.freeze({
      path: codeBundlePath,
      bundleSha256: codeBundle.bundleSha256,
      baseCommit: codeBundle.baseCommit,
      fileCount: codeBundle.fileCount,
    }),
    preflight: preflight ? Object.freeze({
      status: preflight.status,
      checkedAt: preflight.checkedAt,
      mysql: preflight.mysql,
      redis: preflight.redis,
      minio: preflight.minio,
      api: preflight.api,
      activeCrawlerWriters: preflight.activeCrawlerWriters,
      jarSha256: preflight.jarSha256,
      formalDatabaseWrites: preflight.formalDatabaseWrites,
      schemaOrAccountWrites: preflight.schemaOrAccountWrites,
    }) : null,
    resources: Object.freeze({
      mysql: Object.freeze({ host: allocation.mysql.host, port: allocation.mysql.port, serverUuid: allocation.mysql.serverUuid, databases: allocation.mysql.databases }),
      redis: Object.freeze({ host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb }),
      api: Object.freeze({ host: allocation.api.host, port: allocation.api.port }),
      objectStore: allocation.objectStore == null ? null : Object.freeze({ endpoint: allocation.objectStore.endpoint, bucket: allocation.objectStore.bucket, objectPrefix: allocation.objectStore.objectPrefix }),
    }),
    maintainedChainStatus: acceptance.maintainedChainStatus ?? (execution.status === 'passed' ? 'passed' : 'failed'),
    apiReadbackStatus: apiReadbackPassed ? 'passed' : (execution.isolatedApi ? 'failed' : null),
    apiReadback: Object.freeze(apiReadback.map((row) => Object.freeze({
      routeId: row.routeId,
      status: row.status,
      bodySha256: row.bodySha256,
      responseValidation: row.responseValidation,
    }))),
    apiStoppedAndVerified: execution.isolatedApi?.stop?.stopped === true
      && execution.isolatedApi?.stop?.cleanupVerified === true,
    v2AutomaticIngestionStatus: acceptance.v2AutomaticIngestionStatus ?? 'blocked',
    cleanupPassed: execution.cleanupPassed === true,
    formalDatabaseWrites: false,
    productionSourceDelta: false,
  });
}

function selectedNpcRowsForImport(dependencyManifest, targetClient, database) {
  const dependency = dependencyManifest.dependencies.find((entry) => entry.id === 'stable-item-source-npc-dependencies-local');
  if (!dependency) return Promise.resolve([]);
  const ids = dependency.keyValues.map((key) => Number(key.id));
  const fields = dependency.columns.flatMap((column) => [`'${column}'`, sqlIdentifier(column)]).join(', ');
  const keyList = ids.map(String).join(',');
  return targetClient.query(`SELECT JSON_OBJECT(${fields}) FROM \`npcs\` WHERE \`id\` IN (${keyList}) ORDER BY \`id\``, database)
    .then((output) => parseJsonRows(output, 'run-local NPC source dependencies'));
}

function normalizeLandingForMaint(landing) {
  return {
    ...landing,
    dataset_type: landing.dataset_type ?? landing.datasetType,
    source_key: landing.source_key ?? landing.sourceKey,
    source_page: landing.source_page ?? landing.sourcePage,
    source_revision_timestamp: landing.source_revision_timestamp ?? landing.sourceRevisionTimestamp,
    content_hash: landing.content_hash ?? String(landing.contentHash ?? '').replace(/^sha256:/, ''),
    payload_json: landing.payload_json ?? landing.payloadJson,
  };
}

async function collectMaintainedRelationInputs({ connection, databases, source, relationLanding, dependencyManifest } = {}) {
  const selectedIds = source.selectedIds;
  const referenceIds = [...new Set([...selectedIds, ...source.itemRelations.recipeDependencyItemIds])].sort((a, b) => a - b);
  const placeholders = (values) => values.map(() => '?').join(',');
  const [maintItems] = await connection.query(
    `SELECT * FROM \`${databases.maint}\`.maint_items WHERE deleted=0 AND source_id IN (${placeholders(selectedIds)}) ORDER BY source_id`, selectedIds,
  );
  const [referenceItems] = await connection.query(
    `SELECT * FROM \`${databases.maint}\`.maint_items WHERE deleted=0 AND source_id IN (${placeholders(referenceIds)}) ORDER BY source_id`, referenceIds,
  );
  const [maintItemRecipes] = await connection.query(`SELECT * FROM \`${databases.maint}\`.maint_item_recipes WHERE deleted=0 AND landing_source_id=? ORDER BY id`, [relationLanding.id]);
  const [maintItemImages] = await connection.query(`SELECT * FROM \`${databases.maint}\`.maint_item_images WHERE deleted=0 AND landing_source_id=? ORDER BY id`, [relationLanding.id]);
  const [maintItemSources] = await connection.query(`SELECT * FROM \`${databases.maint}\`.maint_item_sources WHERE deleted=0 AND landing_source_id=? ORDER BY id`, [relationLanding.id]);
  const [maintItemBiomes] = await connection.query(`SELECT * FROM \`${databases.maint}\`.maint_item_biomes WHERE deleted=0 AND landing_source_id=? ORDER BY id`, [relationLanding.id]);
  const categoryDependency = dependencyManifest.dependencies.find((entry) => entry.id === 'selected-item-category-rows');
  let maintItemCategories = [];
  if (categoryDependency) {
    const keys = categoryDependency.keyValues.map((key) => key.record_key);
    const [rows] = await connection.query(`SELECT * FROM \`${databases.maint}\`.maint_item_categories WHERE deleted=0 AND record_key IN (${placeholders(keys)}) ORDER BY record_key`, keys);
    maintItemCategories = rows;
  }
  const npcDependency = dependencyManifest.dependencies.find((entry) => entry.id === 'stable-item-source-npc-dependencies-local');
  let referenceNpcs = [];
  if (npcDependency) {
    const keys = npcDependency.keyValues.map((row) => Number(row.id));
    const [rows] = await connection.query(`SELECT * FROM \`${databases.local}\`.npcs WHERE deleted=0 AND id IN (${placeholders(keys)}) ORDER BY id`, keys);
    referenceNpcs = rows.map((row) => ({ ...row, source_id: Number(row.source_id ?? row.game_id ?? row.id) }));
  }
  if (maintItems.length !== selectedIds.length || referenceItems.length !== referenceIds.length) throw new Error('maintained Item source/reference dependency readback is incomplete');
  return {
    input: {
      maintItems, referenceItems, referenceNpcs, maintItemCategories,
      maintItemRecipes, maintItemImages, maintItemSources, maintItemBiomes,
      relationRows: source.itemRelations.selectedRows,
      sourceBinding: { sourceId: Number(relationLanding.id), sourceKey: relationLanding.source_key, sourcePage: relationLanding.source_page, contentHash: relationLanding.contentHash },
    },
    summary: {
      maintainedItemCount: maintItems.length,
      maintainedReferenceItemCount: referenceItems.length,
      maintainedRelationCounts: { recipes: maintItemRecipes.length, itemImages: maintItemImages.length, itemSources: maintItemSources.length, itemBiomes: maintItemBiomes.length, itemCategories: maintItemCategories.length },
      exactNpcDependencyCount: referenceNpcs.length,
    },
  };
}

function sqlIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error('unsafe SQL identifier');
  return `\`${value}\``;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
}

function sqlIn(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('exact source key list cannot be empty');
  return values.map(sqlValue).join(', ');
}

function sqlScalar(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
}

function buildExactLandingInsertSql(entry) {
  const columns = entry.columns;
  const keyColumn = entry.keyColumns[0];
  if (entry.id !== 'iteminfo-landing' || keyColumn !== 'id' || entry.expectedRowCount !== 1
      || !columns.includes('payload_json') || !columns.includes('content_hash')) {
    throw new Error('exact landing seeding is restricted to the single ItemInfo landing');
  }
  const values = entry.keyValues.map((key) => columns.map((column) => (
    column === 'id' ? 'NULL' : sqlScalar(entry._sourceRows?.[0]?.[column])
  )));
  return `INSERT INTO \`${entry.target.table}\` (${columns.map(sqlIdentifier).filter((column) => column !== '`id`').join(', ')}) VALUES (${values[0].slice(1).join(', ')})`;
}

function jsonObjectSelect(columns, table, predicate, orderBy) {
  const pairs = columns.flatMap((column) => [`'${column}'`, sqlIdentifier(column)]).join(', ');
  return `SELECT JSON_OBJECT(${pairs}) FROM ${sqlIdentifier(table)} WHERE ${predicate} ORDER BY ${orderBy}`;
}

function parseJsonRows(output, label) {
  const text = String(output ?? '').trim();
  if (!text) return [];
  return text.split(/\r?\n/).map((line) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${label} query returned malformed JSON`, { cause: error }); }
  });
}

async function readRows(client, database, table, columns, keyColumn, values, { active = false } = {}) {
  const predicate = `${sqlIdentifier(keyColumn)} IN (${sqlIn(values)})${active ? ' AND `status` = 1 AND `deleted` = 0' : ''}`;
  return parseJsonRows(await client.query(jsonObjectSelect(columns, table, predicate, sqlIdentifier(keyColumn)), database), `${database}.${table}`);
}

async function buildFreshDependencyManifest({ source, databases, readonlyClient, dependencyManifestPath } = {}) {
  if (!readonlyClient || typeof readonlyClient.query !== 'function') throw new Error('Items dependency generation requires the formal read-only account');
  const landingOutput = await readonlyClient.query(jsonObjectSelect(
    ITEMINFO_LANDING_COLUMNS,
    'source_dataset_landings',
    "`dataset_type` = 'items_raw' AND `source_key` = 'wiki.module.iteminfo' AND `is_current` = 1",
    '`id`',
  ), 'terria_v1_local');
  const landingRows = parseJsonRows(landingOutput, 'current ItemInfo landing');
  if (landingRows.length !== 1) throw new Error('formal ItemInfo landing lookup must return exactly one current row');
  const expectedSourceHashes = Object.fromEntries(source.sourceFiles.map((entry) => [entry.path, entry.sha256]));
  const expectedRelationHashes = {
    [source.itemRelations.metaPath]: source.itemRelations.metaSha256,
    ...Object.fromEntries(source.itemRelations.partHashes.map((part) => [part.path, part.sha256])),
  };
  const currentSource = buildItemsSourceManifest({ repoRoot: ROOT, landing: landingRows[0], expectedSourceHashes, expectedRelationHashes });
  const fileBindingsMatch = currentSource.sourceFiles.length === source.sourceFiles.length
    && currentSource.sourceFiles.every((entry, index) => entry.path === source.sourceFiles[index]?.path
      && entry.sha256 === source.sourceFiles[index]?.sha256 && entry.recordCount === source.sourceFiles[index]?.recordCount);
  const relationPartBindingsMatch = currentSource.itemRelations.partHashes.length === source.itemRelations.partHashes.length
    && currentSource.itemRelations.partHashes.every((entry, index) => entry.path === source.itemRelations.partHashes[index]?.path
      && entry.sha256 === source.itemRelations.partHashes[index]?.sha256 && entry.recordCount === source.itemRelations.partHashes[index]?.recordCount);
  if (!fileBindingsMatch || !relationPartBindingsMatch
      || currentSource.selectedIdsSha256 !== source.selectedIdsSha256
      || currentSource.landing.sourceId !== source.landing.sourceId
      || currentSource.landing.contentHash !== source.landing.contentHash
      || currentSource.landing.sourceRevisionTimestamp !== source.landing.sourceRevisionTimestamp) {
    throw new Error('Items frozen source identity, relation part hashes, or current ItemInfo landing drifted');
  }
  const itemNames = source.selectedItems.map((item) => item.internalName);
  const itemCategories = parseJsonRows(await readonlyClient.query(jsonObjectSelect(
    MAINT_ITEM_CATEGORY_COLUMNS,
    'maint_item_categories',
    `\`item_internal_name\` IN (${sqlIn(itemNames)}) AND \`deleted\` = 0`,
    '`record_key`',
  ), 'terria_v1_maint'), 'selected maintained Item categories');
  const itemCategoryLandingIds = [...new Set(itemCategories.map((row) => Number(row.landing_source_id)))].sort((a, b) => a - b);
  if (itemCategoryLandingIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('selected Item categories contain an invalid stable landing_source_id');
  }
  const itemCategoryLandings = itemCategoryLandingIds.length === 0 ? [] : parseJsonRows(await readonlyClient.query(jsonObjectSelect(
    ITEMINFO_LANDING_COLUMNS,
    'source_dataset_landings',
    `\`id\` IN (${sqlIn(itemCategoryLandingIds)}) AND \`dataset_type\` = 'categories_raw'`,
    '`id`',
  ), 'terria_v1_local'), 'exact selected Item category landings');
  const recipeIds = source.itemRelations.recipeDependencyItemIds;
  const recipeItems = await readRows(readonlyClient, 'terria_v1_local', 'items', LOCAL_ITEM_COLUMNS, 'id', recipeIds, { active: true });
  const recipeMaintItems = await readRows(readonlyClient, 'terria_v1_maint', 'maint_items', MAINT_ITEM_COLUMNS, 'source_id', recipeIds, { active: true });
  const sourceNames = source.itemRelations.npcReferenceNames;
  let localNpcs = [];
  if (sourceNames.length > 0) {
    localNpcs = await readRows(readonlyClient, 'terria_v1_local', 'npcs', LOCAL_NPC_COLUMNS, 'internal_name', sourceNames, { active: true });
  }
  const manifest = buildItemsDependencyManifest({
    sourceManifest: source,
    databases,
    sourceRows: { iteminfoLanding: landingRows, itemCategoryLandings, itemCategories, recipeItems, recipeMaintItems, localNpcs },
  });
  assertItemsDependencyManifest(manifest, { sourceManifest: source, databases });
  const evidence = writeOrVerifyPrivateJson(dependencyManifestPath, manifest, 'Items dependency manifest');
  return Object.freeze({ manifest, sourceManifest: currentSource, path: evidence.path, sha256: evidence.sha256 });
}

function readProcessStartIdentity(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const close = stat.lastIndexOf(')');
  return stat.slice(close + 2).trim().split(/\s+/)[19] ?? '';
}

async function assertPortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function listMinioObjects(bucket) {
  const credentials = readSimpleEnv(path.join(ROOT, PRIVATE_ROOT, 'minio/minio.env'));
  const host = `http://${encodeURIComponent(credentials.MINIO_ROOT_USER)}:${encodeURIComponent(credentials.MINIO_ROOT_PASSWORD)}@127.0.0.1:19100`;
  const output = execFileSync('/home/lolben/.local/bin/mc', ['ls', '--json', '--recursive', `e8pr/${bucket}`], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, MC_CONFIG_DIR: path.join(ROOT, PRIVATE_ROOT, 'mc-config'), MC_HOST_e8pr: host },
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function runReadOnlyPreflight({ config, allocation, redisPassword, executionManifest } = {}) {
  const connection = await mysqlModule().createConnection({
    host: config.database.host,
    port: Number(config.database.port),
    user: config.database.username,
    password: config.database.password,
    database: 'terria_v1_local',
    connectTimeout: 3000,
    dateStrings: true,
  });
  let dbFacts;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[server]] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const [schemas] = await connection.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'terria_v1_automation_%' ORDER BY schema_name");
    const [formal] = await connection.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name IN (?,?,?,?) ORDER BY schema_name', FORMAL_SCHEMAS);
    dbFacts = {
      serverUuid: server.serverUuid ?? server.SERVER_UUID,
      automationSchemas: normalizeMysqlSchemaNames(schemas),
      formalSchemas: normalizeMysqlSchemaNames(formal),
    };
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { await connection.end(); }
  if (dbFacts.serverUuid !== allocation.mysql.serverUuid || dbFacts.automationSchemas.length !== 0
      || dbFacts.formalSchemas.join(',') !== FORMAL_SCHEMAS.join(',')) throw new Error('Items MySQL read-only identity/schema preflight failed');
  const redisLease = JSON.parse(fs.readFileSync(path.join(ROOT, PRIVATE_ROOT, 'redis/resource-lease.json'), 'utf8'));
  if (redisLease.status !== 'ready' || redisLease.host !== allocation.redis.host || redisLease.port !== allocation.redis.port
      || redisLease.binarySha256 !== allocation.redis.binarySha256
      || readProcessStartIdentity(Number(redisLease.pid)) !== String(redisLease.processStartIdentity)) throw new Error('Items Redis process lease identity is invalid');
  const redisClient = createRedisCommandClient({ host: allocation.redis.host, port: allocation.redis.port, password: redisPassword });
  const ping = await redisClient.command(allocation.redis.logicalDb, 'PING');
  const redisSizes = {};
  for (let logicalDb = 1; logicalDb <= 8; logicalDb += 1) {
    redisSizes[logicalDb] = Number(await redisClient.command(logicalDb, 'DBSIZE'));
  }
  const appendOnly = await redisClient.command(allocation.redis.logicalDb, 'CONFIG', 'GET', 'appendonly');
  if (ping !== 'PONG' || Object.values(redisSizes).some((size) => size !== 0)
      || !/^appendonly\s+no$/im.test(appendOnly)) throw new Error('Items Redis preflight requires all allocated DBs empty with persistence disabled');
  const minioLease = JSON.parse(fs.readFileSync(path.join(ROOT, PRIVATE_ROOT, 'minio/resource-lease.json'), 'utf8'));
  if (minioLease.status !== 'ready' || readProcessStartIdentity(Number(minioLease.pid)) !== String(minioLease.processStartIdentity)
      || minioLease.binarySha256 !== executionManifest.objectStore.binarySha256) throw new Error('run-owned MinIO process lease identity is invalid');
  const minioHealth = await fetch('http://127.0.0.1:19100/minio/health/live', { signal: AbortSignal.timeout(3000) });
  if (!minioHealth.ok) throw new Error('run-owned MinIO service is not healthy');
  const bucketRows = {};
  for (const bucket of [executionManifest.objectStore.buckets.armor_sets, executionManifest.objectStore.buckets.bosses]) {
    const objects = listMinioObjects(bucket);
    bucketRows[bucket] = { count: objects.length, listingSha256: hashBytes(objects.join('\n')) };
    if (objects.length !== 0) throw new Error(`run-owned MinIO bucket ${bucket} is not empty before the Items run`);
  }
  await assertPortFree(allocation.api.host, allocation.api.port);
  const expectedJar = executionManifest.installation?.backendJarSha256;
  const jarSha256 = hashBytes(fs.readFileSync(path.join(ROOT, API_JAR_RELATIVE_PATH)));
  if (!HASH.test(expectedJar ?? '') || jarSha256 !== expectedJar) throw new Error('catalog API JAR differs from its installed artifact manifest');
  const processLines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const writerPattern = /(?:fetch-wiki-item|item-pages.*(?:crawl|refresh)|crawler.*worker|(?:run|start).*automation.*(?:sweep|worker))/i;
  const activeWriters = processLines.filter((line) => {
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    return pid !== process.pid && writerPattern.test(line);
  });
  if (activeWriters.length > 0) throw new Error('an active crawler or automation writer conflicts with the Items run');
  return Object.freeze({
    status: 'ready',
    checkedAt: new Date().toISOString(),
    mysql: { serverUuid: dbFacts.serverUuid, formalSchemas: dbFacts.formalSchemas, automationSchemaCount: 0, readOnlyTransaction: true },
    redis: { host: allocation.redis.host, port: allocation.redis.port, logicalDb: allocation.redis.logicalDb, databaseSizes: redisSizes, ping, appendOnly: false, processStartIdentity: redisLease.processStartIdentity },
    minio: { endpoint: executionManifest.objectStore.endpoint, buckets: bucketRows },
    api: { host: allocation.api.host, port: allocation.api.port, free: true },
    activeCrawlerWriters: 0,
    jarSha256,
    formalDatabaseWrites: false,
    schemaOrAccountWrites: false,
  });
}

function stableSourceKey(source) {
  const item = chooseReadbackItem(source);
  return String(item.internalName).trim().toLowerCase();
}

function normalizePublicSourceRefName(value) {
  const text = String(value ?? '').trim();
  return text.replace(/^(.+?) \1(?=\s|\(|$)/, '$1').replace(/\s+for$/i, '').trim().toLowerCase();
}

function normalizePublicSourceText(value) {
  const text = String(value ?? '').trim();
  const lower = text.toLowerCase();
  return lower.includes('terraria.wiki.gg') || lower.includes('static.wikia.nocookie.net') ? '' : lower;
}

export function sourceEvidenceKey(row) {
  return [
    row.sourceType,
    row.sourceRefType,
    normalizePublicSourceRefName(row.sourceRefName),
    row.quantityText,
    row.chanceText,
    normalizePublicSourceText(row.conditions),
    row.biomeCode,
  ].map((value) => String(value ?? '').trim().toLowerCase()).join('|');
}

function validateItemsApiResponse({ routeId, payload, acceptance } = {}) {
  const body = requireObject(payload, `Items API ${routeId} response`);
  const data = body.data;
  const expected = requireObject(acceptance?.apiExpectations, 'Items API acceptance expectations');
  if (routeId === 'public-item-detail' || routeId === 'item-detail') {
    const item = requireObject(data, `Items API ${routeId} data`);
    if (Number(item.id) !== Number(expected.itemId) || String(item.internalName ?? '').toLowerCase() !== expected.internalName.toLowerCase()
        || String(item.name ?? '').toLowerCase() !== expected.name.toLowerCase()) throw new Error(`Items API ${routeId} identity differs from stable DB readback`);
    return { identityVerified: true, itemId: Number(item.id) };
  }
  if (!Array.isArray(data)) throw new Error(`Items API ${routeId} data must be an array`);
  if (routeId === 'public-item-sources') {
    const actual = new Set(data.map(sourceEvidenceKey));
    const missing = expected.sourceEvidenceKeys.filter((key) => !actual.has(key));
    if (missing.length > 0) throw new Error(`Items API source DTO readback is missing manifest-bound acquisition sources: expected=${expected.sourceEvidenceKeys.length}, actual=${data.length}, missing=${missing.slice(0, 3).join(' || ')}`);
    if (data.length !== expected.apiSourceCount) throw new Error(`Items API source DTO count differs from independent local relation readback: expected=${expected.apiSourceCount}, actual=${data.length}`);
    return { count: data.length, sourceRowsVerified: expected.sourceEvidenceKeys.length, actualKeysSha256: hashJson([...actual].sort()) };
  }
  if (routeId === 'public-item-images') {
    if (data.length !== expected.managedImageCount) throw new Error('Items public image count differs from managed-image readback');
    return { managedImageCount: data.length };
  }
  if (routeId === 'admin-item-recipes') {
    if (data.length !== expected.apiRecipeCount || data.some((recipe) => Number(recipe.resultItemId) !== Number(expected.itemId))) {
      throw new Error('Items admin recipe DTO count or stable result ID differs from relation readback');
    }
    return { count: data.length, resultItemId: expected.itemId };
  }
  throw new Error(`Items API response validator has no registered route: ${routeId}`);
}

async function runItemsMaintainedChain(context, { source, mysqlOptions, redisOptions } = {}) {
  const mysql = mysqlModule();
  const sqlConfig = {
    host: mysqlOptions.host,
    port: Number(mysqlOptions.port),
    user: mysqlOptions.username ?? mysqlOptions.user,
    password: mysqlOptions.password,
  };
  if (!sqlConfig.user || !sqlConfig.password) throw new Error('Items runner requires the run-owned provisioner MySQL account');
  const localConnection = await mysql.createConnection({ ...sqlConfig, database: context.databases.local, multipleStatements: false, dateStrings: true });
  let importReport;
  try {
    const localNpcDependency = context.dependencyManifest.dependencies.find((entry) => entry.id === 'stable-item-source-npc-dependencies-local');
    const localNpcRows = localNpcDependency
      ? (await localConnection.query(
        `SELECT * FROM npcs WHERE deleted=0 AND id IN (${localNpcDependency.keyValues.map(() => '?').join(',')}) ORDER BY id`,
        localNpcDependency.keyValues.map((row) => Number(row.id)),
      ))[0]
      : [];
    const importInput = buildItemsImportInput(source, { localNpcRows });
    importReport = await runStandardizedImportWithConnection(localConnection, {
      dryRun: false,
      preserveItemSourceIds: true,
      datasets: {
        manifest: null,
        itemsDataset: importInput.itemsDataset,
        relationsDataset: importInput.relationsDataset,
        wikiBiomesDataset: null,
      },
      redisConfig: redisOptions,
    });
  } finally { await localConnection.end(); }

  const maintConfig = { database: { ...sqlConfig, username: sqlConfig.user, name: context.databases.maint } };
  const itemLandingConnection = await mysql.createConnection({ ...sqlConfig, database: context.databases.local, dateStrings: true });
  let itemLandingRows;
  try {
    const [rows] = await itemLandingConnection.query(
      `SELECT ${ITEMINFO_LANDING_COLUMNS.map(sqlIdentifier).join(',')} FROM source_dataset_landings WHERE id=? AND dataset_type='items_raw' AND source_key='wiki.module.iteminfo' AND is_current=1`,
      [source.landing.sourceId],
    );
    itemLandingRows = rows.map(normalizeLandingForMaint);
  } finally { await itemLandingConnection.end(); }
  if (itemLandingRows.length !== 1) throw new Error('run-local exact ItemInfo landing was not independently read back');
  const itemMaintReport = await runMaintSync({
    apply: true,
    scopes: ['items'],
    itemIds: source.selectedIds,
    host: sqlConfig.host,
    port: sqlConfig.port,
    user: sqlConfig.user,
    password: sqlConfig.password,
    database: context.databases.maint,
    reportPath: null,
  }, {
    mysqlModule: mysql,
    config: maintConfig,
    zhSourceIndexes: {},
    loadLandingRows: async () => itemLandingRows,
    writeReport: async () => null,
  });

  const initialLocalConnection = await mysql.createConnection({ ...sqlConfig, database: context.databases.local, dateStrings: true });
  let relationLanding;
  try {
    const entry = buildRelationSourceLandingEntry({ source, context });
    const landingSummary = await runLandingImport({
      apply: true,
      reportPath: null,
      repoRoot: ROOT,
      db: { ...sqlConfig, database: context.databases.local },
    }, {
      mysqlModule: mysql,
      locateDatasetEntries: async () => [entry],
      writeReport: async () => null,
    });
    const [rows] = await initialLocalConnection.query(
      'SELECT id,content_hash,payload_json,source_key,source_page FROM source_dataset_landings WHERE dataset_type=? AND provider=? AND source_key=? AND source_page=? AND is_current=1 ORDER BY id',
      [entry.datasetType, entry.provider, entry.sourceKey, entry.sourcePage],
    );
    if (rows.length !== 1 || rows[0].content_hash !== entry.contentHash) throw new Error('repository Item relation landing readback differs from its frozen source bytes');
    relationLanding = { ...rows[0], contentHash: `sha256:${rows[0].content_hash}`, payload: JSON.parse(rows[0].payload_json), landingSummary };
  } finally { await initialLocalConnection.end(); }
  const relationMaintReport = await runMaintSync({
    apply: true,
    scopes: ['item_images', 'item_recipes', 'item_sources', 'item_biomes'],
    host: sqlConfig.host,
    port: sqlConfig.port,
    user: sqlConfig.user,
    password: sqlConfig.password,
    database: context.databases.maint,
    reportPath: null,
  }, {
    mysqlModule: mysql,
    config: maintConfig,
    zhSourceIndexes: {},
    loadLandingRows: async () => [normalizeLandingForMaint({
      ...relationLanding,
      id: relationLanding.id,
      dataset_type: 'item_relations_bundle_raw',
      provider: 'terrapedia.generated',
      source_key: relationLanding.source_key,
      source_page: relationLanding.source_page,
      content_hash: relationLanding.content_hash,
      payload_json: JSON.stringify(relationLanding.payload),
      fetched_at: null,
      parsed_at: null,
    })],
    writeReport: async () => null,
  });

  const targetConnection = await mysql.createConnection({ ...sqlConfig, database: context.databases.local, dateStrings: true });
  try {
    const { input: itemOnlyInputs, summary: maintainedReadback } = await collectMaintainedRelationInputs({
      connection: targetConnection,
      databases: context.databases,
      source,
      relationLanding,
      dependencyManifest: context.dependencyManifest,
    });
    const relationReport = await runRelationSync({
      apply: true,
      itemOnly: true,
      scopes: ['items'],
      itemIds: source.selectedIds,
      localDatabase: context.databases.local,
      maintDatabase: context.databases.maint,
      relationDatabase: context.databases.relation,
    }, {
      itemOnlyInputs,
      config: { database: { ...sqlConfig, username: sqlConfig.user } },
    });
    const projectionReport = await runProjectionToLocalCoreSync({
      apply: true,
      localDatabase: context.databases.local,
      relationDatabase: context.databases.relation,
      domains: ['items'],
      itemIds: source.selectedIds,
    }, {
      config: { database: { ...sqlConfig, username: sqlConfig.user } },
      listProjectionIds: async (_connection, relationDatabase, itemIds) => {
        const ids = itemIds.join(', ');
        const output = await context.client.query(`SELECT id FROM \`projection_items\` WHERE id IN (${ids}) ORDER BY id`, relationDatabase);
        return String(output).trim().split(/\r?\n/).filter(Boolean).map(Number);
      },
      writeReport: async () => null,
    });
    const [localRows] = await targetConnection.query(
      `SELECT id,internal_name,name FROM items WHERE id IN (${source.selectedIds.map(() => '?').join(',')}) ORDER BY id`, source.selectedIds,
    );
    const [maintRows] = await targetConnection.query(
      `SELECT source_id,internal_name,landing_source_id,landing_content_hash FROM \`${context.databases.maint}\`.maint_items WHERE source_id IN (${source.selectedIds.map(() => '?').join(',')}) AND deleted=0 ORDER BY source_id`, source.selectedIds,
    );
    const [relationRows] = await targetConnection.query(
      `SELECT source_id,internal_name,record_key FROM \`${context.databases.relation}\`.relation_items WHERE source_id IN (${source.selectedIds.map(() => '?').join(',')}) AND deleted=0 ORDER BY source_id`, source.selectedIds,
    );
    const [projectionRows] = await targetConnection.query(
      `SELECT id,internal_name,relation_record_key FROM \`${context.databases.relation}\`.projection_items WHERE id IN (${source.selectedIds.map(() => '?').join(',')}) AND deleted=0 ORDER BY id`, source.selectedIds,
    );
    assertExactIdentityRows(localRows, source.selectedItems, 'local items');
    assertExactIdentityRows(maintRows, source.selectedItems, 'maint_items');
    assertExactIdentityRows(relationRows, source.selectedItems, 'relation_items');
    assertExactIdentityRows(projectionRows, source.selectedItems, 'projection_items');
    const sample = chooseReadbackItem(source);
    const [[directSourceCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM item_acquisition_sources WHERE item_id=? AND status=1 AND deleted=0', [sample.id]);
    const [[biomeRelationCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM item_biomes WHERE item_id=?', [sample.id]);
    const [[biomeResourceCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM biome_resources WHERE item_id=?', [sample.id]);
    const [[npcLootCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM npc_loot_entries WHERE item_id=? AND status=1 AND deleted=0', [sample.id]);
    const [[npcShopCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM npc_shop_entries WHERE item_id=? AND status=1 AND deleted=0', [sample.id]);
    const [[managedImageCount]] = await targetConnection.query(
      "SELECT COUNT(*) AS total FROM item_images WHERE item_id=? AND status=1 AND deleted=0 AND cached_url LIKE 'http://127.0.0.1:9000/terrapedia-images/%'",
      [sample.id],
    );
    const [[recipeCount]] = await targetConnection.query('SELECT COUNT(*) AS total FROM recipes WHERE result_item_id=? AND status=1 AND deleted=0', [sample.id]);
    const expectedSourceKeys = source.itemRelations.selectedRows.itemSources
      .filter((row) => String(row.itemInternalName).toLowerCase() === String(sample.internalName).toLowerCase())
      .map(sourceEvidenceKey);
    const sourceOnlyNames = [...new Set(expectedSourceKeys.map((key) => key.split('|')[2]).filter(Boolean))];
    const apiExpectations = {
      itemId: Number(sample.id),
      internalName: sample.internalName,
      name: sample.name,
      sourceEvidenceKeys: expectedSourceKeys,
      sourceRefNames: sourceOnlyNames,
      directSourceCount: Number(directSourceCount.total),
      apiSourceCount: Number(directSourceCount.total) + Number(biomeRelationCount.total)
        + Number(biomeResourceCount.total) + Number(npcLootCount.total) + Number(npcShopCount.total),
      managedImageCount: Number(managedImageCount.total),
      apiRecipeCount: Number(recipeCount.total),
    };
    if (apiExpectations.apiSourceCount < expectedSourceKeys.length) throw new Error('independent Item source row count is smaller than the frozen source facts');
    return {
      status: 'passed',
      localSourceCompatibilityStatus: 'not-run-in-shared-maintained-schema',
      maintainedChainStatus: 'passed',
      v2AutomaticIngestionStatus: 'blocked',
      sourceManifestSha256: source.manifestSha256,
      relationBundleSha256: source.itemRelations.relationBundleSha256,
      relationLanding: { id: relationLanding.id, contentHash: relationLanding.contentHash, payloadSha256: hashBytes(relationLanding.payload_json) },
      dependencyManifestSha256: context.dependencySeedEvidence?.manifestSha256 ?? null,
      dependencySeedEvidence: context.dependencySeedEvidence,
      importReport,
      itemMaintReport,
      relationMaintReport,
      maintainedReadback,
      relationReport: { summary: relationReport.summary, tableRows: relationReport.tableRows, rowsWritten: relationReport.rowsWritten },
      projectionReport: projectionReport.report,
      apiExpectations,
      identityReadback: {
        localItems: localRows.length,
        maintItems: maintRows.length,
        relationItems: relationRows.length,
        projectionItems: projectionRows.length,
        localRowsSha256: hashJson(localRows),
        maintRowsSha256: hashJson(maintRows),
        relationRowsSha256: hashJson(relationRows),
        projectionRowsSha256: hashJson(projectionRows),
      },
    };
  } finally { await targetConnection.end(); }
}

function assertExactIdentityRows(rows, expected, label) {
  if (!Array.isArray(rows) || rows.length !== expected.length) throw new Error(`${label} readback is incomplete`);
  const expectedById = new Map(expected.map((row) => [Number(row.id), String(row.internalName).toLowerCase()]));
  for (const row of rows) {
    const id = Number(row.id ?? row.source_id);
    const internalName = String(row.internal_name ?? '').trim().toLowerCase();
    if (expectedById.get(id) !== internalName) throw new Error(`${label} stable identity readback drift`);
  }
}

export async function runEightDomainItemsAcceptance({
  sourceManifestPath,
  sourceManifestSha256,
  expectedSourceManifestSha256,
  dependencyManifestPath,
  dependencyManifestSha256,
  expectedDependencyManifestSha256,
  dependencyManifest = null,
  targetDatabases,
  allocation,
  mysql,
  redis,
  privateDirectory,
  config = null,
  executionManifest = null,
  preflightEvidence = null,
  executionCodeBundle = null,
  executionCodeBundlePath = null,
  runLiveImpl = runLiveAutomationAcceptance,
  startApiImpl,
  readbackApiImpl,
  stopApiImpl,
  provisionOnly = false,
} = {}) {
  if (!sourceManifestPath) throw new Error('Items source manifest path is required');
  const sourceFile = assertPrivateOrdinaryJson(sourceManifestPath, 'Items source manifest');
  const sourceHash = hashBytes(sourceFile.bytes);
  const expectedSourceHash = expectedSourceManifestSha256 ?? sourceManifestSha256;
  if (!HASH.test(expectedSourceHash ?? '') || sourceHash !== expectedSourceHash) throw new Error('Items source manifest file hash drift');
  const source = assertSourceManifest(sourceFile.value);
  let activeSource = source;
  assertSourceFiles(ROOT, source);
  if (allocation == null || executionCodeBundle == null || !executionCodeBundlePath) {
    throw new Error('Items execution requires a frozen runtime code bundle and isolated allocation');
  }
  const codeBundleVerification = verifyExecutionCodeBundleManifest(executionCodeBundle, { repoRoot: ROOT });
  if (codeBundleVerification.bundleSha256 !== executionCodeBundle.bundleSha256) {
    throw new Error('Items execution code bundle verification failed');
  }
  buildItemsImportInput(source);
  if (dependencyManifest != null) {
    if (!dependencyManifestPath) throw new Error('Items dependency manifest path is required when a manifest is supplied');
    const dependencyFile = assertPrivateOrdinaryJson(dependencyManifestPath, 'Items dependency manifest');
    const expectedHash = expectedDependencyManifestSha256 ?? dependencyManifestSha256;
    if (!HASH.test(expectedHash ?? '') || hashBytes(dependencyFile.bytes) !== expectedHash) throw new Error('Items dependency manifest file hash drift');
    assertItemsDependencyManifest(dependencyManifest, { sourceManifest: source, databases: targetDatabases });
  }
  if (provisionOnly) return Object.freeze({ status: 'preflight-passed', sourceManifestSha256: sourceHash });
  if (!allocation || !mysql || !redis || !privateDirectory || !targetDatabases || !dependencyManifestPath) {
    throw new Error('Items maintained acceptance requires allocation, credentials, private paths, and target schemas');
  }
  const runKey = allocation.runKey;
  const routes = buildItemsApiRoutes(source);
  const sourceStatePath = path.join(ROOT, PRIVATE_ROOT, 'source-state/items.json');
  const isolatedApiLifecycleFactory = async ({ manifest, resources, adapter, accountPasswords }) => {
    const apiCredentials = buildRunOwnedApiCredentials({
      mysql: { host: mysql.host, port: Number(mysql.port) },
      apiAccount: adapter.apiAccounts.apiReadonly,
      redisPassword: redis.password,
      runKey,
    });
    const validateResponse = validateItemsApiResponse;
    return buildIsolatedApiLifecycle({
      allocation,
      mode: 'consumer-readback',
      credentials: apiCredentials,
      migrationEvidence: manifest.migrationEvidence,
      routes,
      sourceManifestPath: apiSourceManifestPath,
      sourceStatePath,
      validateResponse,
      ...(startApiImpl ? { startImpl: startApiImpl } : {}),
      ...(readbackApiImpl ? { readbackImpl: readbackApiImpl } : {}),
      ...(stopApiImpl ? { stopImpl: stopApiImpl } : {}),
    });
  };
  const expectedPrivateRoot = path.resolve(ROOT, allocation.automaticArtifactRoot, 'acceptance-runs');
  const attemptRelative = path.relative(expectedPrivateRoot, path.resolve(privateDirectory));
  if (attemptRelative.startsWith('..') || path.isAbsolute(attemptRelative)) throw new Error('Items private acceptance directory is outside the run-owned attempt root');
  const mysqlOptions = {
    host: mysql.host,
    port: Number(mysql.port),
    username: mysql.username,
    password: mysql.password,
  };
  const redisOptions = { host: redis.host, port: Number(redis.port), database: Number(redis.logicalDb), password: redis.password };
  const dependencyPath = path.resolve(dependencyManifestPath);
  let generatedDependencyManifest = null;
  const dependencyManifestFactory = async ({ databases, readonlyClient } = {}) => {
    if (JSON.stringify(['local', 'maint', 'relation'].map((role) => databases?.[role]))
        !== JSON.stringify(['local', 'maint', 'relation'].map((role) => targetDatabases[role]))) {
      throw new Error('Items dependency factory received different run-derived target schemas');
    }
    const built = await buildFreshDependencyManifest({
      source: activeSource,
      databases,
      readonlyClient,
      dependencyManifestPath: dependencyPath,
    });
    activeSource = built.sourceManifest;
    generatedDependencyManifest = built;
    return built.manifest;
  };
  const acceptanceExecutor = async (context) => runItemsMaintainedChain(context, { source: activeSource, mysqlOptions, redisOptions });
  const result = await runLiveImpl({
    profile: 't1',
    runId: source.runId,
    mysql,
    redis,
    privateDirectory,
    maxRowsPerTable: 2,
    scope: 'items-maintained',
    acceptanceExecutor,
    dependencyManifest: null,
    dependencyManifestFactory,
    isolatedAllocation: allocation,
    isolatedApiLifecycleFactory: async (apiContext) => {
      const sourcePath = path.join(ROOT, PRIVATE_ROOT, 'source-manifests', `items.current.${activeSource.manifestSha256.slice(7, 23)}.json`);
      writeOrVerifyPrivateJson(sourcePath, activeSource, 'fresh Items API source manifest');
      const routeSpecs = buildItemsApiRoutes(activeSource);
      const apiCredentials = buildRunOwnedApiCredentials({
        mysql: { host: mysql.host, port: Number(mysql.port) },
        apiAccount: apiContext.adapter.apiAccounts.apiReadonly,
        redisPassword: redis.password,
        runKey,
      });
      return buildIsolatedApiLifecycle({
        allocation,
        mode: 'consumer-readback',
        credentials: apiCredentials,
        migrationEvidence: apiContext.manifest.migrationEvidence,
        routes: routeSpecs,
        sourceManifestPath: sourcePath,
        sourceStatePath,
        validateResponse: validateItemsApiResponse,
        ...(startApiImpl ? { startImpl: startApiImpl } : {}),
        ...(readbackApiImpl ? { readbackImpl: readbackApiImpl } : {}),
        ...(stopApiImpl ? { stopImpl: stopApiImpl } : {}),
      });
    },
  });
  const finalDependencyManifest = result.dependencyManifest;
  const finalDependencyHash = hashJson(finalDependencyManifest);
  if (generatedDependencyManifest && generatedDependencyManifest.manifestSha256
      && generatedDependencyManifest.manifestSha256 !== finalDependencyHash) {
    throw new Error('Items dependency manifest hash differs from the seeded T1 manifest');
  }
  const codeBundle = Object.freeze({
    bundleSha256: codeBundleVerification.bundleSha256,
    baseCommit: codeBundleVerification.baseCommit,
    fileCount: codeBundleVerification.fileCount,
  });
  const evidence = buildItemsAcceptanceEvidence({
    sourceManifest: activeSource,
    allocation,
    codeBundle,
    codeBundlePath: executionCodeBundlePath,
    preflight: preflightEvidence,
    execution: result.result ?? result,
  });
  return Object.freeze({
    status: result.status,
    sourceManifestSha256: activeSource.manifestSha256,
    dependencyManifestSha256: finalDependencyHash,
    evidence,
    result,
  });
}

function readSimpleEnv(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('run-owned credential file is not private');
  const output = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) output[line.slice(0, index)] = line.slice(index + 1);
  }
  return output;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.run !== 'true') throw new Error('run the bounded Items acceptance explicitly with --run=true');
  if (process.versions.node !== '22.23.0') throw new Error('Items isolated run requires pinned Node 22.23.0');
  const config = loadLocalStackConfig(ROOT);
  const executionManifest = JSON.parse(fs.readFileSync(path.join(ROOT, EXECUTION_ROOT, 'execution-manifest.json'), 'utf8'));
  const registryDirectory = path.join(ROOT, PRIVATE_ROOT, 'items-acceptance');
  fs.mkdirSync(registryDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(registryDirectory, 0o700);
  const runKey = executionManifest.mysql.runKeys.items;
  const allocationRegistry = openDurableRunKeyRegistry(path.join(registryDirectory, 'run-key-mappings.json'));
  const plan = buildEightDomainAllocationPlan({ manifest: executionManifest, domain: 'items', repoRoot: ROOT, runKeyRegistry: allocationRegistry });
  const redisPassword = fs.readFileSync(path.join(ROOT, PRIVATE_ROOT, 'redis/redis.auth'), 'utf8').trim();
  const preflight = await runReadOnlyPreflight({ config, allocation: plan, redisPassword, executionManifest });
  const allocation = Object.freeze({ ...plan, preflight: Object.freeze({ status: 'ready', observedAt: preflight.checkedAt }) });
  const sourceManifestPath = path.join(ROOT, EIGHT_DOMAIN_ITEMS_SOURCE_MANIFEST_RELATIVE_PATH);
  const sourceFile = assertPrivateOrdinaryJson(sourceManifestPath, 'Items source manifest');
  const source = assertSourceManifest(sourceFile.value);
  assertSourceFiles(ROOT, source);
  const credentials = {
    host: config.database.host,
    port: Number(config.database.port),
    username: config.database.username,
    password: config.database.password,
  };
  const mysql = createMysqlCommandClient(credentials);
  const redis = { host: '127.0.0.1', port: 16380, logicalDb: allocation.redis.logicalDb, password: redisPassword };
  const attempt = `${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${createHash('sha256').update(`${process.pid}:${Date.now()}`).digest('hex').slice(0, 12)}`;
  const privateDirectory = path.join(ROOT, allocation.automaticArtifactRoot, 'acceptance-runs', attempt, 'acceptance-runtime');
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const codeBundlePath = path.join(privateDirectory, 'execution-code-bundle.json');
  const codeBundle = buildExecutionCodeBundleManifest({ repoRoot: ROOT });
  writeOrVerifyPrivateJson(codeBundlePath, codeBundle, 'Items execution code bundle manifest');
  verifyExecutionCodeBundleManifest(codeBundle, { repoRoot: ROOT });
  const reportPath = path.join(ROOT, allocation.evidenceRoot, 'isolated-real-ingestion.json');
  try {
    fs.lstatSync(reportPath);
    throw new Error('Items isolated real-ingestion evidence already exists for this fixed run key');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = await runEightDomainItemsAcceptance({
    sourceManifestPath,
    expectedSourceManifestSha256: hashBytes(sourceFile.bytes),
    dependencyManifestPath: path.join(ROOT, EIGHT_DOMAIN_ITEMS_DEPENDENCY_MANIFEST_RELATIVE_PATH),
    targetDatabases: allocation.mysql.databases,
    allocation,
    mysql: credentials,
    redis,
    privateDirectory,
    executionCodeBundle: codeBundle,
    executionCodeBundlePath: path.relative(ROOT, codeBundlePath).replaceAll('\\', '/'),
    preflightEvidence: preflight,
  });
  writeOrVerifyPrivateJson(reportPath, result.evidence, 'Items isolated real-ingestion evidence');
  process.stdout.write(`${JSON.stringify({ status: result.status, sourceManifestSha256: result.sourceManifestSha256, dependencyManifestSha256: result.dependencyManifestSha256, evidencePath: path.relative(ROOT, reportPath).replaceAll('\\', '/'), executionCodeBundleSha256: codeBundle.bundleSha256, execution: result.result }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
