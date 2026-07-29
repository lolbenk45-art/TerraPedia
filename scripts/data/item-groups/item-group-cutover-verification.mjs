import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareItemGroupShadow } from './item-group-shadow.mjs';
import {
  buildItemGroupRuntimeSnapshotPayload,
  hashItemGroupRuntimeSnapshot,
} from './item-group-canonical-sync.mjs';
import {
  buildItemGroupAcceptanceProjection,
  loadItemGroupAcceptanceInputs,
  validateItemGroupAcceptanceProjection,
} from './item-group-live-acceptance.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

const CONSUMERS = Object.freeze(['adminItemGroups', 'adminRecipeGroups', 'recipeTree']);
const CONSUMER_LAYERS = Object.freeze({
  adminItemGroups: Object.freeze(['recipe_reference', 'source_group', 'central_override']),
  adminRecipeGroups: Object.freeze(['recipe_reference', 'central_override']),
  recipeTree: Object.freeze(['recipe_reference', 'source_group', 'central_override']),
});
export const EXPECTED_ITEM_GROUP_CONSUMER_PATHS = Object.freeze([
  'back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java',
  'scripts/data/audit/audit-any-item-group-sources.mjs',
  'scripts/data/audit/canonical-source-contract-registry.mjs',
  'scripts/data/audit/domain-readiness-audit.mjs',
  'scripts/data/automation/canonical-operation-catalog.mjs',
  'scripts/data/automation/canonical-operation-execution-manifest.mjs',
  'scripts/data/generate/generate-item-group-overrides.mjs',
  'scripts/data/generate/generate-recipe-material-reference.mjs',
  'scripts/data/item-groups/item-group-bootstrap.mjs',
  'scripts/data/item-groups/item-group-live-acceptance.mjs',
  'scripts/data/item-groups/item-group-readiness.mjs',
  'scripts/data/landing/source-dataset-locator.mjs',
]);

function text(value) {
  return String(value ?? '').trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function normalizedRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])]
    .map(stableValue)
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function normalizedRecipeMembers(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    itemId: row?.itemId == null ? null : Number(row.itemId),
    internalName: row?.internalName ?? null,
    name: row?.name ?? null,
    nameZh: row?.nameZh ?? null,
  })).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function parsedJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  return JSON.parse(String(value));
}

function groupChildren(runtime, field, groupRecordKey) {
  return (runtime?.[field] ?? []).filter((row) => row.groupRecordKey === groupRecordKey);
}

function consumerGroups(runtime, allowedLayers) {
  const allowed = new Set(allowedLayers);
  const winners = new Map();
  for (const row of runtime?.groups ?? []) {
    if (!allowed.has(row.sourceLayer) || Number(row.deleted ?? 0) !== 0 || row.status !== 'ACTIVE') continue;
    const current = winners.get(row.canonicalKey);
    if (!current || Number(row.sourcePriority) > Number(current.sourcePriority)) {
      winners.set(row.canonicalKey, row);
    }
  }
  return [...winners.values()].map((row) => ({
    canonicalKey: row.canonicalKey,
    canonicalName: row.canonicalName,
    displayNameEn: row.displayName ?? row.name ?? row.canonicalName,
    displayNameZh: row.displayNameZh ?? row.nameZh ?? null,
    aliases: groupChildren(runtime, 'aliases', row.recordKey)
      .filter((alias) => alias.aliasKind === 'explicit')
      .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
      .map((alias) => alias.aliasText),
    domains: parsedJson(row.normalizedDomainsJson, []),
    sourceLayer: row.sourceLayer,
    sourceMetadata: parsedJson(row.sourceMetadataJson, {}),
    status: row.status,
    blockReason: row.blockReason ?? null,
    sourceContentHash: row.sourceContentHash,
    members: groupChildren(runtime, 'members', row.recordKey)
      .filter((member) => member.resolutionState === 'RESOLVED')
      .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
      .map((member) => ({
        itemId: member.itemId == null ? null : Number(member.itemId),
        internalName: member.internalName ?? null,
        name: member.name ?? null,
        nameZh: member.nameZh ?? null,
      })),
  })).sort((left, right) => text(left.canonicalName).toLowerCase()
    .localeCompare(text(right.canonicalName).toLowerCase()));
}

function toItemGroupApi(group) {
  return {
    canonicalName: group.canonicalName,
    displayNameEn: group.displayNameEn,
    displayNameZh: group.displayNameZh,
    aliases: group.aliases,
    domains: group.domains,
    sourceKind: `canonical:${group.sourceLayer}`,
    sourceProvider: 'canonical_database',
    sourcePage: null,
    sourceRevisionTimestamp: null,
    sourceUpdatedAt: null,
    sourceLabel: group.sourceContentHash,
    sourceFile: 'canonical:item_groups',
    sourceUrls: [],
    manualOnly: group.sourceLayer === 'central_override',
    members: group.members.map((member) => ({
      ...member,
      image: null,
      resolved: true,
      resolutionStatus: 'resolved',
    })),
  };
}

function toRecipeGroupApi(group) {
  return {
    canonicalName: group.canonicalName,
    displayNameEn: group.displayNameEn,
    displayNameZh: group.displayNameZh,
    members: group.members.map((member) => ({ ...member, image: null })),
  };
}

function buildConsumerEvidence(runtime) {
  return Object.fromEntries(CONSUMERS.map((consumer) => [consumer, {
    groups: consumerGroups(runtime, CONSUMER_LAYERS[consumer]).map((group) => {
      const { sourceContentHash: ignored, ...shadowGroup } = group;
      return shadowGroup;
    }),
    exclusions: [],
  }]));
}

export function buildItemGroupCutoverExpectedEvidence({ runtime = {} } = {}) {
  const runtimeSnapshotHash = hashItemGroupRuntimeSnapshot(buildItemGroupRuntimeSnapshotPayload(runtime));
  const apiItemGroups = consumerGroups(runtime, CONSUMER_LAYERS.adminItemGroups);
  const apiRecipeGroups = consumerGroups(runtime, CONSUMER_LAYERS.adminRecipeGroups);
  return {
    runtimeSnapshotHash,
    consumers: buildConsumerEvidence(runtime),
    api: {
      adminItemGroups: apiItemGroups.map(toItemGroupApi),
      adminRecipeGroups: apiRecipeGroups.map(toRecipeGroupApi),
    },
  };
}

export function buildItemGroupCutoverActualEvidence({
  runtime = {},
  publicationState,
  consumerContract,
  api,
} = {}) {
  return {
    publicationState,
    runtimeSnapshotHash: hashItemGroupRuntimeSnapshot(buildItemGroupRuntimeSnapshotPayload(runtime)),
    consumers: buildConsumerEvidence(runtime),
    consumerContract,
    api,
  };
}

export async function readItemGroupFormalRuntime(connection) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('read-only MySQL connection is required');
  }
  const [[stateRows], [groups], [members], [aliases]] = await Promise.all([
    connection.query(`
      SELECT publication_status AS status,
             canonical_snapshot_hash AS snapshotHash,
             canonical_version AS canonicalVersion,
             group_count AS groupCount,
             member_count AS memberCount,
             alias_count AS aliasCount
      FROM terria_v1_local.item_group_projection_state
      WHERE singleton_key = 1
    `),
    connection.query(`
      SELECT g.record_key AS recordKey,
             g.canonical_key AS canonicalKey,
             g.canonical_name AS canonicalName,
             g.name AS displayName,
             g.name_zh AS displayNameZh,
             g.normalized_domains_json AS normalizedDomainsJson,
             g.source_layer AS sourceLayer,
             g.source_priority AS sourcePriority,
             g.relation_record_key AS relationRecordKey,
             g.source_content_hash AS sourceContentHash,
             g.canonical_version AS canonicalVersion,
             g.status,
             g.deleted,
             r.block_reason AS blockReason,
             r.source_metadata_json AS sourceMetadataJson
      FROM terria_v1_local.item_groups g
      JOIN terria_v1_relation.relation_item_groups r
        ON r.record_key = g.relation_record_key
      ORDER BY g.record_key
    `),
    connection.query(`
      SELECT m.record_key AS recordKey,
             g.record_key AS groupRecordKey,
             m.item_id AS itemId,
             m.source_item_id AS sourceItemId,
             m.member_key AS memberKey,
             m.internal_name AS internalName,
             m.name,
             m.name_zh AS nameZh,
             m.sort_order AS sortOrder,
             m.resolution_state AS resolutionState
      FROM terria_v1_local.item_group_members m
      JOIN terria_v1_local.item_groups g ON g.id = m.group_id
      ORDER BY m.record_key
    `),
    connection.query(`
      SELECT a.record_key AS recordKey,
             g.record_key AS groupRecordKey,
             a.alias_text AS aliasText,
             a.normalized_alias AS normalizedAlias,
             a.alias_kind AS aliasKind,
             a.alias_language AS aliasLanguage,
             a.sort_order AS sortOrder
      FROM terria_v1_local.item_group_aliases a
      JOIN terria_v1_local.item_groups g
        ON g.canonical_key = a.canonical_key
       AND g.source_layer = a.source_layer
      ORDER BY a.record_key
    `),
  ]);
  const runtime = { groups, members, aliases };
  const actual = buildItemGroupCutoverActualEvidence({ runtime });
  return {
    publicationState: stateRows?.[0] ?? null,
    runtimeSnapshotHash: actual.runtimeSnapshotHash,
    consumers: actual.consumers,
    counts: {
      local: {
        groupCount: groups.length,
        memberCount: members.length,
        aliasCount: aliases.length,
      },
    },
  };
}

function findRecipeTreeGroups(value, result = []) {
  if (Array.isArray(value)) {
    for (const entry of value) findRecipeTreeGroups(entry, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (text(value.groupCanonicalName)) result.push(value);
  for (const child of Object.values(value)) findRecipeTreeGroups(child, result);
  return result;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createAdminReadToken({ username, displayName, secret, nowSeconds } = {}) {
  if (!text(username) || !text(secret)) throw new Error('admin read token identity and secret are required');
  const issuedAt = Number(nowSeconds ?? Math.floor(Date.now() / 1000));
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    sub: text(username),
    displayName: text(displayName) || text(username),
    role: 'ADMIN',
    iat: issuedAt,
    exp: issuedAt + 300,
  });
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', String(secret)).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export async function readItemGroupApi({
  apiBase,
  token,
  recipeTreeItemId,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!text(apiBase) || !text(token) || !Number.isSafeInteger(Number(recipeTreeItemId))) {
    throw new Error('item-group API base, read token, and recipe-tree item id are required');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const base = text(apiBase).replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${token}` };
  const read = async (pathname) => {
    const response = await fetchImpl(`${base}${pathname}`, { method: 'GET', headers });
    if (!response.ok) throw new Error(`item-group read-only API request failed with status ${response.status}`);
    const payload = await response.json();
    if (!payload || !Object.hasOwn(payload, 'data')) {
      throw new Error('item-group read-only API response is missing data');
    }
    return payload.data;
  };
  const [adminItemGroups, adminRecipeGroups, recipeTree] = await Promise.all([
    read('/admin/item-groups'),
    read('/admin/recipe-groups'),
    read(`/items/${Number(recipeTreeItemId)}/recipe-tree?maxDepth=1`),
  ]);
  return { adminItemGroups, adminRecipeGroups, recipeTree };
}

function verifyApiEvidence(expected, actual, blockingReasons) {
  for (const consumer of ['adminItemGroups', 'adminRecipeGroups']) {
    if (stableJson(normalizedRows(actual?.[consumer])) !== stableJson(normalizedRows(expected?.[consumer]))) {
      blockingReasons.push(`${consumer} API payload does not match the canonical projection`);
    }
  }

  const expectedGroups = expected?.recipeTreeGroups ?? [];
  const expectedByName = new Map(expectedGroups.map((group) => [text(group.canonicalName), group]));
  const sample = findRecipeTreeGroups(actual?.recipeTree)
    .find((group) => expectedByName.has(text(group.groupCanonicalName)));
  if (!sample) {
    blockingReasons.push('recipeTree API did not expose a canonical group sample');
    return { sampleGroup: null };
  }
  const expectedGroup = expectedByName.get(text(sample.groupCanonicalName));
  if (stableJson(normalizedRecipeMembers(sample.groupMembers))
      !== stableJson(normalizedRecipeMembers(expectedGroup.members))) {
    blockingReasons.push('recipeTree API canonical group members do not match the projection');
  }
  return { sampleGroup: text(sample.groupCanonicalName) };
}

export function evaluateItemGroupConsumerInventory(inventory = []) {
  const allowedRoles = new Set(['bootstrap', 'compat_export', 'governance']);
  const actualPaths = (Array.isArray(inventory) ? inventory : []).map((entry) => entry?.path).sort();
  const expectedPaths = [...EXPECTED_ITEM_GROUP_CONSUMER_PATHS].sort();
  if (stableJson(actualPaths) !== stableJson(expectedPaths)) {
    throw new Error('item-group production consumer inventory is incomplete or changed');
  }
  const runtimeReaders = inventory.filter((entry) => !allowedRoles.has(entry?.role));
  if (runtimeReaders.length > 0) {
    throw new Error(`item-group runtime JSON reader remains: ${runtimeReaders.map((entry) => entry.path).join(', ')}`);
  }
  return { directJsonReaders: 0, fallbackEnabled: false };
}

async function walkProductionFiles(directory) {
  const result = [];
  for (const dirent of await fs.promises.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) result.push(...await walkProductionFiles(fullPath));
    if (dirent.isFile() && /\.(java|mjs)$/.test(dirent.name) && !dirent.name.endsWith('.test.mjs')) {
      result.push(fullPath);
    }
  }
  return result;
}

function consumerRole(relativePath) {
  if (relativePath === 'back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java') {
    return 'governance';
  }
  if (relativePath.startsWith('back/src/main/java/')) return 'runtime_reader';
  if (relativePath.startsWith('scripts/data/generate/')) return 'compat_export';
  if (
    relativePath === 'scripts/data/item-groups/item-group-bootstrap.mjs'
    || relativePath === 'scripts/data/item-groups/item-group-live-acceptance.mjs'
    || relativePath === 'scripts/data/landing/source-dataset-locator.mjs'
  ) return 'bootstrap';
  if (
    relativePath.startsWith('scripts/data/audit/')
    || relativePath === 'scripts/data/automation/canonical-operation-catalog.mjs'
    || relativePath === 'scripts/data/automation/canonical-operation-execution-manifest.mjs'
    || relativePath === 'scripts/data/item-groups/item-group-readiness.mjs'
  ) return 'governance';
  return 'pipeline_input';
}

export async function scanItemGroupProductionConsumers(repoRoot = process.cwd()) {
  const compatibilityFiles = [
    `${'recipe-material-reference'}.json`,
    `${'recipe-group-overrides'}.json`,
    `${'item-group-overrides'}.json`,
  ];
  const files = [
    ...await walkProductionFiles(path.join(repoRoot, 'back/src/main/java')),
    ...await walkProductionFiles(path.join(repoRoot, 'scripts/data')),
  ];
  const result = [];
  for (const filePath of files) {
    const source = await fs.promises.readFile(filePath, 'utf8');
    if (!compatibilityFiles.some((name) => source.includes(name))) continue;
    const relativePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');
    result.push({ path: relativePath, role: consumerRole(relativePath) });
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

export function verifyItemGroupCutoverEvidence({ expected = {}, actual = {} } = {}) {
  const blockingReasons = [];
  if (actual.publicationState?.status !== 'PUBLISHED') {
    blockingReasons.push('canonical item-group projection is not PUBLISHED');
  }
  if (!text(expected.runtimeSnapshotHash)
      || actual.publicationState?.snapshotHash !== expected.runtimeSnapshotHash
      || actual.runtimeSnapshotHash !== expected.runtimeSnapshotHash) {
    blockingReasons.push('canonical item-group runtime snapshot hash does not match the frozen projection');
  }

  const shadows = {};
  for (const consumer of CONSUMERS) {
    const shadow = compareItemGroupShadow({
      consumer,
      legacySnapshot: expected.consumers?.[consumer],
      canonicalSnapshot: actual.consumers?.[consumer],
    });
    shadows[consumer] = shadow;
    if (shadow.status !== 'PASS') blockingReasons.push(`${consumer} shadow parity is blocked`);
  }

  if (actual.consumerContract?.directJsonReaders !== 0) {
    blockingReasons.push('item-group direct JSON reader count is not zero');
  }
  if (actual.consumerContract?.fallbackEnabled !== false) {
    blockingReasons.push('item-group JSON fallback is not disabled');
  }

  const api = verifyApiEvidence({
    adminItemGroups: expected.api?.adminItemGroups,
    adminRecipeGroups: expected.api?.adminRecipeGroups,
    recipeTreeGroups: expected.consumers?.recipeTree?.groups,
  }, actual.api, blockingReasons);

  if (blockingReasons.length > 0) {
    throw new Error(`item-group cutover verification blocked: ${blockingReasons.join('; ')}`);
  }
  return {
    status: 'passed',
    writesDatabase: false,
    runtimeSnapshotHash: expected.runtimeSnapshotHash,
    shadows,
    consumerContract: actual.consumerContract,
    api: {
      snapshotHash: expected.runtimeSnapshotHash,
      adminItemGroupCount: actual.api.adminItemGroups.length,
      adminRecipeGroupCount: actual.api.adminRecipeGroups.length,
      recipeTree: api,
    },
    blockingReasons: [],
  };
}

export async function runItemGroupCutoverVerification({
  expected,
  readDatabase,
  scanConsumers,
  readApi,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof readDatabase !== 'function'
      || typeof scanConsumers !== 'function'
      || typeof readApi !== 'function') {
    throw new TypeError('item-group cutover verification requires read-only database, consumer, and API adapters');
  }
  const database = await readDatabase();
  const consumerContract = evaluateItemGroupConsumerInventory(await scanConsumers());
  const api = await readApi();
  const verified = verifyItemGroupCutoverEvidence({
    expected,
    actual: { ...database, consumerContract, api },
  });
  return {
    schemaVersion: 1,
    reportKind: 'canonical_item_group_cutover_verification',
    generatedAt: now(),
    databaseRole: 't2-readonly',
    ...verified,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function requiredEnvironment(name, ...fallbackNames) {
  for (const candidate of [name, ...fallbackNames]) {
    if (text(process.env[candidate])) return process.env[candidate];
  }
  throw new Error(`missing required item-group cutover environment: ${name}`);
}

async function writeJsonAtomic(outputPath, payload) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporaryPath, outputPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] || process.cwd());
  const bootstrapResultPath = path.resolve(repoRoot, args['bootstrap-result']
    || 'reports/authorization/canonical/canonical-item-group-bootstrap.result.json');
  const outputPath = path.resolve(repoRoot, args.output
    || 'reports/canonical-migration/item-group-cutover-verification.json');
  const bootstrapResult = JSON.parse(await fs.promises.readFile(bootstrapResultPath, 'utf8'));
  if (bootstrapResult.status !== 'completed' || bootstrapResult.operationId !== 'canonical-item-group-bootstrap') {
    throw new Error('completed canonical item-group bootstrap result is required');
  }
  const projection = validateItemGroupAcceptanceProjection(buildItemGroupAcceptanceProjection({
    ...loadItemGroupAcceptanceInputs(repoRoot),
    runKey: bootstrapResult.runKey,
  }));
  const expected = buildItemGroupCutoverExpectedEvidence({ runtime: projection.runtime });
  if (bootstrapResult.runtimeSnapshotHash !== expected.runtimeSnapshotHash) {
    throw new Error('bootstrap result runtime hash does not match current frozen inputs');
  }

  const mysql = loadMysqlModule({ repoRoot });
  const connection = await mysql.createConnection({
    host: requiredEnvironment('TERRAPEDIA_DB_HOST', 'TP_DB_HOST'),
    port: Number(requiredEnvironment('TERRAPEDIA_DB_PORT', 'TP_DB_PORT')),
    user: requiredEnvironment('TERRAPEDIA_DB_USERNAME', 'TP_DB_USERNAME'),
    password: requiredEnvironment('TERRAPEDIA_DB_PASSWORD', 'TP_DB_PASSWORD'),
    database: 'terria_v1_local',
    multipleStatements: false,
  });
  let database;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    database = await readItemGroupFormalRuntime(connection);
  } finally {
    await connection.query('ROLLBACK').catch(() => {});
    await connection.end();
  }

  const token = createAdminReadToken({
    username: requiredEnvironment('TERRAPEDIA_ADMIN_USERNAME', 'TP_ADMIN_USERNAME'),
    displayName: process.env.TERRAPEDIA_ADMIN_DISPLAY_NAME || process.env.TP_ADMIN_DISPLAY_NAME,
    secret: requiredEnvironment('TERRAPEDIA_AUTH_TOKEN_SECRET', 'TP_ADMIN_TOKEN_SECRET'),
  });
  const apiBase = args['api-base'] || requiredEnvironment('TERRAPEDIA_BACKEND_ORIGIN');
  const result = await runItemGroupCutoverVerification({
    expected,
    readDatabase: async () => database,
    scanConsumers: async () => scanItemGroupProductionConsumers(repoRoot),
    readApi: async () => readItemGroupApi({
      apiBase: `${apiBase.replace(/\/+$/, '')}/api`,
      token,
      recipeTreeItemId: Number(args['recipe-tree-item-id'] || 85),
    }),
  });
  const report = {
    ...result,
    operationId: 'canonical-item-group-cutover',
    bootstrapRunKey: bootstrapResult.runKey,
    bootstrapOperationId: bootstrapResult.operationId,
    cutoverState: 'T2_CUTOVER_VERIFIED',
    counts: bootstrapResult.counts,
  };
  await writeJsonAtomic(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
