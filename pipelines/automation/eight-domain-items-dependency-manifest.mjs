import { buildDependencyManifest, validateDependencyManifest } from './eight-domain-dependency-seeder.mjs';
import { resolveItemCategoryCode } from '../lib/item-category-normalization.mjs';
import { ITEMINFO_LANDING_COLUMNS } from './eight-domain-items-source-manifest.mjs';

const LANDING_COLUMNS = ITEMINFO_LANDING_COLUMNS;
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
  'id', 'game_id', 'source_id', 'internal_name', 'name', 'name_zh', 'sub_name', 'sub_name_zh',
  'image_url', 'category_id', 'game_period_id', 'game_model_id', 'is_boss', 'boss_group_id',
  'boss_role', 'is_friendly', 'is_town_npc', 'behavior_notes', 'net_id', 'npc_type', 'ai_style',
  'damage', 'defense', 'life_max', 'knock_back_resist', 'width', 'height', 'scale', 'value',
  'buff_immune', 'raw_json', 'status', 'deleted',
]);
export const MAINT_ITEM_CATEGORY_COLUMNS = Object.freeze([
  'record_key', 'top_level', 'template_title', 'section_title', 'group_name', 'item_internal_name',
  'item_english_name', 'item_name', 'item_href', 'item_count', 'parent_item_name', 'depth', 'is_group_node',
  'source_provider', 'source_page', 'source_revision_timestamp', 'landing_source_id', 'landing_source_key',
  'landing_source_page', 'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'raw_json', 'status', 'deleted',
]);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireSafeIdentifier(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(text)) throw new Error(`${label} is not a safe identifier`);
  return text;
}

function targetDatabaseSet(databases) {
  const input = requireObject(databases, 'Items dependency databases');
  if (Object.keys(input).sort().join(',') !== 'local,maint,relation') {
    throw new Error('Items dependency database roles must be exactly local, maint, and relation');
  }
  const runKeys = new Set();
  for (const role of ['local', 'maint', 'relation']) {
    const name = requireSafeIdentifier(input[role], `${role} database`);
    const match = name.match(/^terria_v1_automation_acceptance_(e8p_[0-9a-f]{16})_(local|maint|relation)$/);
    if (!match || match[2] !== role) throw new Error(`Items dependency ${role} database is not an exact run-derived schema`);
    runKeys.add(match[1]);
  }
  if (runKeys.size !== 1) throw new Error('Items dependency database roles do not share one run identity');
  return input;
}

function requireRows(value, label) {
  const rows = requireArray(value, label);
  if (rows.length === 0) throw new Error(`${label} cannot be empty`);
  rows.forEach((row, index) => requireObject(row, `${label}[${index}]`));
  return rows;
}

function stableIds(rows, field, label) {
  const ids = rows.map((row, index) => {
    const id = Number(row[field]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label}[${index}] has an invalid stable ID`);
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate stable IDs`);
  return ids;
}

function assertExactIds(rows, field, expectedIds, label) {
  const actual = stableIds(rows, field, label).sort((a, b) => a - b);
  const expected = [...expectedIds].map(Number).sort((a, b) => a - b);
  if (actual.join(',') !== expected.join(',')) throw new Error(`${label} IDs differ from the exact source dependency closure`);
}

function dependency({
  id, purpose, sourceRole, sourceTable, targetRole, targetTable, keyColumns, columns, rows,
  targetSeedPolicy = undefined,
}) {
  return {
    id,
    purpose,
    source: { database: `terria_v1_${sourceRole}`, table: sourceTable },
    target: { database: `__TARGET_${targetRole}__`, table: targetTable },
    keyColumns: [...keyColumns],
    columns: [...columns],
    keyValues: rows.map((row) => Object.fromEntries(keyColumns.map((column) => [column, row[column]]))),
    rowHashes: rows.map(() => ({ key: {}, sha256: `sha256:${'0'.repeat(64)}` })),
    expectedRowCount: rows.length,
    ...(targetSeedPolicy ? { targetSeedPolicy } : {}),
  };
}

function bindTargets(input, targets) {
  return {
    ...input,
    dependencies: input.dependencies.map((entry) => ({
      ...entry,
      target: {
        ...entry.target,
        database: targets[entry.target.database.slice('__TARGET_'.length, -2)],
      },
    })),
  };
}

export function buildItemsDependencyManifest({ sourceManifest, databases, sourceRows } = {}) {
  const source = requireObject(sourceManifest, 'Items source manifest');
  if (source.schemaVersion !== 1 || source.manifestKind !== 'eight_domain_items_source'
      || source.runId !== 'e8pr-items-20261017-v1' || !Array.isArray(source.selectedIds)
      || !Array.isArray(source.itemInfoMatches) || source.itemRelations == null) {
    throw new Error('Items dependency manifest requires the fixed relation-bound source manifest');
  }
  const targets = targetDatabaseSet(databases);
  const rows = requireObject(sourceRows, 'Items exact dependency source rows');
  const landingRows = requireRows(rows.iteminfoLanding, 'ItemInfo landing dependency');
  if (landingRows.length !== 1 || Number(landingRows[0].id) !== Number(source.landing.sourceId)
      || landingRows[0].content_hash !== String(source.landing.contentHash).replace(/^sha256:/, '')
      || landingRows[0].is_current !== 1 || landingRows[0].dataset_type !== 'items_raw'
      || landingRows[0].source_key !== 'wiki.module.iteminfo') {
    throw new Error('ItemInfo landing dependency differs from the exact current source manifest row');
  }
  const recipeIds = source.itemRelations.recipeDependencyItemIds.map(Number);
  const recipeItems = requireRows(rows.recipeItems, 'Recipe local Item dependencies');
  assertExactIds(recipeItems, 'id', recipeIds, 'Recipe local Item dependencies');
  const recipeMaintItems = requireRows(rows.recipeMaintItems, 'Recipe maint Item dependencies');
  assertExactIds(recipeMaintItems, 'source_id', recipeIds, 'Recipe maint Item dependencies');
  const selectedItemNames = new Set((source.selectedItems ?? []).map((row) => String(row.internalName).trim().toLowerCase()));
  const itemCategories = rows.itemCategories == null ? [] : requireArray(rows.itemCategories, 'Selected Item category dependencies');
  if (itemCategories.some((row) => !selectedItemNames.has(String(row.item_internal_name ?? '').trim().toLowerCase()))) {
    throw new Error('selected Item category dependencies contain an undeclared item internal_name');
  }
  const itemCategoryLandings = rows.itemCategoryLandings == null ? [] : requireArray(rows.itemCategoryLandings, 'Selected Item category landing dependencies');
  const categoryLandingIds = [...new Set(itemCategories.map((row) => Number(row.landing_source_id)))].sort((a, b) => a - b);
  const observedCategoryLandingIds = stableIds(itemCategoryLandings, 'id', 'Selected Item category landing dependencies').sort((a, b) => a - b);
  if (observedCategoryLandingIds.join(',') !== categoryLandingIds.join(',')) {
    throw new Error('selected Item category landing IDs differ from the exact category row source bindings');
  }
  const categoryLandingById = new Map(itemCategoryLandings.map((row) => [Number(row.id), row]));
  for (const [index, row] of itemCategories.entries()) {
    const landing = categoryLandingById.get(Number(row.landing_source_id));
    if (!landing || landing.dataset_type !== 'categories_raw'
        || String(row.landing_source_key ?? '') !== String(landing.source_key ?? '')
        || String(row.landing_source_page ?? '') !== String(landing.source_page ?? '')
        || String(row.landing_content_hash ?? '') !== String(landing.content_hash ?? '')
        || String(row.source_revision_timestamp ?? '') !== String(landing.source_revision_timestamp ?? '')) {
      throw new Error(`selected Item category row ${index} is not bound to its exact categories_raw landing`);
    }
  }
  const localNpcRows = rows.localNpcs == null ? [] : requireRows(rows.localNpcs, 'Stable local NPC source dependencies');
  stableIds(localNpcRows, 'id', 'Stable local NPC source dependencies');
  const sourceNpcIds = new Map(localNpcRows.map((row) => [String(row.internal_name ?? '').trim().toLowerCase(), Number(row.source_id ?? row.game_id ?? row.id)]));
  if ([...sourceNpcIds.values()].some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('stable Item source NPC dependencies require positive source_id identities');
  }
  const declaredNpcNames = new Set((source.itemRelations.npcReferenceNames ?? []).map((name) => String(name).trim().toLowerCase()));
  if (localNpcRows.some((row) => !declaredNpcNames.has(String(row.internal_name ?? '').trim().toLowerCase()))) {
    throw new Error('stable Item source NPC dependencies must match an exact declared internal_name identity');
  }
  const manifest = {
    schemaVersion: 1,
    domain: 'items',
    runId: source.runId,
    runKey: targets.local.match(/_(e8p_[0-9a-f]{16})_local$/)?.[1],
    stableSourceNpcBindings: localNpcRows.map((row) => ({
      sourceId: sourceNpcIds.get(String(row.internal_name).trim().toLowerCase()),
      localId: Number(row.id),
      internalName: String(row.internal_name).trim(),
    })),
    selectedItemCategoryLandingIds: categoryLandingIds,
    unresolvedSourceNpcReferences: (source.itemRelations.npcReferenceNames ?? [])
      .filter((sourceRefName) => !localNpcRows.some((row) => String(row.internal_name ?? '').trim().toLowerCase() === String(sourceRefName).trim().toLowerCase()))
      .map((sourceRefName) => ({
      sourceRefName,
      reason: 'no_stable_internal_name_or_id_in_frozen_relation_view',
      sourceRowsSha256: source.itemRelations.selectedRowsSha256.itemSources,
      })),
    dependencies: [
      dependency({ id: 'iteminfo-landing', purpose: 'iteminfo-landing', sourceRole: 'local', sourceTable: 'source_dataset_landings', targetRole: 'local', targetTable: 'source_dataset_landings', keyColumns: ['id'], columns: LANDING_COLUMNS, rows: landingRows }),
      ...(itemCategoryLandings.length === 0 ? [] : [dependency({ id: 'selected-item-category-landings', purpose: 'selected-item-category-landings', sourceRole: 'local', sourceTable: 'source_dataset_landings', targetRole: 'local', targetTable: 'source_dataset_landings', keyColumns: ['id'], columns: LANDING_COLUMNS, rows: itemCategoryLandings })]),
      dependency({ id: 'recipe-item-dependencies', purpose: 'recipe-item-dependencies', sourceRole: 'local', sourceTable: 'items', targetRole: 'local', targetTable: 'items', keyColumns: ['id'], columns: LOCAL_ITEM_COLUMNS, rows: recipeItems }),
      dependency({ id: 'recipe-item-maint-dependencies', purpose: 'recipe-item-maint-dependencies', sourceRole: 'maint', sourceTable: 'maint_items', targetRole: 'maint', targetTable: 'maint_items', keyColumns: ['source_id'], columns: MAINT_ITEM_COLUMNS, rows: recipeMaintItems }),
      ...(itemCategories.length === 0 ? [] : [dependency({ id: 'selected-item-category-rows', purpose: 'selected-item-category-rows', sourceRole: 'maint', sourceTable: 'maint_item_categories', targetRole: 'maint', targetTable: 'maint_item_categories', keyColumns: ['record_key'], columns: MAINT_ITEM_CATEGORY_COLUMNS, rows: itemCategories })]),
      ...(localNpcRows.length === 0 ? [] : [dependency({ id: 'stable-item-source-npc-dependencies-local', purpose: 'stable-item-source-npc-dependencies-local', sourceRole: 'local', sourceTable: 'npcs', targetRole: 'local', targetTable: 'npcs', keyColumns: ['id'], columns: LOCAL_NPC_COLUMNS, rows: localNpcRows })]),
    ],
  };
  const bound = bindTargets(manifest, targets);
  const exact = buildDependencyManifest({ manifest: bound, sourceRows: {
    'iteminfo-landing': landingRows,
    ...(itemCategoryLandings.length === 0 ? {} : { 'selected-item-category-landings': itemCategoryLandings }),
    'recipe-item-dependencies': recipeItems,
    'recipe-item-maint-dependencies': recipeMaintItems,
    ...(itemCategories.length === 0 ? {} : { 'selected-item-category-rows': itemCategories }),
    ...(localNpcRows.length === 0 ? {} : { 'stable-item-source-npc-dependencies-local': localNpcRows }),
  } });
  return validateDependencyManifest(exact, { databases: targets });
}

export function assertItemsDependencyManifest(value, { sourceManifest, databases } = {}) {
  const validated = validateDependencyManifest(value, { databases: targetDatabaseSet(databases) });
  if (validated.domain !== 'items' || validated.runId !== sourceManifest?.runId) {
    throw new Error('Items dependency manifest identity differs from the source manifest');
  }
  const byId = new Map(validated.dependencies.map((entry) => [entry.id, entry]));
  for (const id of [
    'iteminfo-landing', 'recipe-item-dependencies',
    'recipe-item-maint-dependencies',
  ]) {
    if (!byId.has(id)) throw new Error(`Items dependency manifest is missing ${id}`);
  }
  const categoryRows = byId.get('selected-item-category-rows');
  const categoryLandings = byId.get('selected-item-category-landings');
  if (categoryRows && categoryRows.keyValues.some((key) => !/^[a-f0-9]{64}$/.test(String(key.record_key ?? '')))) {
    throw new Error('selected Item category dependency keys are invalid');
  }
  if (Boolean(categoryRows) !== Boolean(categoryLandings)) {
    throw new Error('selected Item category rows and exact category landing dependencies must be declared together');
  }
  if (categoryRows && categoryLandings) {
    const categoryIds = [...new Set((validated.selectedItemCategoryLandingIds ?? []).map(Number))].sort((a, b) => a - b);
    const landingIds = categoryLandings.keyValues.map((key) => Number(key.id)).sort((a, b) => a - b);
    if (categoryLandings.purpose !== 'selected-item-category-landings'
        || categoryLandings.source.table !== 'source_dataset_landings'
        || categoryLandings.target.table !== 'source_dataset_landings'
        || categoryIds.length === 0 || categoryIds.join(',') !== landingIds.join(',')) {
      throw new Error('selected Item category landing dependency IDs differ from the exact category row source IDs');
    }
  }
  if (!Array.isArray(validated.selectedItemCategoryLandingIds)
      || validated.selectedItemCategoryLandingIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)
      || new Set(validated.selectedItemCategoryLandingIds.map(Number)).size !== validated.selectedItemCategoryLandingIds.length) {
    throw new Error('Items dependency manifest selected category landing identity list is invalid');
  }
  const landing = byId.get('iteminfo-landing');
  if (!landing || landing.purpose !== 'iteminfo-landing'
      || landing.source.table !== 'source_dataset_landings' || landing.target.table !== 'source_dataset_landings'
      || landing.expectedRowCount !== 1 || Number(landing.keyValues[0]?.id) !== Number(sourceManifest?.landing?.sourceId)) {
    throw new Error('Items dependency manifest landing ID differs from the source manifest');
  }
  if (landing.rowHashes[0]?.sha256 !== sourceManifest?.landing?.canonicalSourceRowSha256) {
    throw new Error('Items dependency manifest full ItemInfo landing row hash differs from the source manifest');
  }
  const recipeIds = sourceManifest?.itemRelations?.recipeDependencyItemIds ?? [];
  for (const id of ['recipe-item-dependencies', 'recipe-item-maint-dependencies']) {
    const entry = byId.get(id);
    const column = id === 'recipe-item-dependencies' ? 'id' : 'source_id';
    const actual = entry.keyValues.map((value) => Number(value[column])).sort((a, b) => a - b);
    const expected = recipeIds.map(Number).sort((a, b) => a - b);
    if (actual.join(',') !== expected.join(',')) throw new Error(`Items dependency ${id} differs from the exact recipe Item IDs`);
  }
  const localNpcDependencies = byId.get('stable-item-source-npc-dependencies-local');
  if (localNpcDependencies && localNpcDependencies.expectedRowCount < 1) {
    throw new Error('stable Item source NPC dependency declaration cannot be empty');
  }
  const unresolvedNpcNames = validated.unresolvedSourceNpcReferences?.map((row) => row.sourceRefName).sort() ?? [];
  const bindings = validated.stableSourceNpcBindings ?? [];
  if (!Array.isArray(bindings) || bindings.some((row) => (
    !Number.isSafeInteger(Number(row.sourceId)) || Number(row.sourceId) <= 0
      || !Number.isSafeInteger(Number(row.localId)) || Number(row.localId) <= 0
      || !(sourceManifest.itemRelations.npcReferenceNames ?? []).some((name) => String(name).toLowerCase() === String(row.internalName).toLowerCase())
  ))) throw new Error('Items stable NPC source bindings are invalid');
  if (bindings.length !== (localNpcDependencies?.expectedRowCount ?? 0)) {
    throw new Error('Items stable NPC source bindings differ from the exact declared NPC dependencies');
  }
  if (localNpcDependencies && localNpcDependencies.keyValues.some((key) => !Number.isSafeInteger(Number(key.id)))) {
    throw new Error('Items local NPC stable identity keys are invalid');
  }
  if (localNpcDependencies && bindings.some((binding) => !localNpcDependencies.keyValues.some((key) => Number(key.id) === Number(binding.localId)))) {
    throw new Error('Items local NPC ID bindings differ from the exact target dependency key set');
  }
  const resolvedNpcNames = new Set(bindings.map((row) => String(row.internalName).trim().toLowerCase()));
  const expectedUnresolvedNpcNames = (sourceManifest.itemRelations.npcReferenceNames ?? [])
    .filter((name) => !resolvedNpcNames.has(String(name).trim().toLowerCase()))
    .sort();
  if (unresolvedNpcNames.join('\n') !== expectedUnresolvedNpcNames.join('\n')
      || validated.unresolvedSourceNpcReferences?.some((row) => row.reason !== 'no_stable_internal_name_or_id_in_frozen_relation_view'
        || row.sourceRowsSha256 !== sourceManifest.itemRelations.selectedRowsSha256.itemSources)) {
    throw new Error('Items unresolved NPC source-reference evidence differs from the source manifest');
  }
  return validated;
}
