import { buildDependencyManifest } from '../automation/eight-domain-dependency-seeder.mjs';
import { BUFF_NPC_INTERNAL_NAME_ALIASES } from './buff-offline-source.mjs';

const LOCAL_ITEM_COLUMNS = Object.freeze([
  'id', 'name', 'name_zh', 'internal_name', 'image', 'category_id', 'description', 'damage', 'defense',
  'knockback', 'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'rarity_id', 'game_period_id',
  'game_model_id', 'is_stackable', 'stack_size', 'status', 'deleted',
]);
const LOCAL_NPC_COLUMNS = Object.freeze([
  'id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'sub_name', 'sub_name_zh',
  'image_url', 'category_id', 'game_period_id', 'game_model_id', 'is_boss', 'boss_group_id',
  'boss_role', 'is_friendly', 'is_town_npc', 'behavior_notes', 'net_id', 'npc_type', 'ai_style',
  'damage', 'defense', 'life_max', 'knock_back_resist', 'width', 'height', 'scale', 'value',
  'buff_immune', 'raw_json', 'status', 'deleted',
]);
const MAINT_ITEM_COLUMNS = Object.freeze([
  'id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page',
  'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
  'landing_content_hash', 'module_generated_at', 'terraria_version', 'major_value', 'combat_value',
  'defense_value', 'use_time', 'stack_size', 'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted',
]);
const MAINT_NPC_COLUMNS = Object.freeze([
  'id', 'source_id', 'internal_name', 'english_name', 'name_zh', 'sub_name_zh', 'source_provider',
  'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key',
  'landing_source_page', 'landing_content_hash', 'module_generated_at', 'terraria_version',
  'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size', 'width', 'height',
  'flags_json', 'raw_json', 'status', 'deleted',
]);

function requireRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} rows are required`);
  return rows;
}

function positiveOrSignedId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id === 0) throw new Error(`${label} stable ID is invalid`);
  return id;
}

function uniqueIndex(rows, key, label, { allowSigned = false } = {}) {
  const index = new Map();
  for (const row of rows) {
    const value = Number(row?.[key]);
    if (!Number.isSafeInteger(value) || value === 0 || (!allowSigned && key !== 'game_id' && value < 0)) {
      throw new Error(`${label} stable key is invalid`);
    }
    if (index.has(value)) throw new Error(`${label} stable key is duplicated: ${value}`);
    index.set(value, row);
  }
  return index;
}

function addDependency({ dependencies, sourceRows, id, sourceDatabase, sourceTable, targetDatabase, targetTable, keyColumn, columns, rows }) {
  if (rows.length === 0) return;
  dependencies.push({
    id,
    purpose: id,
    source: { database: sourceDatabase, table: sourceTable },
    target: { database: targetDatabase, table: targetTable },
    keyColumns: [keyColumn],
    keyValues: rows.map((row) => ({ [keyColumn]: row[keyColumn] })),
    columns: [...columns],
    rowHashes: [],
    expectedRowCount: rows.length,
  });
  sourceRows[id] = rows;
}

export function buildBuffDependencyManifest({
  runId,
  runKey,
  databases,
  localItemRows = [],
  localNpcRows = [],
  maintItemRows = [],
  maintNpcRows = [],
} = {}) {
  const dependencies = [];
  const sourceRows = {};
  addDependency({
    dependencies, sourceRows, id: 'buff-local-item-dependencies',
    sourceDatabase: 'terria_v1_local', sourceTable: 'items', targetDatabase: databases.local,
    targetTable: 'items', keyColumn: 'id', columns: LOCAL_ITEM_COLUMNS, rows: requireRows(localItemRows, 'local Item'),
  });
  addDependency({
    dependencies, sourceRows, id: 'buff-local-npc-dependencies',
    sourceDatabase: 'terria_v1_local', sourceTable: 'npcs', targetDatabase: databases.local,
    targetTable: 'npcs', keyColumn: 'game_id', columns: LOCAL_NPC_COLUMNS, rows: requireRows(localNpcRows, 'local NPC'),
  });
  addDependency({
    dependencies, sourceRows, id: 'buff-maint-item-dependencies',
    sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_items', targetDatabase: databases.maint,
    targetTable: 'maint_items', keyColumn: 'source_id', columns: MAINT_ITEM_COLUMNS, rows: requireRows(maintItemRows, 'maint Item'),
  });
  addDependency({
    dependencies, sourceRows, id: 'buff-maint-npc-dependencies',
    sourceDatabase: 'terria_v1_maint', sourceTable: 'maint_npcs', targetDatabase: databases.maint,
    targetTable: 'maint_npcs', keyColumn: 'source_id', columns: MAINT_NPC_COLUMNS, rows: requireRows(maintNpcRows, 'maint NPC'),
  });
  return buildDependencyManifest({
    manifest: { schemaVersion: 1, domain: 'buffs', runId, runKey, dependencies },
    sourceRows,
  });
}

function resolveItemFact(fact, localItems, maintItems) {
  if (fact?.resolveStatus === 'unresolved') return { ...fact };
  const itemId = Number(fact?.itemId);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return { ...fact, itemId: null, resolveStatus: 'unresolved' };
  const local = localItems.get(itemId);
  const maint = maintItems.get(itemId);
  const internalName = String(fact?.internalName ?? '').trim();
  if (!local || !maint || !internalName
      || local.internal_name !== internalName || maint.internal_name !== internalName) {
    return { ...fact, resolveStatus: 'unresolved' };
  }
  return { ...fact };
}

function resolveNpcFact(fact, localNpcs, maintNpcs, npcIdentityByGameId) {
  if (fact?.resolveStatus === 'unresolved') return { ...fact };
  let npcId;
  try { npcId = positiveOrSignedId(fact?.npcId, 'Buff NPC'); }
  catch { return { ...fact, resolveStatus: 'unresolved' }; }
  const identity = npcIdentityByGameId.get(npcId) ?? null;
  const local = localNpcs.get(npcId);
  const maint = maintNpcs.get(npcId);
  const sourceInternalName = String(fact?.internalName ?? '').trim();
  const expectedInternalName = identity?.internalName;
  const aliasTarget = BUFF_NPC_INTERNAL_NAME_ALIASES[sourceInternalName];
  const sourceMatches = sourceInternalName === expectedInternalName || aliasTarget === expectedInternalName;
  if (!identity || !local || !maint || !sourceMatches
      || local.internal_name !== expectedInternalName || maint.internal_name !== expectedInternalName) {
    return { ...fact, resolveStatus: 'unresolved' };
  }
  return { ...fact };
}

export function bindBuffDependencyResolution({
  records,
  npcIdentityByGameId = {},
  localItemRows = [],
  maintItemRows = [],
  localNpcRows = [],
  maintNpcRows = [],
} = {}) {
  const sourceRecords = requireRows(records, 'Buff source');
  const localItems = uniqueIndex(requireRows(localItemRows, 'local Item'), 'id', 'local Item');
  const maintItems = uniqueIndex(requireRows(maintItemRows, 'maint Item'), 'source_id', 'maint Item');
  const localNpcs = uniqueIndex(requireRows(localNpcRows, 'local NPC'), 'game_id', 'local NPC');
  const maintNpcs = uniqueIndex(requireRows(maintNpcRows, 'maint NPC'), 'source_id', 'maint NPC', { allowSigned: true });
  const npcIdentities = npcIdentityByGameId instanceof Map
    ? npcIdentityByGameId
    : new Map(Object.entries(npcIdentityByGameId).map(([id, internalName]) => [Number(id), { internalName }]));
  const samples = { sourceItems: [], npcFacts: [] };
  let unresolvedSourceItemFacts = 0;
  let unresolvedNpcFacts = 0;
  const reportUnresolved = (field, countField, sample) => {
    if (field.resolveStatus !== 'unresolved') return field;
    if (countField === 'sourceItems') unresolvedSourceItemFacts += 1;
    else unresolvedNpcFacts += 1;
    if (samples[countField].length < 100) samples[countField].push(sample);
    return field;
  };
  const resolvedRecords = sourceRecords.map((record) => ({
    ...structuredClone(record),
    sourceItems: (Array.isArray(record.sourceItems) ? record.sourceItems : []).map((fact, index) => {
      const resolved = resolveItemFact(fact, localItems, maintItems);
      return reportUnresolved(resolved, 'sourceItems', {
        buffSourceId: Number(record.id), buffInternalName: record.internalName,
        sourceItemId: resolved.itemId == null || resolved.itemId === '' ? null : Number(resolved.itemId),
        sourceItemInternalName: resolved.internalName ?? null, sourceOrder: index,
        reason: resolved.resolveStatus === 'unresolved' ? 'stable_item_identity_missing_or_drifted' : null,
      });
    }),
    inflictingNpcs: (Array.isArray(record.inflictingNpcs) ? record.inflictingNpcs : []).map((fact, index) => {
      const resolved = resolveNpcFact(fact, localNpcs, maintNpcs, npcIdentities);
      return reportUnresolved(resolved, 'npcFacts', {
        buffSourceId: Number(record.id), buffInternalName: record.internalName,
        npcId: Number.isSafeInteger(Number(resolved.npcId)) ? Number(resolved.npcId) : null,
        npcInternalName: resolved.internalName ?? null, factGroup: 'inflictingNpcs', sourceOrder: index,
        reason: resolved.resolveStatus === 'unresolved' ? 'stable_npc_identity_missing_or_drifted' : null,
      });
    }),
    immuneNpcs: (Array.isArray(record.immuneNpcs) ? record.immuneNpcs : []).map((fact, index) => {
      const resolved = resolveNpcFact(fact, localNpcs, maintNpcs, npcIdentities);
      return reportUnresolved(resolved, 'npcFacts', {
        buffSourceId: Number(record.id), buffInternalName: record.internalName,
        npcId: Number.isSafeInteger(Number(resolved.npcId)) ? Number(resolved.npcId) : null,
        npcInternalName: resolved.internalName ?? null, factGroup: 'immuneNpcs', sourceOrder: index,
        reason: resolved.resolveStatus === 'unresolved' ? 'stable_npc_identity_missing_or_drifted' : null,
      });
    }),
  }));
  return Object.freeze({
    records: resolvedRecords,
    unresolved: Object.freeze({
      sourceItemFacts: unresolvedSourceItemFacts,
      npcFacts: unresolvedNpcFacts,
      samples: Object.freeze(samples),
    }),
  });
}

export const BUFF_DEPENDENCY_COLUMNS = Object.freeze({
  localItems: LOCAL_ITEM_COLUMNS,
  localNpcs: LOCAL_NPC_COLUMNS,
  maintItems: MAINT_ITEM_COLUMNS,
  maintNpcs: MAINT_NPC_COLUMNS,
});
