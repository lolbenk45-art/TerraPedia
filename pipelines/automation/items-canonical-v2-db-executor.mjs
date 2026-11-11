import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildStandardizedItemRows,
  runBaseItemsImport,
} from '../import/import-standardized-to-db.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { extractMaintEntitiesFromLandingRow } from '../maint/sync-landing-to-maint.mjs';
import {
  normalizeMysqlPersistenceValue,
  runSync as buildRelationSync,
} from '../relation/sync-maint-to-relation.mjs';
import { assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';

const LOCAL = 'terria_v1_local';
const MAINT = 'terria_v1_maint';
const RELATION = 'terria_v1_relation';
const OPERATION_ID = 'automation-items-l2-canonical-v2';
const HEX_HASH = /^sha256:[a-f0-9]{64}$/;

const RELATION_TABLES = Object.freeze([
  'relation_items', 'relation_item_images', 'relation_item_rarities',
  'category_nodes', 'item_category_assignments', 'item_recipe_heads',
  'item_recipe_ingredients', 'item_recipe_stations', 'item_source_facts',
  'item_source_details', 'item_npc_shop_relations', 'item_npc_loot_relations',
  'item_npc_relation_audits', 'item_biome_relations', 'projection_items',
]);

const ITEMS_POLICY_TABLES = Object.freeze([
  ['local', 'items'],
  ['local', 'source_dataset_landings'], ['local', 'category'], ['local', 'item_images'],
  ['local', 'item_acquisition_sources'], ['local', 'recipes'], ['local', 'recipe_ingredients'],
  ['local', 'recipe_stations'], ['local', 'item_biomes'], ['local', 'biome_resources'],
  ['maint', 'maint_items'], ['maint', 'maint_item_categories'], ['maint', 'maint_item_images'],
  ['maint', 'maint_item_recipes'], ['maint', 'maint_item_sources'], ['maint', 'maint_item_biomes'],
  ...RELATION_TABLES.map((table) => ['relation', table]),
]);

const UPSERT_TABLES = new Set([
  'source_dataset_landings', 'maint_items', 'items', ...RELATION_TABLES,
]);

const GENERATED_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'current_slot']);

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function quote(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`unsafe Items V2 identifier: ${value}`);
  return `\`${value}\``;
}

function qualified(database, table) {
  return `${quote(database)}.${quote(table)}`;
}

function snakeCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function recordsFromSource(sourcePayload) {
  const records = sourcePayload?.datasets?.items?.records;
  if (!Array.isArray(records) || records.length === 0) throw new Error('Items V2 source is missing standardized item records');
  const ids = new Set();
  for (const record of records) {
    const id = Number(record?.id);
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id) || !String(record?.internalName ?? '').trim()) {
      throw new Error('Items V2 source contains an invalid or duplicate stable identity');
    }
    ids.add(id);
  }
  return records;
}

function readBoundItemsSourceSnapshot(bundle, repoRoot, standardizedPayload = null) {
  const binding = bundle?.importPlan?.sourceSnapshotBinding;
  const dispatch = bundle?.sourceDispatchIdentity;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
      || !dispatch || typeof dispatch !== 'object' || Array.isArray(dispatch)) {
    throw new Error('Items V2 requires its probe-bound immutable module source snapshot');
  }
  for (const [field, value] of [
    ['snapshotHash', binding.snapshotHash],
    ['sourceFingerprint', binding.sourceFingerprint],
    ['sourceContentIdentity', binding.sourceContentIdentity],
    ['probeStateHash', binding.probeStateHash],
    ['contentHash', binding.contentHash],
  ]) {
    if (!HEX_HASH.test(value ?? '')) throw new Error(`Items V2 source snapshot ${field} is invalid`);
  }
  if (binding.sourceFingerprint !== dispatch.sourceFingerprint
      || binding.sourceRunIdentity !== dispatch.sourceRunIdentity
      || binding.sourceContentIdentity !== dispatch.sourceContentIdentity) {
    throw new Error('Items V2 source snapshot binding does not match the scheduler dispatch identity');
  }
  const filePath = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, String(binding.path ?? '')),
    label: 'Items V2 immutable module source snapshot',
  });
  const bytes = fs.readFileSync(filePath);
  if (hashBytes(bytes) !== binding.snapshotHash) throw new Error('Items V2 immutable module snapshot hash drifted');
  const snapshot = plainObject(JSON.parse(bytes.toString('utf8')), 'Items V2 immutable module snapshot');
  if (snapshot.schemaVersion !== 1
      || binding.sourceKey !== 'wiki.module.iteminfo'
      || snapshot.sourceKey !== binding.sourceKey
      || snapshot.sourceFingerprint !== binding.sourceFingerprint
      || snapshot.checkedAt !== binding.sourceRunIdentity
      || snapshot.probeStateHash !== binding.probeStateHash
      || snapshot.metadataOnly !== false
      || snapshot.revisionId !== binding.revisionId
      || snapshot.revisionTimestamp !== binding.revisionTimestamp
      || snapshot.payload?.pageTitle !== 'Module:Iteminfo/data'
      || snapshot.payload?.revisionTimestamp !== binding.revisionTimestamp
      || typeof snapshot.payload?.moduleContent !== 'string') {
    throw new Error('Items V2 immutable module source snapshot identity is incomplete or drifted');
  }
  const rawContentHash = hashBytes(Buffer.from(snapshot.payload.moduleContent, 'utf8'));
  if (rawContentHash !== binding.contentHash || binding.contentHash !== binding.sourceFingerprint) {
    throw new Error('Items V2 raw module content does not match its admitted source fingerprint');
  }
  const sourceMetadata = standardizedPayload?.datasets?.items?.upstreamMeta;
  if (sourceMetadata?.sourceRevisionTimestamp != null
      && sourceMetadata.sourceRevisionTimestamp !== binding.revisionTimestamp) {
    throw new Error('Items V2 standardized rows do not match the source snapshot revision timestamp');
  }
  const parsedModule = parseIteminfoModulePayload(snapshot.payload.moduleContent);
  if (sourceMetadata?.wikiVersion != null
      && sourceMetadata.wikiVersion !== (parsedModule._terrariaversion ?? null)) {
    throw new Error('Items V2 standardized rows do not match the source snapshot module version');
  }
  return Object.freeze({
    binding: Object.freeze({ ...binding }),
    snapshot: Object.freeze(snapshot),
    filePath,
    parsedModule,
    moduleVersion: parsedModule._terrariaversion ?? null,
    moduleGeneratedAt: parsedModule._generated ?? null,
  });
}

function sourceIdentity(bundle, sourceSnapshot) {
  const hash = sourceSnapshot?.binding?.contentHash;
  if (!HEX_HASH.test(hash ?? '')) throw new Error('Items V2 raw module content hash is invalid');
  return {
    sourceKey: sourceSnapshot.binding.sourceKey,
    contentHash: hash.slice(7),
    sourceRevisionTimestamp: sourceSnapshot.binding.revisionTimestamp ?? null,
    sourceCheckedAt: sourceSnapshot.binding.sourceRunIdentity,
  };
}

function landingRowFromSource(sourceSnapshot, identity, existing = null) {
  const payload = sourceSnapshot?.snapshot?.payload;
  const moduleContent = payload?.moduleContent;
  if (typeof moduleContent !== 'string' || !moduleContent) throw new Error('Items V2 landing requires frozen raw Module:Iteminfo/data bytes');
  const landingPayload = JSON.stringify(payload);
  return {
    dataset_type: 'items_raw', provider: 'terraria.wiki.gg', source_kind: 'wiki_module',
    source_key: identity.sourceKey, source_locator: 'https://terraria.wiki.gg/wiki/Module:Iteminfo/data',
    source_page: 'Module:Iteminfo/data', source_revision_timestamp: identity.sourceRevisionTimestamp,
    content_hash: identity.contentHash, payload_json: landingPayload, fetched_at: identity.sourceCheckedAt,
    parsed_at: identity.sourceCheckedAt, parse_status: 'ok', artifact_role: 'source_evidence',
    producer_id: 'items-canonical-v2', producer_version: '1', producer_run_key: identity.contentHash,
    full_file_content_hash: identity.contentHash, full_file_byte_size: Buffer.byteLength(moduleContent), is_current: 1,
    notes: 'Items V2 canonical source snapshot',
    ...(existing?.id == null ? {} : { id: Number(existing.id) }),
  };
}

function upsertRowValues(table, input) {
  const generatedColumns = table === 'items' || table === 'projection_items' || table === 'relation_item_rarities'
    ? new Set(['created_at', 'updated_at', 'current_slot'])
    : GENERATED_COLUMNS;
  return Object.fromEntries(Object.entries(input)
    .map(([column, value]) => {
      const normalizedColumn = snakeCase(column);
      return [normalizedColumn, normalizeMysqlPersistenceValue(normalizedColumn, value)];
    })
    .filter(([column, value]) => value !== undefined && !generatedColumns.has(column)));
}

function comparableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    try {
      return JSON.stringify(canonicalJson(JSON.parse(value)));
    } catch {
      const date = new Date(value);
      if (/^\d{4}-\d\d-\d\d[T ]/.test(value) && Number.isFinite(date.getTime())) return date.toISOString();
      return value;
    }
  }
  if (value && typeof value === 'object') return JSON.stringify(canonicalJson(value));
  return value == null ? '' : String(value);
}

function candidateKey(row, keyColumns) {
  return JSON.stringify(keyColumns.map((column) => comparableValue(row[column] ?? null)));
}

function compareCandidateRows(table, baselineRows, candidateRows, keyColumns, semanticCompareColumns = null) {
  const baselineByKey = new Map();
  for (const row of baselineRows ?? []) {
    const key = candidateKey(row, keyColumns);
    if (baselineByKey.has(key)) throw new Error(`Items V2 baseline has duplicate ${table} identity`);
    baselineByKey.set(key, row);
  }
  const seenCandidates = new Set();
  const inserts = [];
  const updates = [];
  for (const input of candidateRows ?? []) {
    const candidate = upsertRowValues(table, input);
    const key = candidateKey(candidate, keyColumns);
    if (seenCandidates.has(key)) throw new Error(`Items V2 candidate has duplicate ${table} identity`);
    seenCandidates.add(key);
    const current = baselineByKey.get(key);
    if (!current) {
      inserts.push(candidate);
      continue;
    }
    const columnsToCompare = semanticCompareColumns ?? Object.keys(candidate).filter((column) => column !== 'id');
    if (columnsToCompare.some((column) => column !== 'id'
        && comparableValue(current[column]) !== comparableValue(candidate[column]))) {
      updates.push(candidate);
    }
  }
  return { inserts, updates, keyColumns };
}

function mergeCandidateRows(baselineRows, changeSet) {
  const rowsByKey = new Map((baselineRows ?? []).map((row) => [
    candidateKey(row, changeSet.keyColumns), { ...row },
  ]));
  for (const row of [...changeSet.inserts, ...changeSet.updates]) {
    const key = candidateKey(row, changeSet.keyColumns);
    rowsByKey.set(key, { ...(rowsByKey.get(key) ?? {}), ...row });
  }
  return [...rowsByKey.values()];
}

function stableKeyValues(row, keyColumns) {
  return keyColumns.map((column) => String(row[column] ?? '')).join(':');
}

const MAINT_ITEM_COMPARE_COLUMNS = Object.freeze([
  'source_id', 'internal_name', 'english_name', 'name_zh', 'major_value', 'combat_value', 'defense_value',
  'use_time', 'stack_size', 'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted',
]);

async function buildMaintItemCandidateRows(rawSourceSnapshot, landingRow) {
  if (!Number.isSafeInteger(Number(landingRow?.id)) || Number(landingRow.id) < 1) {
    throw new Error('Items V2 requires the current source landing ID before Maint candidate derivation');
  }
  const payload = rawSourceSnapshot.snapshot.payload;
  const extracted = await extractMaintEntitiesFromLandingRow({
    id: Number(landingRow.id),
    dataset_type: 'items_raw',
    provider: 'terraria.wiki.gg',
    source_key: landingRow.source_key,
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: rawSourceSnapshot.binding.revisionTimestamp,
    content_hash: rawSourceSnapshot.binding.contentHash.slice(7),
    fetched_at: rawSourceSnapshot.binding.sourceRunIdentity,
    parsed_at: rawSourceSnapshot.binding.sourceRunIdentity,
    payload_json: JSON.stringify(payload),
  });
  if (extracted.scope !== 'items' || !Array.isArray(extracted.rows)) {
    throw new Error('Items V2 maintained extractor returned an invalid scope');
  }
  return extracted.rows.map((input) => {
    const { scope: _scope, tableName: _tableName, ...candidate } = input;
    return { ...upsertRowValues('maint_items', candidate), status: 1, deleted: 0 };
  });
}

function itemRecordRow(record, existing, landing, identity) {
  const stats = record.stats ?? {};
  const economy = record.economy ?? {};
  const stack = record.stack ?? {};
  const raw = existing?.raw_json ?? JSON.stringify(record);
  return {
    source_id: Number(record.id),
    internal_name: String(record.internalName).trim(),
    english_name: record.name ?? null,
    name_zh: record.nameZh ?? existing?.name_zh ?? null,
    source_provider: 'terraria.wiki.gg',
    source_page: 'Module:Iteminfo/data',
    source_revision_timestamp: identity.sourceRevisionTimestamp,
    landing_source_id: landing.id,
    landing_source_key: identity.sourceKey,
    landing_source_page: 'Module:Iteminfo/data',
    landing_content_hash: identity.contentHash,
    canonical_version: '1.4.5.8',
    landing_fetched_at: identity.sourceCheckedAt,
    landing_parsed_at: identity.sourceCheckedAt,
    module_generated_at: record.moduleGeneratedAt ?? existing?.module_generated_at ?? null,
    terraria_version: record.terrariaVersion ?? existing?.terraria_version ?? '1.4.5.8',
    major_value: economy.buy ?? existing?.major_value ?? null,
    combat_value: stats.damage ?? existing?.combat_value ?? null,
    defense_value: stats.defense ?? existing?.defense_value ?? null,
    use_time: stats.useTime ?? existing?.use_time ?? null,
    stack_size: stack.stackSize ?? existing?.stack_size ?? 1,
    width: stats.width ?? existing?.width ?? null,
    height: stats.height ?? existing?.height ?? null,
    flags_json: existing?.flags_json ?? null,
    raw_json: raw,
    status: 1,
    deleted: 0,
  };
}

const MAINT_ITEM_SEMANTIC_COLUMNS = Object.freeze([
  'source_id', 'internal_name', 'english_name', 'name_zh',
  'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size', 'width', 'height',
  'flags_json', 'status', 'deleted',
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

export function buildItemsCanonicalV2MaintCandidate(record, existing, landing, identity, { forceUpdate = false } = {}) {
  const candidate = itemRecordRow(record, existing, landing, identity);
  if (existing && !forceUpdate && MAINT_ITEM_SEMANTIC_COLUMNS.every((column) => (
    String(existing[column] ?? '') === String(candidate[column] ?? '')
  ))) {
    return null;
  }
  return { ...candidate, raw_json: JSON.stringify(record) };
}

function localItemRecord(record) {
  const stats = record.stats ?? {};
  const economy = record.economy ?? {};
  const stack = record.stack ?? {};
  return {
    id: Number(record.id),
    name: record.name ?? record.internalName,
    internal_name: record.internalName,
    image: record.imageUrl ?? record.image ?? null,
    category_id: null,
    description: record.description ?? null,
    damage: stats.damage ?? null,
    defense: stats.defense ?? null,
    knockback: stats.knockback ?? null,
    use_time: stats.useTime ?? null,
    width: stats.width ?? null,
    height: stats.height ?? null,
    buy: economy.buy ?? null,
    sell: economy.sell ?? null,
    tooltip: record.tooltip ?? null,
    rarity_id: record.rarityId ?? null,
    is_stackable: stack.isStackable ? 1 : 0,
    stack_size: stack.stackSize ?? 1,
    status: Number(record.status ?? 1),
    deleted: 0,
  };
}

async function queryRows(connection, database, table, ids) {
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT * FROM ${qualified(database, table)} WHERE id IN (${placeholders}) OR source_id IN (${placeholders}) ORDER BY id`,
    [...ids, ...ids],
  );
  return rows;
}

async function upsertRows(connection, database, table, rows) {
  if (!UPSERT_TABLES.has(table)) throw new Error(`Items V2 write escaped allowlist: ${database}.${table}`);
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, updated: 0, rows: 0 };
  let affected = 0;
  for (const input of rows) {
    const generatedColumns = table === 'projection_items' || table === 'relation_item_rarities'
      ? new Set(['created_at', 'updated_at', 'current_slot'])
      : GENERATED_COLUMNS;
    const row = Object.fromEntries(Object.entries(input)
      .map(([column, value]) => [snakeCase(column), value])
      .filter(([column, value]) => value !== undefined && !generatedColumns.has(column)));
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const values = columns.map((column) => row[column]);
    const updates = columns
      .filter((column) => column !== 'id')
      .map((column) => `${quote(column)} = VALUES(${quote(column)})`);
    const sql = `INSERT INTO ${qualified(database, table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      + (updates.length ? ` ON DUPLICATE KEY UPDATE ${updates.join(', ')}` : '');
    const [result] = await connection.execute(sql, values);
    affected += Number(result?.affectedRows ?? 0);
  }
  return { inserted: 0, updated: affected, rows: rows.length };
}

function relationInputFromResult(results) {
  const mapping = {
    relationItems: ['relation', 'relation_items'],
    relationItemImages: ['relation', 'relation_item_images'],
    relationItemRarities: ['relation', 'relation_item_rarities'],
    categoryNodes: ['relation', 'category_nodes'],
    itemCategoryAssignments: ['relation', 'item_category_assignments'],
    itemRecipeHeads: ['relation', 'item_recipe_heads'],
    itemRecipeIngredients: ['relation', 'item_recipe_ingredients'],
    itemRecipeStations: ['relation', 'item_recipe_stations'],
    itemSourceFacts: ['relation', 'item_source_facts'],
    itemSourceDetails: ['relation', 'item_source_details'],
    itemNpcShopRelations: ['relation', 'item_npc_shop_relations'],
    itemNpcLootRelations: ['relation', 'item_npc_loot_relations'],
    itemNpcRelationAudits: ['relation', 'item_npc_relation_audits'],
    itemBiomeRelations: ['relation', 'item_biome_relations'],
    projectionItems: ['relation', 'projection_items'],
  };
  return Object.fromEntries(Object.entries(mapping).map(([key, [, table]]) => [table, results?.[key] ?? []]));
}

function relationRowBelongsToSelectedItem(table, row, ids, names) {
  if (table === 'relation_item_rarities') return false;
  if (table === 'category_nodes') return true;
  if (table === 'projection_items' && ids.has(Number(row?.id))) return true;
  const numericFields = [
    'sourceId', 'source_id', 'itemId', 'item_id', 'ownerId', 'owner_id',
    'resultItemId', 'result_item_id', 'ingredientItemId', 'ingredient_item_id',
    'sourceItemId', 'source_item_id', 'inputItemId', 'input_item_id',
  ];
  const textFields = [
    'internalName', 'internal_name', 'itemInternalName', 'item_internal_name',
    'resultInternalName', 'result_internal_name', 'ingredientInternalName', 'ingredient_internal_name',
    'sourceItemInternalName', 'source_item_internal_name', 'inputInternalName', 'input_internal_name',
  ];
  return numericFields.some((field) => ids.has(Number(row?.[field])))
    || textFields.some((field) => names.has(String(row?.[field] ?? '').trim().toLowerCase()));
}

async function buildRelationResults(connection, repoRoot, { maintItemsOverride = null } = {}) {
  const qualifyReader = (database) => async (sql, ...params) => {
    if (database === MAINT && Array.isArray(maintItemsOverride)
        && /^\s*SELECT\s+\*\s+FROM\s+`?maint_items`?\s*;?\s*$/i.test(String(sql))) {
      return maintItemsOverride;
    }
    const tableNames = database === MAINT
      ? ['maint_items', 'maint_item_categories', 'maint_item_recipes', 'maint_item_page_recipes', 'maint_recipe_page_recipes', 'maint_item_sources', 'maint_item_biomes', 'maint_buffs', 'maint_bosses', 'maint_npc_images', 'maint_projectiles', 'maint_npcs', 'maint_item_images', 'maint_item_pages', 'maint_item_numeric_overrides', 'maint_item_rarity_overrides', 'maint_item_text_overrides', 'maint_armor_sets', 'maint_armor_set_images', 'maint_armor_attribute_rows', 'maint_item_groups', 'maint_item_group_members', 'maint_npc_crawler_facts', 'source_dataset_landings']
      : ['relation_armor_set_images'];
    let rewritten = String(sql);
    for (const table of tableNames) {
      const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rewritten = rewritten.replace(new RegExp('(?<![\\w.])(?:`?' + escaped + '`?)(?![\\w])', 'gi'), `${quote(database)}.${quote(table)}`);
    }
    const [rows] = await connection.query(rewritten, params);
    return rows;
  };
  return buildRelationSync({
    apply: false,
    scopes: ['items'],
    localDatabase: LOCAL,
    maintDatabase: MAINT,
    relationDatabase: RELATION,
    wikiArmorSetsInput: 'data/generated/wiki-armor-sets.latest.json',
  }, {
    queryMaint: qualifyReader(MAINT),
    queryRelation: qualifyReader(RELATION),
    writeReports: async () => ({ auditJsonPath: null, summaryJsonPath: null }),
    executeRelation: async (fn) => fn(connection),
  });
}

async function readBack(connection, ids) {
  const placeholders = ids.map(() => '?').join(',');
  const [local] = await connection.query(`SELECT id, internal_name, name, defense, damage FROM ${qualified(LOCAL, 'items')} WHERE id IN (${placeholders}) ORDER BY id`, ids);
  const [maint] = await connection.query(`SELECT source_id, internal_name, landing_source_key, landing_content_hash FROM ${qualified(MAINT, 'maint_items')} WHERE source_id IN (${placeholders}) AND deleted = 0 ORDER BY source_id`, ids);
  const [relation] = await connection.query(`SELECT source_id, internal_name, record_key FROM ${qualified(RELATION, 'relation_items')} WHERE source_id IN (${placeholders}) AND deleted = 0 ORDER BY source_id`, ids);
  const [projection] = await connection.query(`SELECT id, internal_name, relation_record_key FROM ${qualified(RELATION, 'projection_items')} WHERE id IN (${placeholders}) AND deleted = 0 ORDER BY id`, ids);
  const expected = new Set(ids);
  for (const [label, rows, idColumn] of [['local', local, 'id'], ['maint', maint, 'source_id'], ['relation', relation, 'source_id'], ['projection', projection, 'id']]) {
    if (rows.length !== ids.length || rows.some((row) => !expected.has(Number(row[idColumn])))) throw new Error(`Items V2 ${label} readback is incomplete`);
  }
  return { verified: true, rowCounts: { local_items: local.length, maint_items: maint.length, relation_items: relation.length, projection_items: projection.length }, hashes: { local: hashJson(local), maint: hashJson(maint), relation: hashJson(relation), projection: hashJson(projection) } };
}

function scopeForTable(plan, databaseRole, table) {
  const scope = plan.diff.scopes.find((entry) => entry.databaseRole === databaseRole && entry.table === table);
  if (!scope) throw new Error(`Items V2 locked plan is missing ${databaseRole}.${table}`);
  return scope;
}

async function verifyWrittenRows(connection, databaseRole, table, rows, keyColumns, label) {
  if (rows.length === 0) return { verified: true, rowCount: 0, sha256: hashJson([]) };
  const database = databaseRole === 'local' ? LOCAL : databaseRole === 'maint' ? MAINT : RELATION;
  const hashes = [];
  for (const expected of rows) {
    const predicates = keyColumns.map((column) => `${quote(column)} = ?`).join(' AND ');
    const values = keyColumns.map((column) => expected[column]);
    const [actualRows] = await connection.query(
      `SELECT * FROM ${qualified(database, table)} WHERE ${predicates} ORDER BY \`id\` LIMIT 2`,
      values,
    );
    if (actualRows.length !== 1) throw new Error(`Items V2 ${label} readback is not unique for ${table}`);
    const actual = actualRows[0];
    for (const [column, value] of Object.entries(expected)) {
      if (comparableValue(actual[column]) !== comparableValue(value)) {
        throw new Error(`Items V2 ${label} readback drifted at ${table}.${column}: expected=${JSON.stringify(value)} actual=${JSON.stringify(actual[column])}`);
      }
    }
    hashes.push(Object.fromEntries(Object.keys(expected).sort().map((column) => [column, actual[column] ?? null])));
  }
  return { verified: true, rowCount: rows.length, sha256: hashJson(hashes) };
}

function stageReceipt(stage, writes) {
  return {
    stage,
    inserted: writes.inserts.length,
    updated: writes.updates.length,
    deleted: 0,
    retired: 0,
    receiptHash: hashJson({ inserts: writes.inserts, updates: writes.updates }),
  };
}

export async function executeItemsCanonicalV2DatabaseImport({ connection, bundle, repoRoot = process.cwd(), executionPlan } = {}) {
  if (!connection || typeof connection.query !== 'function' || typeof connection.execute !== 'function') throw new TypeError('Items V2 database connection is required');
  plainObject(bundle, 'Items V2 bundle');
  plainObject(executionPlan, 'Items V2 locked execution plan');
  if (executionPlan.schemaVersion !== 1 || executionPlan.operationId !== OPERATION_ID
      || executionPlan.sourceSha256 !== bundle.source?.sha256
      || executionPlan.sourceSnapshotHash !== bundle.importPlan?.sourceSnapshotBinding?.snapshotHash
      || executionPlan.policySetHash !== bundle.policy?.policySetHash
      || executionPlan.ownedTableHash !== hashJson(bundle.ownedTables)) {
    throw new Error('Items V2 locked execution plan does not match the frozen bundle');
  }
  const sourcePath = path.resolve(repoRoot, String(bundle.source?.path ?? ''));
  const sourceBytes = fs.readFileSync(sourcePath);
  if (hashBytes(sourceBytes) !== bundle.source.sha256) throw new Error('Items V2 frozen source hash drifted');
  const sourcePayload = JSON.parse(sourceBytes.toString('utf8'));
  const records = recordsFromSource(sourcePayload);
  const ids = records.map((record) => Number(record.id));
  const rawSourceSnapshot = readBoundItemsSourceSnapshot(bundle, repoRoot, sourcePayload);
  const identity = sourceIdentity(bundle, rawSourceSnapshot);
  const { writes } = executionPlan;

  await connection.query(`USE ${quote(LOCAL)}`);
  const landingWrites = [...writes.landing.inserts, ...writes.landing.updates];
  await upsertRows(connection, LOCAL, 'source_dataset_landings', landingWrites);
  const landingRow = landingRowFromSource(rawSourceSnapshot, identity);
  const [materializedLandingRows] = await connection.query(
    `SELECT id FROM ${qualified(LOCAL, 'source_dataset_landings')} WHERE dataset_type=? AND provider=? AND source_key=? AND source_page=? ORDER BY id DESC LIMIT 1`,
    [landingRow.dataset_type, landingRow.provider, landingRow.source_key, landingRow.source_page],
  );
  if (materializedLandingRows.length !== 1) throw new Error('Items V2 landing readback did not return one source identity');
  landingRow.id = Number(materializedLandingRows[0].id);

  const maintWrites = [...writes.maint.inserts, ...writes.maint.updates]
    .map((row) => ({ ...row, landing_source_id: landingRow.id }));
  await connection.query(`USE ${quote(MAINT)}`);
  await upsertRows(connection, MAINT, 'maint_items', maintWrites);

  await connection.query(`USE ${quote(LOCAL)}`);
  const localReceipt = writes.local.inserts.length > 0 || writes.local.updates.length > 0
    ? await runBaseItemsImport({ connection, records, preserveSourceIds: true })
    : { items: { input: records.length, created: 0, updated: 0, skipped: records.length, errors: [] } };
  if (Number(localReceipt.items?.created ?? 0) !== writes.local.inserts.length
      || Number(localReceipt.items?.updated ?? 0) !== writes.local.updates.length) {
    throw new Error('Items V2 local importer mutations do not match the locked diff');
  }

  await connection.query(`USE ${quote(RELATION)}`);
  const relationReceipts = {};
  for (const table of RELATION_TABLES.filter((name) => name !== 'projection_items')) {
    const tableWrites = writes.relation[table] ?? { inserts: [], updates: [] };
    await upsertRows(connection, RELATION, table, [...tableWrites.inserts, ...tableWrites.updates]);
    relationReceipts[table] = { inserted: tableWrites.inserts.length, updated: tableWrites.updates.length };
  }
  const projectionWrites = writes.projection;
  await upsertRows(connection, RELATION, 'projection_items', [...projectionWrites.inserts, ...projectionWrites.updates]);
  relationReceipts.projection_items = { inserted: projectionWrites.inserts.length, updated: projectionWrites.updates.length };

  await connection.query(`USE ${quote(LOCAL)}`);
  const writeReadback = {};
  writeReadback.source_dataset_landings = await verifyWrittenRows(
    connection, 'local', 'source_dataset_landings', [...writes.landing.inserts, ...writes.landing.updates],
    scopeForTable(executionPlan, 'local', 'source_dataset_landings').keyColumns, 'landing',
  );
  writeReadback.maint_items = await verifyWrittenRows(
    connection, 'maint', 'maint_items', maintWrites,
    scopeForTable(executionPlan, 'maint', 'maint_items').keyColumns, 'maint',
  );
  for (const [table, tableWrites] of Object.entries(writes.relation)) {
    const rows = [...tableWrites.inserts, ...tableWrites.updates];
    writeReadback[table] = await verifyWrittenRows(
      connection, 'relation', table, rows,
      scopeForTable(executionPlan, 'relation', table).keyColumns, 'relation',
    );
  }
  const projectionRows = [...writes.projection.inserts, ...writes.projection.updates];
  writeReadback.projection_items = await verifyWrittenRows(
    connection, 'relation', 'projection_items', projectionRows,
    scopeForTable(executionPlan, 'relation', 'projection_items').keyColumns, 'projection',
  );
  const localRows = [...writes.local.inserts, ...writes.local.updates];
  writeReadback.items = await verifyWrittenRows(
    connection, 'local', 'items', localRows,
    scopeForTable(executionPlan, 'local', 'items').keyColumns, 'local',
  );
  const readback = await readBack(connection, ids);
  readback.writeRows = writeReadback;
  return {
    status: 'completed',
    importSummary: {
      landing: { inserted: writes.landing.inserts.length, updated: writes.landing.updates.length },
      maint: { inserted: writes.maint.inserts.length, updated: writes.maint.updates.length },
      local: localReceipt,
      relation: relationReceipts,
    },
    readback,
    receipts: [
      stageReceipt('landing', writes.landing),
      stageReceipt('maint', writes.maint),
      stageReceipt('relation', Object.values(writes.relation).reduce((total, item) => ({
        inserts: [...total.inserts, ...item.inserts], updates: [...total.updates, ...item.updates],
      }), { inserts: [], updates: [] })),
      stageReceipt('projection', writes.projection),
      stageReceipt('local', writes.local),
    ],
  };
}

export function buildItemsCanonicalV2ZeroDiff({ ownedTables = [] } = {}) {
  return {
    producer: 'items-canonical-v2-db-executor',
    completeSnapshot: true,
    tables: Object.fromEntries(ownedTables.map((scope) => [scope.table, { inserts: 0, updates: 0, relationshipDeletes: 0, softDisables: 0, hardDeletes: 0, entityBaselineCount: 0, relationshipBaselineCount: 0 }])),
  };
}

const ITEMS_SCOPE_KEYS = Object.freeze({
  source_dataset_landings: ['dataset_type', 'provider', 'source_key', 'source_page'],
  items: ['id'],
  maint_items: ['source_id'],
  relation_items: ['record_key'],
  projection_items: ['id'],
});

function keyColumnsForScope(table, baselineRows, candidateRows) {
  if (ITEMS_SCOPE_KEYS[table]) return ITEMS_SCOPE_KEYS[table];
  const sample = candidateRows?.[0] ?? baselineRows?.[0] ?? {};
  if (sample.recordKey != null || sample.record_key != null) return ['record_key'];
  if (sample.sourceId != null || sample.source_id != null) return ['source_id'];
  if (sample.id != null) return ['id'];
  return ['id'];
}

function compareColumnsForRows(table, baselineRows, candidateRows) {
  const columns = new Set();
  const generated = table === 'items' || table === 'projection_items'
    ? new Set(['created_at', 'updated_at', 'current_slot'])
    : GENERATED_COLUMNS;
  for (const row of [...(baselineRows ?? []), ...(candidateRows ?? [])]) {
    for (const column of Object.keys(row)) {
      const normalized = snakeCase(column);
      if (!generated.has(normalized)) columns.add(normalized);
    }
  }
  return [...columns].sort();
}

function rowsHash(rows, columns, keyColumns) {
  const projected = (rows ?? []).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
  projected.sort((left, right) => candidateKey(left, keyColumns).localeCompare(candidateKey(right, keyColumns)));
  return hashJson(projected);
}

function mergeRowsForScope(table, baselineRows, changes, keyColumns) {
  if (!changes) return baselineRows ?? [];
  return mergeCandidateRows(baselineRows, { ...changes, keyColumns });
}

function requireCurrentTableSnapshot(current, table) {
  const rows = current?.tables?.[table];
  if (!Array.isArray(rows)) throw new Error(`Items V2 diff requires the locked ${table} table snapshot`);
  return rows;
}

function buildScopeDiff({ scope, baselineRows, changes = null, keyColumns, candidateRows = [] }) {
  const actualChanges = changes ?? { inserts: [], updates: [], keyColumns };
  const afterRows = mergeRowsForScope(scope.table, baselineRows, actualChanges, keyColumns);
  const compareColumns = compareColumnsForRows(scope.table, baselineRows, afterRows);
  if (compareColumns.length === 0) compareColumns.push('id');
  const entityBaselineCount = baselineRows.length;
  const inserts = actualChanges.inserts.length;
  const updates = actualChanges.updates.length;
  return {
    scope: {
      scopeId: `${scope.databaseRole}:${scope.table}`,
      databaseRole: scope.databaseRole,
      table: scope.table,
      fieldGroup: scope.fieldGroup,
      ...(scope.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
      keyColumns,
      compareColumns,
      mutationKind: 'entity',
      entityBaselineCount,
      relationshipBaselineCount: 0,
      inserts,
      updates,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
      insertedKeys: actualChanges.inserts.map((row) => stableKeyValues(row, keyColumns)).sort(),
      updatedKeys: actualChanges.updates.map((row) => stableKeyValues(row, keyColumns)).sort(),
      deletedRelationshipKeys: [],
      softDisabledKeys: [],
      hardDeletedKeys: [],
    },
    rowEvidence: {
      scopeId: `${scope.databaseRole}:${scope.table}`,
      databaseRole: scope.databaseRole,
      table: scope.table,
      fieldGroup: scope.fieldGroup,
      ...(scope.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
      keyColumns,
      compareColumns,
      mutationKind: 'entity',
      baselineRowCount: entityBaselineCount,
      candidateRowCount: entityBaselineCount + inserts,
      baselineRowsSha256: rowsHash(baselineRows, compareColumns, keyColumns),
      candidateRowsSha256: rowsHash(afterRows, compareColumns, keyColumns),
    },
    candidateRows,
    writes: {
      inserts: actualChanges.inserts,
      updates: actualChanges.updates,
    },
  };
}

export async function buildItemsCanonicalV2Plan({
  connection,
  bundle,
  ownedTables = [],
  current = null,
  repoRoot = process.cwd(),
  buildRelationResultsImpl = buildRelationResults,
} = {}) {
  if (!connection) throw new TypeError('Items V2 diff requires a locked database connection');
  const sourcePath = path.resolve(repoRoot, bundle?.source?.path ?? '');
  const sourceBytes = fs.readFileSync(sourcePath);
  if (hashBytes(sourceBytes) !== bundle?.source?.sha256) throw new Error('Items V2 frozen source hash drifted during diff');
  const payload = JSON.parse(sourceBytes.toString('utf8'));
  const records = recordsFromSource(payload);
  const rawSourceSnapshot = readBoundItemsSourceSnapshot(bundle, repoRoot, payload);
  const identity = sourceIdentity(bundle, rawSourceSnapshot);
  const parsedModule = rawSourceSnapshot.parsedModule;
  const rawModuleRecords = Object.entries(parsedModule)
    .filter(([key, value]) => /^\d+$/.test(key) && Number(key) > 0 && value && typeof value === 'object')
    .map(([key, value]) => ({ id: Number(key), ...value }));
  const standardizedById = new Map(records.map((record) => [Number(record.id), record]));
  const expectedNormalizedIds = new Set(rawModuleRecords
    .filter((record) => typeof record.name === 'string' && record.name.trim()
      && typeof record.internalName === 'string' && record.internalName.trim()
      && record.internalName.trim().toLowerCase() !== 'none')
    .map((record) => record.id));
  const normalizedIds = new Set(standardizedById.keys());
  const missingNormalizedIds = [...expectedNormalizedIds].filter((id) => !normalizedIds.has(id));
  const foreignNormalizedIds = [...normalizedIds].filter((id) => !expectedNormalizedIds.has(id));
  if (missingNormalizedIds.length || foreignNormalizedIds.length) {
    throw new Error(`Items V2 normalized source identity mismatch: missing=${missingNormalizedIds.length}, foreign=${foreignNormalizedIds.length}`);
  }
  for (const rawRecord of rawModuleRecords.filter((record) => expectedNormalizedIds.has(record.id))) {
    const normalized = standardizedById.get(rawRecord.id);
    if (normalized.internalName.trim() !== rawRecord.internalName.trim()
        || normalized.name.trim() !== rawRecord.name.trim()) {
      throw new Error(`Items V2 normalized Item identity drifted from raw module for source ID ${rawRecord.id}`);
    }
  }
  const expectedTables = new Set(ITEMS_POLICY_TABLES.map(([databaseRole, table]) => `${databaseRole}.${table}`));
  const actualTables = new Set(ownedTables.map((scope) => `${scope.databaseRole}.${scope.table}`));
  if (actualTables.size !== expectedTables.size || [...expectedTables].some((key) => !actualTables.has(key))) {
    throw new Error('Items V2 plan requires the exact registered owned table set');
  }
  const baselineByTable = Object.fromEntries(ownedTables.map((scope) => [scope.table, requireCurrentTableSnapshot(current, scope.table)]));
  const currentItems = baselineByTable.items;
  const categoryRows = current?.dependencyTables?.categories;
  if (!Array.isArray(categoryRows)) throw new Error('Items V2 plan requires the locked local category dependency snapshot');
  const localRows = buildStandardizedItemRows(records, { categoryRows, existingRows: currentItems });
  const currentItemsByInternalName = new Map(currentItems.map((row) => [String(row.internal_name ?? '').trim().toLowerCase(), row]));
  for (const record of records) {
    const existing = currentItemsByInternalName.get(String(record.internalName).trim().toLowerCase());
    if (existing && Number(existing.id) !== Number(record.id)) {
      throw new Error(`Items V2 local Item ID ${existing.id} does not match source ID ${record.id}`);
    }
  }
  const localCandidates = localRows.map((row, index) => {
    const record = records[index];
    const existing = currentItemsByInternalName.get(String(row.internal_name).trim().toLowerCase());
    return { ...row, id: Number(existing?.id ?? record.id) };
  });
  const localChanges = compareCandidateRows('items', currentItems, localCandidates, ['id']);

  const landingRows = baselineByTable.source_dataset_landings.filter((row) => row.dataset_type === 'items_raw'
    && row.provider === 'terraria.wiki.gg' && row.source_page === 'Module:Iteminfo/data');
  const existingLanding = landingRows.find((row) => row.source_key === identity.sourceKey && Number(row.is_current) === 1) ?? null;
  if (!existingLanding || !Number.isSafeInteger(Number(existingLanding.id)) || Number(existingLanding.id) < 1) {
    throw new Error('Items V2 requires one current Iteminfo landing row for stable Maint lineage');
  }
  const landingCandidate = landingRowFromSource(rawSourceSnapshot, identity, existingLanding);
  const landingChanges = compareCandidateRows('source_dataset_landings', landingRows, [landingCandidate], ITEMS_SCOPE_KEYS.source_dataset_landings);

  const currentMaint = baselineByTable.maint_items;
  const maintCandidates = await buildMaintItemCandidateRows(rawSourceSnapshot, landingCandidate);
  const maintChanges = compareCandidateRows(
    'maint_items', currentMaint, maintCandidates, ITEMS_SCOPE_KEYS.maint_items, MAINT_ITEM_COMPARE_COLUMNS,
  );

  const maintainedAfter = mergeCandidateRows(currentMaint, maintChanges);
  const relation = await buildRelationResultsImpl(connection, repoRoot, { maintItemsOverride: maintainedAfter });
  const relationIssues = relation?.results?.issues ?? [];
  if (relationIssues.length > 0) throw new Error(`Items V2 relation candidate contains ${relationIssues.length} issue(s)`);
  const ids = new Set(records.map((record) => Number(record.id)));
  const names = new Set(records.map((record) => String(record.internalName).trim().toLowerCase()));
  const relationRowsByTable = relationInputFromResult(relation?.results);
  const relationChanges = {};
  for (const table of RELATION_TABLES) {
    if (table === 'relation_item_rarities') {
      relationChanges[table] = { inserts: [], updates: [], keyColumns: ['id'] };
      continue;
    }
    const candidates = (relationRowsByTable[table] ?? []).filter((row) => relationRowBelongsToSelectedItem(table, row, ids, names));
    const keyColumns = keyColumnsForScope(table, baselineByTable[table], candidates);
    relationChanges[table] = compareCandidateRows(table, baselineByTable[table], candidates, keyColumns);
  }

  const localSupports = new Set(ownedTables.filter((scope) => scope.databaseRole === 'local' && scope.table !== 'items' && scope.table !== 'source_dataset_landings').map((scope) => scope.table));
  const maintSupports = new Set(ownedTables.filter((scope) => scope.databaseRole === 'maint' && scope.table !== 'maint_items').map((scope) => scope.table));
  const scopeEntries = [];
  const rowEntries = [];
  const writes = {
    landing: landingChanges,
    maint: maintChanges,
    relation: {},
    projection: relationChanges.projection_items,
    local: localChanges,
  };

  for (const scope of ownedTables) {
    const table = scope.table;
    let baselineRows = baselineByTable[table];
    let changes = null;
    let candidates = [];
    let keyColumns;
    if (table === 'source_dataset_landings') {
      baselineRows = landingRows;
      changes = landingChanges;
      candidates = [landingCandidate];
    } else if (table === 'items') {
      changes = localChanges;
      candidates = localCandidates;
    } else if (table === 'maint_items') {
      changes = maintChanges;
      candidates = maintCandidates;
    } else if (table === 'projection_items') {
      changes = relationChanges[table];
      candidates = relationRowsByTable[table] ?? [];
    } else if (RELATION_TABLES.includes(table)) {
      changes = relationChanges[table];
      candidates = relationRowsByTable[table] ?? [];
      writes.relation[table] = changes;
    } else if (localSupports.has(table) || maintSupports.has(table)) {
      keyColumns = keyColumnsForScope(table, baselineRows, []);
    } else {
      keyColumns = keyColumnsForScope(table, baselineRows, []);
    }
    keyColumns ??= changes?.keyColumns ?? keyColumnsForScope(table, baselineRows, candidates);
    const entry = buildScopeDiff({ scope, baselineRows, changes, keyColumns, candidateRows: candidates });
    scopeEntries.push(entry.scope);
    rowEntries.push(entry.rowEvidence);
  }

  const counts = Object.fromEntries(['entityBaselineCount', 'relationshipBaselineCount', 'inserts', 'updates', 'relationshipDeletes', 'softDisables', 'hardDeletes'].map((field) => [
    field, scopeEntries.reduce((sum, scope) => sum + scope[field], 0),
  ]));
  const diff = {
    schemaVersion: 1,
    producer: 'items_canonical_v2_db_executor',
    rowCountEvidence: 'items_canonical_v2_locked_candidate',
    rowLevelEvidence: { schemaVersion: 1, completeSnapshot: true, scopes: rowEntries },
    sourceCheckedAt: bundle.importPlan?.sourceCheckedAt,
    snapshot: true,
    wholeDomainRebuild: false,
    scopes: scopeEntries,
    counts,
  };
  const plan = {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    sourceSha256: bundle.source.sha256,
    sourceSnapshotHash: rawSourceSnapshot.binding.snapshotHash,
    sourceModuleVersion: rawSourceSnapshot.moduleVersion,
    sourceModuleGeneratedAt: rawSourceSnapshot.moduleGeneratedAt,
    policySetHash: bundle.policy?.policySetHash,
    ownedTableHash: hashJson(ownedTables),
    diff,
    writes,
  };
  return plan;
}

export async function buildItemsCanonicalV2Diff(options = {}) {
  return (await buildItemsCanonicalV2Plan(options)).diff;
}
