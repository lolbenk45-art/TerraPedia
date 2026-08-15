import test from 'node:test';
import assert from 'node:assert/strict';

import * as landingSchema from './source-dataset-landing-schema.mjs';

const {
  LANDING_DATASET_TYPES,
  LANDING_PARSE_STATUSES,
  LANDING_TABLE_NAME,
  buildSourceDatasetLandingCreateTableSql,
  validateLandingDatasetType,
  GOVERNED_CANONICAL_DATASET_TYPES,
  validateLandingArtifactRole,
} = landingSchema;

test('buildSourceDatasetLandingCreateTableSql defines expected landing table columns and indexes', () => {
  const sql = buildSourceDatasetLandingCreateTableSql();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS `source_dataset_landings`/);
  assert.match(sql, /`dataset_type` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /`provider` VARCHAR\(128\) NOT NULL/);
  assert.match(sql, /`source_kind` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /`source_key` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`source_locator` VARCHAR\(500\) DEFAULT NULL/);
  assert.match(sql, /`source_page` VARCHAR\(255\) NOT NULL/);
  assert.match(sql, /`source_revision_timestamp` DATETIME DEFAULT NULL/);
  assert.match(sql, /`content_hash` CHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /`payload_json` LONGTEXT NOT NULL/);
  assert.match(sql, /`fetched_at` DATETIME DEFAULT NULL/);
  assert.match(sql, /`parsed_at` DATETIME DEFAULT NULL/);
  assert.match(sql, /`parse_status` VARCHAR\(32\) NOT NULL DEFAULT 'ok'/);
  assert.match(sql, /`artifact_role` VARCHAR\(32\) NOT NULL/);
  assert.match(sql, /`producer_id` VARCHAR\(128\) NOT NULL/);
  assert.match(sql, /`producer_version` VARCHAR\(64\) NOT NULL/);
  assert.match(sql, /`producer_run_key` VARCHAR\(128\) NOT NULL/);
  assert.match(sql, /`bootstrap_manifest_hash` CHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /`full_file_content_hash` CHAR\(64\) DEFAULT NULL/);
  assert.match(sql, /`full_file_byte_size` BIGINT UNSIGNED DEFAULT NULL/);
  assert.match(sql, /`is_current` TINYINT\(1\) NOT NULL DEFAULT 1/);
  assert.match(sql, /`current_slot` TINYINT GENERATED ALWAYS AS\s*\(CASE WHEN `is_current` = 1 THEN 1 ELSE NULL END\) STORED/);
  assert.match(sql, /`notes` TEXT DEFAULT NULL/);
  assert.match(sql, /UNIQUE KEY `uk_source_dataset_landings_current` \(`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`\)/);
  assert.match(sql, /UNIQUE KEY `uk_source_dataset_landings_bootstrap_hash` \(`dataset_type`, `provider`, `source_key`, `source_page`, `bootstrap_manifest_hash`\)/);
  assert.match(sql, /KEY `idx_source_dataset_landings_artifact_role` \(`dataset_type`, `artifact_role`, `is_current`\)/);
  assert.doesNotMatch(sql, /`source_page`, `is_current`\)/);
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
    'armor_attributes_raw',
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
    'item_groups_raw',
    'npcs_base_raw',
    'npc_crawler_facts_raw',
    'item_image_sources_raw',
  ]);
  assert.equal(LANDING_DATASET_TYPES.length, 19);
  assert.deepEqual(LANDING_PARSE_STATUSES, ['ok', 'partial', 'error', 'skipped']);
});

test('validateLandingDatasetType only accepts registered dataset types', () => {
  assert.equal(validateLandingDatasetType('items_raw'), true);
  assert.equal(validateLandingDatasetType('recipes_raw'), true);
  assert.equal(validateLandingDatasetType('armor_attributes_raw'), true);
  assert.equal(validateLandingDatasetType('npc_item_relations_bundle_raw'), true);
  assert.equal(validateLandingDatasetType('item_groups_raw'), true);
  assert.equal(validateLandingDatasetType('npcs_base_raw'), true);
  assert.equal(validateLandingDatasetType('npc_crawler_facts_raw'), true);
  assert.equal(validateLandingDatasetType('unknown_raw'), false);
  assert.equal(validateLandingDatasetType(''), false);
});

test('landing artifact contracts expose only the approved Phase 1A vocabulary', () => {
  assert.deepEqual(landingSchema.LANDING_ARTIFACT_ROLES, [
    'legacy_compat',
    'bootstrap_input',
    'source_evidence',
    'compat_export',
  ]);
  assert.deepEqual(landingSchema.GOVERNED_CANONICAL_DATASET_TYPES, [
    'item_groups_raw',
    'npcs_base_raw',
    'npc_crawler_facts_raw',
    'item_image_sources_raw',
  ]);
  assert.deepEqual(landingSchema.LANDING_COMPATIBILITY_DEFAULTS, {
    artifactRole: 'legacy_compat',
    producerId: 'legacy.source-dataset-importer',
    producerVersion: 'pre-v56',
  });
  assert.equal(landingSchema.validateLandingArtifactRole?.('bootstrap_input'), true);
  assert.equal(landingSchema.validateLandingArtifactRole?.('source_evidence'), true);
  assert.equal(landingSchema.validateLandingArtifactRole?.('unknown'), false);
  assert.equal(landingSchema.buildLegacyProducerRunKey?.('a'.repeat(64)), `legacy-${'a'.repeat(64)}`);
  assert.equal(landingSchema.buildLegacyProducerRunKey?.(null), 'legacy-unknown');
});

test('item_image_sources_raw is a governed canonical source-evidence dataset', () => {
  assert.ok(LANDING_DATASET_TYPES.includes('item_image_sources_raw'));
  assert.ok(GOVERNED_CANONICAL_DATASET_TYPES.includes('item_image_sources_raw'));
  assert.equal(validateLandingDatasetType('item_image_sources_raw'), true);
  assert.equal(validateLandingArtifactRole('source_evidence'), true);
});
