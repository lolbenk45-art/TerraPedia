import { MAINT_TABLE_CATALOG } from '../maint/maint-schema.mjs';
import { RELATION_TABLE_CATALOG } from '../relation/relation-schema.mjs';
import { PROJECTION_TABLE_CATALOG } from '../relation/projection-schema.mjs';

const REQUIRED_FIELDS = Object.freeze([
  'key', 'capability', 'databaseRole', 'table', 'fieldGroup', 'columnMode',
  'logicalPredicate', 'logicalKeySchemaVersion', 'writeMode', 'fenceScope', 'rollbackMode'
]);
const DATABASE_ROLES = new Set(['maint', 'relation', 'local']);
const WRITE_MODES = new Set(['read', 'write']);
const COLUMN_MODES = new Set(['whole_table', 'columns']);

const EXCLUSIVE_PARTITIONS = Object.freeze({
  maint_npc_kind: Object.freeze({ resolver: 'resolveNpcKind', partitions: new Set(['non_town', 'town']) }),
  npc_loot_parent_kind: Object.freeze({ resolver: 'resolveNpcLootParentKind', partitions: new Set(['non_boss', 'boss']) }),
  item_group_source_layer: Object.freeze({
    resolver: 'resolveItemGroupSourceLayer',
    partitions: new Set(['source_derived', 'central_override'])
  })
});

const SERIALIZED_SINGLETONS = Object.freeze({
  item_group_projection_state: Object.freeze({
    databaseRole: 'local', table: 'item_group_projection_state', singletonKey: 1
  })
});

export const LOCAL_TARGET_SCHEMA_CATALOG = Object.freeze({
  item_groups: Object.freeze(['canonical_key', 'canonical_name', 'canonical_version', 'created_at',
    'deleted', 'id', 'materialized_at', 'name', 'name_zh', 'normalized_domains_json',
    'record_key', 'relation_record_key', 'source_content_hash', 'source_layer', 'source_priority',
    'status', 'updated_at']),
  item_group_members: Object.freeze(['created_at', 'group_id', 'id', 'internal_name', 'item_id',
    'member_key', 'name', 'name_zh', 'record_key', 'resolution_state', 'sort_order', 'source_item_id',
    'updated_at']),
  item_group_aliases: Object.freeze(['alias_kind', 'alias_language', 'alias_text', 'canonical_key',
    'created_at', 'id', 'normalized_alias', 'record_key', 'sort_order', 'source_layer', 'updated_at']),
  item_group_admin_audit: Object.freeze(['action', 'actor', 'after_logical_key',
    'before_logical_key', 'canonical_key', 'canonical_snapshot_hash', 'created_at', 'id', 'record_key']),
  item_group_projection_state: Object.freeze(['alias_count', 'canonical_snapshot_hash',
    'canonical_version', 'created_at', 'group_count', 'id', 'member_count', 'publication_status',
    'published_at', 'relation_run_key', 'singleton_key', 'updated_at']),
  npcs: Object.freeze(['ai_style', 'banner_item_id', 'banner_source_item_id', 'behavior_notes',
    'boss_group_id', 'boss_role', 'buff_immune', 'catch_item_id', 'catch_source_item_id', 'category_id',
    'created_at', 'damage', 'defense', 'deleted', 'game_id', 'game_model_id', 'game_period_id', 'height',
    'id', 'image_url', 'internal_name', 'is_boss', 'is_friendly', 'is_town_npc', 'knock_back_resist',
    'life_max', 'living_preferences_json', 'loot_items_json', 'name', 'name_zh', 'net_id', 'npc_type',
    'raw_json', 'scale', 'shop_items_json', 'source_id', 'source_items_json', 'status', 'sub_name',
    'sub_name_zh', 'updated_at', 'value', 'width', 'wiki_assets_json']),
  npc_loot_entries: Object.freeze(['chance_text', 'chance_value', 'conditions', 'created_at', 'deleted',
    'drop_source_kind', 'id', 'item_id', 'notes', 'npc_id', 'quantity_max', 'quantity_min',
    'quantity_text', 'sort_order', 'source_item_id', 'status', 'updated_at']),
  npc_buff_relations: Object.freeze(['buff_id', 'buff_source_id', 'chance_text', 'chance_value',
    'conditions', 'created_at', 'deleted', 'duration_ticks', 'id', 'notes', 'npc_id', 'relation_type',
    'sort_order', 'status', 'updated_at']),
  npc_biomes: Object.freeze(['biome_id', 'created_at', 'deleted', 'id', 'notes', 'npc_id',
    'relation_type', 'sort_order', 'source_page', 'source_provider', 'source_revision_timestamp',
    'spawn_context', 'status', 'updated_at']),
  item_acquisition_sources: Object.freeze(['biome_id', 'chance_text', 'chance_value', 'conditions',
    'created_at', 'deleted', 'id', 'item_id', 'notes', 'quantity_max', 'quantity_min', 'quantity_text',
    'sort_order', 'source_page', 'source_provider', 'source_ref_id', 'source_ref_name', 'source_ref_type',
    'source_revision_timestamp', 'source_type', 'status', 'updated_at']),
  items: Object.freeze(['buy', 'category_id', 'created_at', 'damage', 'defense', 'deleted', 'description',
    'description_zh', 'game_model_id', 'game_period_id', 'height', 'id', 'image', 'internal_name',
    'is_stackable', 'knockback', 'last_synced_at', 'name', 'name_zh', 'rarity_id', 'sell', 'slug',
    'source_npcs_json', 'source_page', 'source_provider', 'source_revision_timestamp', 'stack_size',
    'status', 'tooltip', 'tooltip_zh', 'updated_at', 'use_time', 'width'])
});

function predicateAll() {
  return Object.freeze({ kind: 'all' });
}

function predicatePartition(group, partition) {
  return Object.freeze({ kind: 'partition', group, partition, resolver: EXCLUSIVE_PARTITIONS[group].resolver, resolverVersion: 1 });
}

function predicateSerializedSingleton(mutex, singletonKey) {
  return Object.freeze({ kind: 'serialized_singleton', mutex, singletonKey, resolverVersion: 1 });
}

function row({
  key, capability, databaseRole, table, fieldGroup = 'all_columns', columnMode = 'whole_table',
  columns = null, logicalPredicate = predicateAll(), writeMode = 'write',
  rollbackMode = 'scope_snapshot_latest_writer'
}) {
  return Object.freeze({
    key, capability, databaseRole, table, fieldGroup, columnMode,
    columns: columns ? Object.freeze([...columns]) : null,
    logicalPredicate, logicalKeySchemaVersion: 1, writeMode,
    fenceScope: 'databaseRole+table+physicalColumns+logicalPredicate', rollbackMode
  });
}

function capabilityForTable(table) {
  if (/shimmer/.test(table)) return 'shimmer';
  if (/armor|equipment_effect/.test(table)) return 'armor_sets';
  if (/recipe|station/.test(table)) return 'recipes';
  if (/category/.test(table)) return 'category_support';
  if (/biome/.test(table)) return 'biomes';
  if (/boss/.test(table)) return 'bosses';
  if (/projectile/.test(table)) return 'projectiles';
  if (/buff/.test(table)) return 'buffs';
  if (/npc/.test(table)) return 'npcs';
  if (/item/.test(table)) return 'items';
  return 'automation_audit';
}

const SHARED_SCHEMA_TABLES = new Set([
  'maint_npcs', 'maint_item_sources', 'maint_item_biomes', 'item_source_facts', 'item_source_details',
  'item_npc_shop_relations', 'item_npc_loot_relations', 'npc_buff_relations',
  'maint_item_groups', 'maint_item_group_members', 'maint_item_group_aliases',
  'maint_item_group_member_exclusions', 'relation_item_groups', 'relation_item_group_members',
  'relation_item_group_aliases'
]);

const schemaRows = [...MAINT_TABLE_CATALOG, ...RELATION_TABLE_CATALOG, ...PROJECTION_TABLE_CATALOG]
  .filter((entry) => !SHARED_SCHEMA_TABLES.has(entry.table))
  .map((entry) => row({
    key: `${entry.databaseRole}.${entry.table}`,
    capability: capabilityForTable(entry.table),
    databaseRole: entry.databaseRole,
    table: entry.table
  }));

const sharedRows = [
  row({ key: 'maint.maint_npcs.npcs', capability: 'npcs', databaseRole: 'maint', table: 'maint_npcs',
    logicalPredicate: predicatePartition('maint_npc_kind', 'non_town') }),
  row({ key: 'maint.maint_npcs.town', capability: 'town_npc_maintenance', databaseRole: 'maint', table: 'maint_npcs',
    logicalPredicate: predicatePartition('maint_npc_kind', 'town') }),
  row({ key: 'maint.maint_item_sources.items', capability: 'items', databaseRole: 'maint', table: 'maint_item_sources' }),
  row({ key: 'maint.maint_item_sources.npcs_read', capability: 'npcs', databaseRole: 'maint', table: 'maint_item_sources', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'maint.maint_item_sources.town_read', capability: 'town_npc_maintenance', databaseRole: 'maint', table: 'maint_item_sources', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'maint.maint_item_biomes.biomes', capability: 'biomes', databaseRole: 'maint', table: 'maint_item_biomes' }),
  row({ key: 'maint.maint_item_biomes.items_read', capability: 'items', databaseRole: 'maint', table: 'maint_item_biomes', writeMode: 'read', rollbackMode: 'none' }),
  ...['item_source_facts', 'item_source_details'].flatMap((table) => (
    ['items', 'npcs', 'town_npc'].map((owner) => row({
      key: `relation.${table}.${owner}${owner === 'items' ? '' : '_read'}`,
      capability: owner === 'town_npc' ? 'town_npc_maintenance' : owner,
      databaseRole: 'relation', table,
      writeMode: owner === 'items' ? 'write' : 'read', rollbackMode: owner === 'items' ? 'scope_snapshot_latest_writer' : 'none'
    }))
  )),
  row({ key: 'relation.item_npc_shop_relations.items', capability: 'items', databaseRole: 'relation', table: 'item_npc_shop_relations' }),
  row({ key: 'relation.item_npc_shop_relations.npcs_read', capability: 'npcs', databaseRole: 'relation', table: 'item_npc_shop_relations', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'relation.item_npc_shop_relations.town_read', capability: 'town_npc_maintenance', databaseRole: 'relation', table: 'item_npc_shop_relations', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'relation.item_npc_loot_relations.items', capability: 'items', databaseRole: 'relation', table: 'item_npc_loot_relations' }),
  row({ key: 'relation.item_npc_loot_relations.npcs_read', capability: 'npcs', databaseRole: 'relation', table: 'item_npc_loot_relations', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'relation.item_npc_loot_relations.npc_loot_read', capability: 'npc_loot', databaseRole: 'relation', table: 'item_npc_loot_relations', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'relation.item_npc_loot_relations.boss_loot_read', capability: 'boss_loot', databaseRole: 'relation', table: 'item_npc_loot_relations', writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'relation.npc_buff_relations.buffs', capability: 'buffs', databaseRole: 'relation', table: 'npc_buff_relations' }),
  row({ key: 'relation.npc_buff_relations.npcs_read', capability: 'npcs', databaseRole: 'relation', table: 'npc_buff_relations', writeMode: 'read', rollbackMode: 'none' }),
  ...['maint_item_groups', 'maint_item_group_members', 'maint_item_group_aliases'].flatMap((table) => [
    row({ key: `maint.${table}.canonical`, capability: 'item_group_canonical', databaseRole: 'maint', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'source_derived') }),
    row({ key: `maint.${table}.admin`, capability: 'admin_item_group_writer', databaseRole: 'maint', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'central_override') })
  ]),
  row({ key: 'maint.maint_item_group_member_exclusions.admin', capability: 'admin_item_group_writer',
    databaseRole: 'maint', table: 'maint_item_group_member_exclusions' }),
  ...['relation_item_groups', 'relation_item_group_members', 'relation_item_group_aliases'].flatMap((table) => [
    row({ key: `relation.${table}.canonical`, capability: 'item_group_canonical', databaseRole: 'relation', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'source_derived') }),
    row({ key: `relation.${table}.admin`, capability: 'admin_item_group_writer', databaseRole: 'relation', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'central_override') })
  ])
];

const SYSTEM_MANAGED_COLUMNS = new Set(['id', 'created_at', 'updated_at']);
const mutableColumns = (table) => LOCAL_TARGET_SCHEMA_CATALOG[table]
  .filter((column) => !SYSTEM_MANAGED_COLUMNS.has(column));

const NPC_BASE_COLUMNS = mutableColumns('npcs').filter((column) => ![
  'is_boss', 'boss_group_id', 'boss_role', 'is_friendly', 'is_town_npc', 'behavior_notes',
  'wiki_assets_json', 'living_preferences_json', 'shop_items_json'
].includes(column));

const LOCAL_EXCLUSIVE_TABLES = Object.freeze([
  ['item_images', 'items'], ['entity_source_snapshots', 'items'], ['projectiles', 'projectiles'],
  ['buffs', 'buffs'], ['buff_source_items', 'buffs'], ['armor_sets', 'armor_sets'],
  ['armor_set_items', 'armor_sets'], ['recipes', 'recipes'], ['recipe_ingredients', 'recipes'],
  ['recipe_stations', 'recipes'], ['crafting_stations', 'recipes'],
  ['recipe_context_requirements', 'recipes'], ['biomes', 'biomes'], ['biome_relations', 'biomes'],
  ['biome_resources', 'biomes'], ['item_biomes', 'biomes'], ['boss_groups', 'bosses'],
  ['npc_shop_entries', 'town_npc_maintenance'], ['npc_shop_conditions', 'town_npc_maintenance'],
  ['condition_terms', 'town_npc_maintenance'], ['world_contexts', 'town_npc_maintenance'],
  ['shimmer_item_transforms', 'shimmer'], ['shimmer_decraft_rules', 'shimmer'],
  ['shimmer_entity_transforms', 'shimmer'], ['shimmer_npc_transforms', 'shimmer'],
  ['audio_assets', 'audio'], ['audio_asset_links', 'audio'], ['category', 'category_support'],
  ['item_category_rel', 'category_support'], ['source_dataset_landings', 'landing']
]);

const localRows = [
  ...LOCAL_EXCLUSIVE_TABLES.map(([table, capability]) => row({
    key: `local.${table}`, capability, databaseRole: 'local', table
  })),
  row({ key: 'local.items.base', capability: 'items', databaseRole: 'local', table: 'items',
    fieldGroup: 'base_excluding_category_id', columnMode: 'columns',
    columns: mutableColumns('items').filter((column) => column !== 'category_id') }),
  row({ key: 'local.npcs', capability: 'npcs', databaseRole: 'local', table: 'npcs',
    fieldGroup: 'base_entity', columnMode: 'columns', columns: NPC_BASE_COLUMNS }),
  row({ key: 'local.npcs.boss_membership', capability: 'bosses', databaseRole: 'local', table: 'npcs',
    fieldGroup: 'boss_membership', columnMode: 'columns', columns: ['is_boss', 'boss_group_id', 'boss_role'] }),
  row({ key: 'local.npcs.town_profile', capability: 'town_npc_maintenance', databaseRole: 'local', table: 'npcs',
    fieldGroup: 'town_profile', columnMode: 'columns', columns: ['is_friendly', 'is_town_npc',
      'behavior_notes', 'wiki_assets_json', 'living_preferences_json', 'shop_items_json'] }),
  row({ key: 'local.npc_loot_entries.non_boss', capability: 'npc_loot', databaseRole: 'local',
    table: 'npc_loot_entries', columnMode: 'columns', columns: mutableColumns('npc_loot_entries'),
    logicalPredicate: predicatePartition('npc_loot_parent_kind', 'non_boss') }),
  row({ key: 'local.npc_loot_entries.boss', capability: 'boss_loot', databaseRole: 'local',
    table: 'npc_loot_entries', columnMode: 'columns', columns: mutableColumns('npc_loot_entries'),
    logicalPredicate: predicatePartition('npc_loot_parent_kind', 'boss') }),
  row({ key: 'local.npc_buff_relations.buffs', capability: 'buffs', databaseRole: 'local',
    table: 'npc_buff_relations', columnMode: 'columns', columns: mutableColumns('npc_buff_relations') }),
  row({ key: 'local.npc_buff_relations.npcs_read', capability: 'npcs', databaseRole: 'local',
    table: 'npc_buff_relations', columnMode: 'columns', columns: mutableColumns('npc_buff_relations'),
    writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'local.npc_biomes.biomes', capability: 'biomes', databaseRole: 'local', table: 'npc_biomes',
    columnMode: 'columns', columns: mutableColumns('npc_biomes') }),
  row({ key: 'local.npc_biomes.npcs_read', capability: 'npcs', databaseRole: 'local', table: 'npc_biomes',
    columnMode: 'columns', columns: mutableColumns('npc_biomes'), writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'local.item_acquisition_sources.biomes', capability: 'biomes', databaseRole: 'local',
    table: 'item_acquisition_sources', columnMode: 'columns', columns: mutableColumns('item_acquisition_sources') }),
  row({ key: 'local.item_acquisition_sources.items_read', capability: 'items', databaseRole: 'local',
    table: 'item_acquisition_sources', columnMode: 'columns', columns: mutableColumns('item_acquisition_sources'),
    writeMode: 'read', rollbackMode: 'none' }),
  row({ key: 'local.items.category_id', capability: 'category_support', databaseRole: 'local', table: 'items',
    fieldGroup: 'category_id', columnMode: 'columns', columns: ['category_id'] }),
  ...['item_groups', 'item_group_members', 'item_group_aliases'].flatMap((table) => [
    row({ key: `local.${table}.canonical`, capability: 'item_group_canonical', databaseRole: 'local', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'source_derived') }),
    row({ key: `local.${table}.admin`, capability: 'admin_item_group_writer', databaseRole: 'local', table,
      logicalPredicate: predicatePartition('item_group_source_layer', 'central_override') })
  ]),
  row({ key: 'local.item_group_admin_audit.admin', capability: 'admin_item_group_writer',
    databaseRole: 'local', table: 'item_group_admin_audit', rollbackMode: 'append_only' }),
  row({ key: 'local.item_group_projection_state.canonical', capability: 'item_group_canonical',
    databaseRole: 'local', table: 'item_group_projection_state',
    logicalPredicate: predicateSerializedSingleton('item_group_projection_state', 1) }),
  row({ key: 'local.item_group_projection_state.admin', capability: 'admin_item_group_writer',
    databaseRole: 'local', table: 'item_group_projection_state',
    logicalPredicate: predicateSerializedSingleton('item_group_projection_state', 1) })
];

export const TABLE_OWNERSHIP_MATRIX = Object.freeze([...schemaRows, ...sharedRows, ...localRows]);

const KNOWN_TABLES = Object.freeze({
  maint: new Set(MAINT_TABLE_CATALOG.map((entry) => entry.table)),
  relation: new Set([...RELATION_TABLE_CATALOG, ...PROJECTION_TABLE_CATALOG].map((entry) => entry.table)),
  local: new Set([...Object.keys(LOCAL_TARGET_SCHEMA_CATALOG), ...LOCAL_EXCLUSIVE_TABLES.map(([table]) => table)])
});

function columnsIntersect(left, right) {
  if (left.columnMode === 'whole_table' || right.columnMode === 'whole_table') return true;
  const rightColumns = new Set(right.columns);
  return left.columns.some((column) => rightColumns.has(column));
}

function predicatesAreCertifiedDisjoint(left, right) {
  const leftPredicate = left.logicalPredicate;
  const rightPredicate = right.logicalPredicate;
  if (leftPredicate.kind !== 'partition' || rightPredicate.kind !== 'partition') return false;
  if (leftPredicate.group !== rightPredicate.group) return false;
  const partitions = EXCLUSIVE_PARTITIONS[leftPredicate.group]?.partitions;
  return Boolean(partitions
    && partitions.has(leftPredicate.partition)
    && partitions.has(rightPredicate.partition)
    && leftPredicate.partition !== rightPredicate.partition);
}

function predicatesShareCertifiedSerialization(left, right) {
  const leftPredicate = left.logicalPredicate;
  const rightPredicate = right.logicalPredicate;
  if (leftPredicate.kind !== 'serialized_singleton' || rightPredicate.kind !== 'serialized_singleton') {
    return false;
  }
  return leftPredicate.mutex === rightPredicate.mutex
    && leftPredicate.singletonKey === rightPredicate.singletonKey
    && leftPredicate.resolverVersion === rightPredicate.resolverVersion;
}

export function assertNoOwnershipOverlap(rows) {
  const writers = rows.filter((entry) => entry.writeMode === 'write');
  for (let leftIndex = 0; leftIndex < writers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < writers.length; rightIndex += 1) {
      const left = writers[leftIndex];
      const right = writers[rightIndex];
      if (left.databaseRole !== right.databaseRole || left.table !== right.table) continue;
      if (columnsIntersect(left, right)
        && !predicatesAreCertifiedDisjoint(left, right)
        && !predicatesShareCertifiedSerialization(left, right)) {
        throw new Error(`ownership overlap: ${left.key} intersects ${right.key}`);
      }
    }
  }
}

export function validateOwnershipMatrix(rows = TABLE_OWNERSHIP_MATRIX) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('table ownership matrix must be non-empty');
  const keys = new Set();
  for (const entry of rows) {
    for (const field of REQUIRED_FIELDS) {
      if (entry?.[field] === undefined || entry[field] === null || (typeof entry[field] === 'string' && !entry[field].trim())) {
        throw new Error(`ownership row ${entry?.key ?? '<unknown>'} has invalid ${field}`);
      }
    }
    if (!DATABASE_ROLES.has(entry.databaseRole) || !KNOWN_TABLES[entry.databaseRole].has(entry.table)) {
      throw new Error(`unknown table or databaseRole: ${entry.databaseRole}.${entry.table}`);
    }
    if (!WRITE_MODES.has(entry.writeMode) || !COLUMN_MODES.has(entry.columnMode)) {
      throw new Error(`unknown ownership mode for ${entry.key}`);
    }
    if (entry.columnMode === 'columns') {
      if (!Array.isArray(entry.columns) || entry.columns.length === 0 || new Set(entry.columns).size !== entry.columns.length) {
        throw new Error(`invalid physical columns for ${entry.key}`);
      }
      if (entry.databaseRole === 'local') {
        const knownColumns = new Set(LOCAL_TARGET_SCHEMA_CATALOG[entry.table]);
        if (entry.columns.some((column) => !knownColumns.has(column))) {
          throw new Error(`unknown physical column for ${entry.key}`);
        }
      }
    }
    const predicate = requireStructuredPredicate(entry.logicalPredicate, entry.key);
    if (predicate.kind === 'partition') {
      const partitionSpec = EXCLUSIVE_PARTITIONS[predicate.group];
      if (!partitionSpec?.partitions.has(predicate.partition)
        || predicate.resolver !== partitionSpec.resolver || predicate.resolverVersion !== 1) {
        throw new Error(`unknown predicate partition or resolver for ${entry.key}`);
      }
    }
    if (predicate.kind === 'serialized_singleton') {
      const singletonSpec = SERIALIZED_SINGLETONS[predicate.mutex];
      if (!singletonSpec || singletonSpec.databaseRole !== entry.databaseRole
        || singletonSpec.table !== entry.table || singletonSpec.singletonKey !== predicate.singletonKey
        || predicate.resolverVersion !== 1) {
        throw new Error(`ownership overlap: unknown serialized singleton predicate for ${entry.key}`);
      }
    }
    if (!Number.isInteger(entry.logicalKeySchemaVersion) || entry.logicalKeySchemaVersion < 1) {
      throw new Error(`invalid logicalKeySchemaVersion for ${entry.key}`);
    }
    if (keys.has(entry.key)) throw new Error(`duplicate ownership key: ${entry.key}`);
    keys.add(entry.key);
  }
  assertNoOwnershipOverlap(rows);
  return true;
}

function requireStructuredPredicate(predicate, key) {
  if (!predicate || typeof predicate !== 'object'
    || !['all', 'partition', 'serialized_singleton'].includes(predicate.kind)) {
    throw new Error(`structured logicalPredicate is required for ${key}`);
  }
  if (predicate.kind === 'partition' && (!predicate.group || !predicate.partition)) {
    throw new Error(`predicate group and partition are required for ${key}`);
  }
  if (predicate.kind === 'serialized_singleton'
    && (!predicate.mutex || !Number.isInteger(predicate.singletonKey))) {
    throw new Error(`serialized singleton mutex and key are required for ${key}`);
  }
  return predicate;
}

export function findOwnershipRows(table, databaseRole) {
  return TABLE_OWNERSHIP_MATRIX.filter((entry) => (
    entry.table === table && (!databaseRole || entry.databaseRole === databaseRole)
  ));
}

export function matchesOwnershipPredicate(entry, candidate) {
  const predicate = requireStructuredPredicate(entry.logicalPredicate, entry.key);
  if (predicate.kind === 'all') return true;
  if (predicate.kind === 'serialized_singleton') {
    return Number(candidate.singletonKey ?? candidate.singleton_key) === predicate.singletonKey;
  }
  const resolver = {
    resolveNpcKind: (value) => {
      const marker = value.isTownNpc ?? value.is_town_npc;
      if (marker === true || marker === 1) return 'town';
      if (marker === false || marker === 0) return 'non_town';
      return null;
    },
    resolveNpcLootParentKind: (value) => {
      const parentKind = value.parentKind ?? value.parent_kind;
      if (parentKind === 'non_boss' && (value.dropSourceKind ?? value.drop_source_kind) === 'npc_drop') return 'non_boss';
      if (parentKind === 'boss' && (value.bossGroupDeclared ?? value.boss_group_declared) === true) return 'boss';
      return null;
    },
    resolveItemGroupSourceLayer: (value) => {
      const layer = value.sourceLayer ?? value.source_layer;
      if (layer === 'recipe_reference' || layer === 'source_group') return 'source_derived';
      if (layer === 'central_override') return 'central_override';
      return null;
    }
  }[predicate.resolver];
  if (!resolver) return false;
  return resolver(candidate) === predicate.partition;
}

export function extractLocalTargetColumnsFromMigrations(sources, targetTables) {
  const result = Object.fromEntries(targetTables.map((table) => [table, new Set()]));
  for (const source of sources) {
    for (const table of targetTables) {
      const quotedTable = '`?' + table + '`?';
      const targetCreate = new RegExp('\\bCREATE(?:\\s+OR\\s+REPLACE|\\s+TEMPORARY)?\\s+TABLE(?: IF NOT EXISTS)?\\s+' + quotedTable + '(?=\\s|\\()', 'i');
      const createStatements = [...source.matchAll(new RegExp('CREATE TABLE(?: IF NOT EXISTS)?\\s+' + quotedTable + '\\s+([\\s\\S]*?);', 'gi'))];
      if (targetCreate.test(source) && createStatements.length === 0) {
        throw new Error(`unsupported Flyway table DDL for ${table}`);
      }
      for (const create of createStatements) {
        const definition = create[1].match(/^\s*\(([\s\S]*)\)\s*(?:ENGINE[^;]*)?$/i);
        if (!definition) throw new Error(`unsupported Flyway table DDL for ${table}`);
        const tableConstraintKeywords = new Set(['PRIMARY', 'UNIQUE', 'KEY', 'INDEX', 'CONSTRAINT', 'FOREIGN', 'CHECK']);
        for (const match of definition[1].matchAll(/(?:^|,)\s*(?:`([^`]+)`|([a-zA-Z_][a-zA-Z0-9_]*))\s+[A-Z]/gmi)) {
          const column = match[1] ?? match[2];
          if (match[1] || !tableConstraintKeywords.has(column.toUpperCase())) result[table].add(column);
        }
      }
      for (const alter of source.matchAll(new RegExp('ALTER TABLE\\s+' + quotedTable + '([\\s\\S]*?);', 'gi'))) {
        const body = alter[1];
        if (/\bRENAME\s+(?:TO|AS)\b/i.test(body)) {
          throw new Error(`unsupported Flyway table DDL for ${table}`);
        }
        for (const match of body.matchAll(/ADD\s+(?:COLUMN\s+(?:IF NOT EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?|(?:IF NOT EXISTS\s+)?(?!PRIMARY\b|UNIQUE\b|KEY\b|INDEX\b|CONSTRAINT\b|FOREIGN\b|CHECK\b)`?([a-zA-Z_][a-zA-Z0-9_]*)`?)\s+[a-zA-Z]/gi)) {
          result[table].add(match[1] ?? match[2]);
        }
        for (const match of body.matchAll(/DROP\s+(?:COLUMN\s+(?:IF EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?|(?:IF EXISTS\s+)?(?!PRIMARY\b|KEY\b|INDEX\b|FOREIGN\b|CONSTRAINT\b|CHECK\b)`?([a-zA-Z_][a-zA-Z0-9_]*)`?)/gi)) {
          result[table].delete(match[1] ?? match[2]);
        }
        for (const match of body.matchAll(/RENAME COLUMN\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+TO\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)) {
          result[table].delete(match[1]); result[table].add(match[2]);
        }
        for (const match of body.matchAll(/CHANGE\s+(?:COLUMN\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi)) {
          result[table].delete(match[1]); result[table].add(match[2]);
        }
        for (const match of body.matchAll(/MODIFY\s+(?:COLUMN\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+[a-zA-Z]/gi)) {
          if (!result[table].has(match[1])) {
            throw new Error(`cannot modify unknown Flyway column ${table}.${match[1]}`);
          }
        }
        for (const operation of body.matchAll(/\b(ADD|DROP|RENAME|CHANGE|MODIFY|ALTER)\b/gi)) {
          const tail = body.slice(operation.index);
          const recognized = {
            ADD: /^ADD\s+(?:(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?`?[a-zA-Z_][a-zA-Z0-9_]*`?\s+[a-zA-Z]|(?:PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK)\b)/i,
            DROP: /^DROP\s+(?:(?:COLUMN\s+)?(?:IF EXISTS\s+)?`?[a-zA-Z_][a-zA-Z0-9_]*`?|(?:PRIMARY|KEY|INDEX|FOREIGN|CONSTRAINT|CHECK)\b)/i,
            RENAME: /^RENAME\s+(?:COLUMN\s+`?[a-zA-Z_][a-zA-Z0-9_]*`?\s+TO\s+`?[a-zA-Z_][a-zA-Z0-9_]*`?|INDEX\b)/i,
            CHANGE: /^CHANGE\s+(?:COLUMN\s+)?`?[a-zA-Z_][a-zA-Z0-9_]*`?\s+`?[a-zA-Z_][a-zA-Z0-9_]*`?\s+[a-zA-Z]/i,
            MODIFY: /^MODIFY\s+(?:COLUMN\s+)?`?[a-zA-Z_][a-zA-Z0-9_]*`?\s+[a-zA-Z]/i,
            ALTER: null
          }[operation[1].toUpperCase()];
          if (!recognized?.test(tail)) throw new Error(`unsupported Flyway column DDL for ${table}`);
        }
      }
      for (const match of source.matchAll(new RegExp(`TABLE_NAME\\s*=\\s*'${table}'[\\s\\S]{0,220}?COLUMN_NAME\\s*=\\s*'([^']+)'`, 'gi'))) {
        result[table].add(match[1]);
      }
      if (new RegExp('(?:DROP TABLE|RENAME TABLE)\\s+' + quotedTable, 'i').test(source)) {
        throw new Error(`unsupported Flyway table DDL for ${table}`);
      }
    }
  }
  return result;
}

validateOwnershipMatrix();
