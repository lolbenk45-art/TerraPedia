import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAINT_TABLE_CATALOG,
  MAINT_TABLE_NAMES,
  buildMaintSchemaSql,
} from './maint-schema.mjs';

test('MAINT_TABLE_CATALOG exposes stable automation ownership metadata', () => {
  assert.deepEqual(MAINT_TABLE_CATALOG.map((entry) => entry.table), MAINT_TABLE_NAMES);
  assert.equal(MAINT_TABLE_CATALOG.every((entry) => entry.databaseRole === 'maint'), true);
  assert.equal(MAINT_TABLE_CATALOG.every((entry) => entry.engine === 'InnoDB'), true);
});

test('buildMaintSchemaSql creates all maint tables', () => {
  const sql = buildMaintSchemaSql();

  assert.deepEqual(MAINT_TABLE_NAMES, [
    'maint_items',
    'maint_npcs',
    'maint_npc_crawler_facts',
    'maint_projectiles',
    'maint_buffs',
    'maint_npc_images',
    'maint_item_pages',
    'maint_item_page_recipes',
    'maint_item_images',
    'maint_item_numeric_overrides',
    'maint_item_rarity_overrides',
    'maint_item_text_overrides',
    'maint_recipe_pages',
    'maint_recipe_page_recipes',
    'maint_item_recipes',
    'maint_item_sources',
    'maint_backfill_candidates',
    'maint_item_biomes',
    'maint_source_snapshots',
    'maint_bosses',
    'maint_biomes',
    'maint_armor_sets',
    'maint_armor_set_images',
    'maint_armor_attribute_rows',
    'maint_categories',
    'maint_item_categories',
    'maint_category_nodes',
    'maint_item_category_assignments',
    'maint_shimmer_pages',
    'maint_shimmer_item_transforms',
    'maint_shimmer_decraft_rules',
    'maint_shimmer_entity_transforms',
    'maint_shimmer_npc_transforms',
    'maint_item_groups',
    'maint_item_group_members',
    'maint_item_group_aliases',
    'maint_item_group_member_exclusions',
  ]);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_items`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_npcs`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_npc_crawler_facts`/);
  assert.match(sql, /`match_status` VARCHAR\(32\) NOT NULL/);
  assert.match(sql, /CHECK \(`match_status` IN \('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED'\)\)/);
  assert.match(sql, /`landing_source_id` BIGINT NOT NULL/);
  assert.match(sql, /`crawler_audit_hash` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`sub_name_zh` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_projectiles`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_buffs`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_npc_images`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_pages`/);
  assert.match(sql, /`sell_text` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(sql, /`sell_value` INT DEFAULT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_page_recipes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_images`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_numeric_overrides`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_rarity_overrides`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_text_overrides`/);
  assert.match(sql, /`description_zh` TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_recipe_pages`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_recipe_page_recipes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_recipes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_sources`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_biomes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_source_snapshots`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_bosses`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_biomes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_armor_sets`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_armor_set_images`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_armor_attribute_rows`/);
  assert.match(sql, /`item_page_title` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(sql, /`slot_group` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /`defense_value` INT DEFAULT NULL/);
  assert.match(sql, /`raw_cells_json` LONGTEXT DEFAULT NULL/);
  assert.match(sql, /`image_role` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_categories`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_categories`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_category_nodes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_category_assignments`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_pages`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_item_transforms`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_decraft_rules`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_entity_transforms`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_npc_transforms`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_groups`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_group_members`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_group_aliases`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_group_member_exclusions`/);
  assert.match(sql, /UNIQUE KEY `uk_maint_item_groups_canonical_layer_source` \(`canonical_key`, `source_layer`, `source_key`\)/);
  assert.match(sql, /CHECK \(`source_layer` IN \('recipe_reference', 'source_group', 'central_override'\)\)/);
  assert.match(sql, /UNIQUE KEY `uk_maint_item_group_members_group_member` \(`group_record_key`, `member_key`\)/);
  assert.match(sql, /FOREIGN KEY \(`group_record_key`\) REFERENCES `maint_item_groups` \(`record_key`\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/i);
  assert.match(sql, /`landing_source_key` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`landing_content_hash` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`record_key` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`raw_json` LONGTEXT NOT NULL/);
  assert.match(sql, /`node_key` VARCHAR\(1000\) NOT NULL/);
  assert.match(sql, /`is_primary` TINYINT\(1\) NOT NULL DEFAULT 0/);
});
