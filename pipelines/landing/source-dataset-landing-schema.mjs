export const LANDING_TABLE_NAME = 'source_dataset_landings';

export const LANDING_DATASET_TYPES = [
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
];

export const LANDING_PARSE_STATUSES = ['ok', 'partial', 'error', 'skipped'];

export const LANDING_ARTIFACT_ROLES = Object.freeze([
  'legacy_compat',
  'bootstrap_input',
  'source_evidence',
  'compat_export',
]);

export const GOVERNED_CANONICAL_DATASET_TYPES = Object.freeze([
  'item_groups_raw',
  'npcs_base_raw',
  'npc_crawler_facts_raw',
  'item_image_sources_raw',
]);

export const LANDING_COMPATIBILITY_DEFAULTS = Object.freeze({
  artifactRole: 'legacy_compat',
  producerId: 'legacy.source-dataset-importer',
  producerVersion: 'pre-v56',
});

export function validateLandingDatasetType(value) {
  return LANDING_DATASET_TYPES.includes(String(value ?? '').trim());
}

export function validateLandingParseStatus(value) {
  return LANDING_PARSE_STATUSES.includes(String(value ?? '').trim());
}

export function validateLandingArtifactRole(value) {
  return LANDING_ARTIFACT_ROLES.includes(String(value ?? '').trim());
}

export function buildLegacyProducerRunKey(contentHash) {
  return `legacy-${String(contentHash ?? 'unknown').slice(0, 64)}`;
}

export function buildSourceDatasetLandingCreateTableSql(tableName = LANDING_TABLE_NAME) {
  return `
CREATE TABLE IF NOT EXISTS \`${tableName}\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`dataset_type\` VARCHAR(64) NOT NULL,
  \`provider\` VARCHAR(128) NOT NULL,
  \`source_kind\` VARCHAR(64) NOT NULL,
  \`source_key\` VARCHAR(255) NOT NULL,
  \`source_locator\` VARCHAR(500) DEFAULT NULL,
  \`source_page\` VARCHAR(255) NOT NULL,
  \`source_revision_timestamp\` DATETIME DEFAULT NULL,
  \`content_hash\` CHAR(64) DEFAULT NULL,
  \`payload_json\` LONGTEXT NOT NULL,
  \`fetched_at\` DATETIME DEFAULT NULL,
  \`parsed_at\` DATETIME DEFAULT NULL,
  \`parse_status\` VARCHAR(32) NOT NULL DEFAULT 'ok',
  \`artifact_role\` VARCHAR(32) NOT NULL,
  \`producer_id\` VARCHAR(128) NOT NULL,
  \`producer_version\` VARCHAR(64) NOT NULL,
  \`producer_run_key\` VARCHAR(128) NOT NULL,
  \`bootstrap_manifest_hash\` CHAR(64) DEFAULT NULL,
  \`full_file_content_hash\` CHAR(64) DEFAULT NULL,
  \`full_file_byte_size\` BIGINT UNSIGNED DEFAULT NULL,
  \`is_current\` TINYINT(1) NOT NULL DEFAULT 1,
  \`current_slot\` TINYINT GENERATED ALWAYS AS
    (CASE WHEN \`is_current\` = 1 THEN 1 ELSE NULL END) STORED,
  \`notes\` TEXT DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_source_dataset_landings_current\` (\`dataset_type\`, \`provider\`, \`source_key\`, \`source_page\`, \`current_slot\`),
  UNIQUE KEY \`uk_source_dataset_landings_bootstrap_hash\` (\`dataset_type\`, \`provider\`, \`source_key\`, \`source_page\`, \`bootstrap_manifest_hash\`),
  KEY \`idx_source_dataset_landings_artifact_role\` (\`dataset_type\`, \`artifact_role\`, \`is_current\`),
  KEY \`idx_source_dataset_landings_dataset_current\` (\`dataset_type\`, \`is_current\`),
  KEY \`idx_source_dataset_landings_provider_source_key\` (\`provider\`, \`source_key\`),
  KEY \`idx_source_dataset_landings_source_page\` (\`source_page\`),
  KEY \`idx_source_dataset_landings_fetched_at\` (\`fetched_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`.trim();
}
