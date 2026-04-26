import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAINT_TABLE_NAMES,
  buildMaintSchemaSql,
} from './maint-schema.mjs';

test('buildMaintSchemaSql creates all maint tables', () => {
  const sql = buildMaintSchemaSql();

  assert.deepEqual(MAINT_TABLE_NAMES, [
    'maint_items',
    'maint_npcs',
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
    'maint_item_biomes',
    'maint_source_snapshots',
    'maint_bosses',
    'maint_biomes',
    'maint_armor_sets',
    'maint_categories',
    'maint_item_categories',
    'maint_category_nodes',
    'maint_item_category_assignments',
    'maint_shimmer_pages',
    'maint_shimmer_item_transforms',
    'maint_shimmer_decraft_rules',
    'maint_shimmer_entity_transforms',
    'maint_shimmer_npc_transforms',
  ]);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_items`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_npcs`/);
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
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_recipe_pages`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_recipe_page_recipes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_recipes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_sources`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_biomes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_source_snapshots`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_bosses`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_biomes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_armor_sets`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_categories`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_categories`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_category_nodes`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_item_category_assignments`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_pages`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_item_transforms`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_decraft_rules`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_entity_transforms`/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `maint_shimmer_npc_transforms`/);
  assert.match(sql, /`landing_source_key` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`landing_content_hash` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`record_key` CHAR\(64\) NOT NULL/);
  assert.match(sql, /`raw_json` LONGTEXT NOT NULL/);
  assert.match(sql, /`node_key` VARCHAR\(1000\) NOT NULL/);
  assert.match(sql, /`is_primary` TINYINT\(1\) NOT NULL DEFAULT 0/);
});
