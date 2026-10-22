import test from 'node:test';
import assert from 'node:assert/strict';

import { assertItemsDependencyManifest, buildItemsDependencyManifest } from './eight-domain-items-dependency-manifest.mjs';

const DATABASES = {
  local: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_local',
  maint: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_maint',
  relation: 'terria_v1_automation_acceptance_e8p_547b4e28fb4004a0_relation',
};

const SOURCE = {
  schemaVersion: 1,
  manifestKind: 'eight_domain_items_source',
  runId: 'e8pr-items-20261017-v1',
  landing: { sourceId: 6470, contentHash: `sha256:${'a'.repeat(64)}` },
  selectedIds: [2, 4],
  selectedItems: [{ id: 2, internalName: 'Item2', categoryCode: 'MATERIAL' }, { id: 4, internalName: 'Item4', categoryCode: 'MATERIAL' }],
  itemInfoMatches: [{ id: 2 }, { id: 4 }],
  itemRelations: { recipeDependencyItemIds: [9], npcReferenceNames: ['Zombie'], selectedRowsSha256: { itemSources: `sha256:${'1'.repeat(64)}` } },
};

function rows() {
  return {
    iteminfoLanding: [{
      id: 6470, dataset_type: 'items_raw', provider: 'terraria.wiki.gg', source_kind: 'wiki_module', source_key: 'wiki.module.iteminfo', source_locator: null,
      source_page: 'Module:Iteminfo/data', source_revision_timestamp: '2026-03-10 06:52:58',
      content_hash: 'a'.repeat(64), payload_json: '{}', fetched_at: null, parsed_at: null, parse_status: 'ok',
      artifact_role: 'legacy_compat', producer_id: 'legacy.importer', producer_version: '1', producer_run_key: 'legacy-6470',
      bootstrap_manifest_hash: null, full_file_content_hash: null, full_file_byte_size: null, is_current: 1, notes: null,
      created_at: '2026-03-10 06:52:58', updated_at: '2026-03-10 06:52:58',
    }],
    itemCategoryLandings: [{
      id: 2, dataset_type: 'categories_raw', provider: 'terraria.wiki.gg', source_kind: 'wiki_page', source_key: 'wiki.category', source_locator: null,
      source_page: 'Item2', source_revision_timestamp: '2026-03-10 06:52:58', content_hash: 'c'.repeat(64), payload_json: '{}', fetched_at: null, parsed_at: null, parse_status: 'ok',
      artifact_role: 'legacy_compat', producer_id: 'legacy.importer', producer_version: '1', producer_run_key: 'legacy-2', bootstrap_manifest_hash: null,
      full_file_content_hash: null, full_file_byte_size: null, is_current: 1, notes: null, created_at: '2026-03-10 06:52:58', updated_at: '2026-03-10 06:52:58',
    }],
    itemCategories: [{ record_key: 'a'.repeat(64), top_level: 'Materials', template_title: null, section_title: 'Materials', group_name: null, item_internal_name: 'Item2', item_english_name: 'Item 2', item_name: 'Item 2', item_href: null, item_count: null, parent_item_name: null, depth: 0, is_group_node: 0, source_provider: 'wiki', source_page: 'Item2', source_revision_timestamp: '2026-03-10 06:52:58', landing_source_id: 2, landing_source_key: 'wiki.category', landing_source_page: 'Item2', landing_content_hash: 'c'.repeat(64), landing_fetched_at: null, landing_parsed_at: null, raw_json: '{}', status: 1, deleted: 0 }],
    recipeItems: [{ id: 9, name: 'Item 9', name_zh: null, internal_name: 'Item9', image: null, category_id: 10, description: null, damage: null, defense: null, knockback: null, use_time: null, width: null, height: null, buy: null, sell: null, tooltip: null, rarity_id: null, game_period_id: null, game_model_id: null, is_stackable: 0, stack_size: 1, status: 1, deleted: 0 }],
    recipeMaintItems: [{ id: 90, source_id: 9, internal_name: 'Item9', english_name: 'Item 9', name_zh: null, source_provider: 'wiki', source_page: 'Item9', source_revision_timestamp: '2026-03-10 06:52:58', landing_source_id: 6470, landing_source_key: 'wiki.module.iteminfo', landing_source_page: 'Module:Iteminfo/data', landing_content_hash: 'a'.repeat(64), module_generated_at: null, terraria_version: null, major_value: null, combat_value: null, defense_value: null, use_time: null, stack_size: 1, width: null, height: null, flags_json: '{}', raw_json: '{}', status: 1, deleted: 0 }],
    sourceNpcs: [{ source_id: 123, internal_name: 'Zombie', english_name: 'Zombie', name_zh: null, sub_name_zh: null, source_provider: 'wiki', source_page: 'Zombie', source_revision_timestamp: '2026-03-10 06:52:58', landing_source_id: 1, landing_source_key: 'wiki.npcs', landing_source_page: 'Zombie', landing_content_hash: 'b'.repeat(64), module_generated_at: null, terraria_version: null, major_value: null, combat_value: null, defense_value: null, use_time: null, stack_size: null, width: null, height: null, flags_json: '{}', raw_json: '{}', status: 1, deleted: 0 }],
    localNpcs: [{ id: 123, game_id: 123, source_id: 123, internal_name: 'Zombie', name: 'Zombie', name_zh: null, sub_name: null, sub_name_zh: null, image_url: null, category_id: null, game_period_id: null, game_model_id: null, is_boss: 0, boss_group_id: null, boss_role: null, is_friendly: 0, is_town_npc: 0, behavior_notes: null, net_id: 3, npc_type: 3, ai_style: 3, damage: 10, defense: 2, life_max: 50, knock_back_resist: null, width: 18, height: 40, scale: 1, value: 0, buff_immune: null, raw_json: '{}', status: 1, deleted: 0 }],
  };
}

test('Items dependency manifest binds landing, categories, external recipe Items, maintained Items, and NPC source IDs', () => {
  const manifest = buildItemsDependencyManifest({ sourceManifest: SOURCE, databases: DATABASES, sourceRows: rows() });
  assert.equal(manifest.domain, 'items');
  assert.equal(manifest.dependencies.length, 6);
  assert.deepEqual(manifest.dependencies.map((entry) => entry.id), [
    'iteminfo-landing', 'selected-item-category-landings', 'recipe-item-dependencies',
    'recipe-item-maint-dependencies', 'selected-item-category-rows', 'stable-item-source-npc-dependencies-local',
  ]);
  assert.deepEqual(manifest.selectedItemCategoryLandingIds, [2]);
  assert.equal(manifest.dependencies.find((entry) => entry.id === 'selected-item-category-landings').target.database, DATABASES.local);
  assert.equal(manifest.dependencies.find((entry) => entry.id === 'recipe-item-dependencies').target.database, DATABASES.local);
  assert.equal(manifest.dependencies.find((entry) => entry.id === 'recipe-item-maint-dependencies').target.database, DATABASES.maint);
  assert.equal(manifest.dependencies.find((entry) => entry.id === 'stable-item-source-npc-dependencies-local').target.database, DATABASES.local);
  const boundSource = { ...SOURCE, landing: { ...SOURCE.landing, canonicalSourceRowSha256: manifest.dependencies.find((entry) => entry.id === 'iteminfo-landing').rowHashes[0].sha256 } };
  assert.equal(assertItemsDependencyManifest(manifest, { sourceManifest: boundSource, databases: DATABASES }).runKey, 'e8p_547b4e28fb4004a0');
});

test('Items dependency manifest rejects selected Item IDs, recipe closure drift, and formal targets', () => {
  assert.throws(() => buildItemsDependencyManifest({
    sourceManifest: SOURCE,
    databases: DATABASES,
    sourceRows: { ...rows(), recipeItems: [{ ...rows().recipeItems[0], id: 2 }] },
  }), /Recipe local Item dependencies IDs/i);

  const manifest = buildItemsDependencyManifest({ sourceManifest: SOURCE, databases: DATABASES, sourceRows: rows() });
  const boundSource = { ...SOURCE, landing: { ...SOURCE.landing, canonicalSourceRowSha256: manifest.dependencies.find((entry) => entry.id === 'iteminfo-landing').rowHashes[0].sha256 } };
  assert.throws(() => assertItemsDependencyManifest(manifest, {
    sourceManifest: boundSource,
    databases: { ...DATABASES, local: 'terria_v1_local' },
  }), /formal|run-derived/i);

  assert.throws(() => buildItemsDependencyManifest({
    sourceManifest: SOURCE,
    databases: DATABASES,
    sourceRows: { ...rows(), localNpcs: [{ ...rows().localNpcs[0], internal_name: 'ZombieVariant' }] },
  }), /exact stable source ID|exact declared internal_name/i);

  assert.throws(() => buildItemsDependencyManifest({
    sourceManifest: SOURCE,
    databases: DATABASES,
    sourceRows: { ...rows(), itemCategoryLandings: [{ ...rows().itemCategoryLandings[0], content_hash: 'd'.repeat(64) }] },
  }), /exact categories_raw landing/i);

  assert.throws(() => buildItemsDependencyManifest({
    sourceManifest: SOURCE,
    databases: DATABASES,
    sourceRows: { ...rows(), itemCategoryLandings: [] },
  }), /category landing IDs differ/i);
});
