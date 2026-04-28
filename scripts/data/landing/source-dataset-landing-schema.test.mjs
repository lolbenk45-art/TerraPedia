import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANDING_DATASET_TYPES,
  LANDING_PARSE_STATUSES,
  LANDING_TABLE_NAME,
  buildSourceDatasetLandingCreateTableSql,
  validateLandingDatasetType,
} from './source-dataset-landing-schema.mjs';

test('buildSourceDatasetLandingCreateTableSql defines expected landing table columns and indexes', () => {
  const sql = buildSourceDatasetLandingCreateTableSql();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS `source_dataset_landings`/);
  assert.match(sql, /`dataset_type` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /`provider` VARCHAR\(128\) NOT NULL/);
  assert.match(sql, /`source_kind` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /`source_key` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`source_locator` VARCHAR\(500\) DEFAULT NULL/);
  assert.match(sql, /`source_page` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(sql, /`source_revision_timestamp` DATETIME DEFAULT NULL/);
  assert.match(sql, /`content_hash` CHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /`payload_json` LONGTEXT NOT NULL/);
  assert.match(sql, /`fetched_at` DATETIME DEFAULT NULL/);
  assert.match(sql, /`parsed_at` DATETIME DEFAULT NULL/);
  assert.match(sql, /`parse_status` VARCHAR\(32\) NOT NULL DEFAULT 'ok'/);
  assert.match(sql, /`is_current` TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(sql, /`notes` TEXT DEFAULT NULL/);
  assert.match(sql, /UNIQUE KEY `uk_source_dataset_landings_current` \(`dataset_type`, `provider`, `source_key`, `source_page`, `is_current`\)/);
  assert.match(sql, /KEY `idx_source_dataset_landings_dataset_current` \(`dataset_type`, `is_current`\)/);
  assert.match(sql, /KEY `idx_source_dataset_landings_provider_source_key` \(`provider`, `source_key`\)/);
  assert.match(sql, /KEY `idx_source_dataset_landings_source_page` \(`source_page`\)/);
  assert.match(sql, /KEY `idx_source_dataset_landings_fetched_at` \(`fetched_at`\)/);
  assert.equal(LANDING_TABLE_NAME, 'source_dataset_landings');
});

test('landing schema exports the planned dataset types and parse statuses', () => {
  assert.deepEqual(LANDING_DATASET_TYPES, [
    'items_raw',
    'npcs_raw',
    'projectiles_raw',
    'armor_sets_raw',
    'armor_set_images_raw',
    'buffs_raw',
    'bosses_raw',
    'biomes_raw',
    'categories_raw',
    'item_pages_raw',
    'shimmer_raw',
    'recipes_raw',
    'item_relations_bundle_raw',
    'npc_item_relations_bundle_raw',
  ]);
  assert.deepEqual(LANDING_PARSE_STATUSES, ['ok', 'partial', 'error', 'skipped']);
});

test('validateLandingDatasetType only accepts registered dataset types', () => {
  assert.equal(validateLandingDatasetType('items_raw'), true);
  assert.equal(validateLandingDatasetType('recipes_raw'), true);
  assert.equal(validateLandingDatasetType('npc_item_relations_bundle_raw'), true);
  assert.equal(validateLandingDatasetType('unknown_raw'), false);
  assert.equal(validateLandingDatasetType(''), false);
});
