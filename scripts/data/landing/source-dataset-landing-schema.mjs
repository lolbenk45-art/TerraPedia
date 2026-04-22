export const LANDING_TABLE_NAME = 'source_dataset_landings';

export const LANDING_DATASET_TYPES = [
  'items_raw',
  'npcs_raw',
  'projectiles_raw',
  'armor_sets_raw',
  'buffs_raw',
  'bosses_raw',
  'biomes_raw',
  'categories_raw',
  'item_pages_raw',
  'shimmer_raw',
  'recipes_raw',
  'item_relations_bundle_raw',
];

export const LANDING_PARSE_STATUSES = ['ok', 'partial', 'error', 'skipped'];

export function validateLandingDatasetType(value) {
  return LANDING_DATASET_TYPES.includes(String(value ?? '').trim());
}

export function validateLandingParseStatus(value) {
  return LANDING_PARSE_STATUSES.includes(String(value ?? '').trim());
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
  \`source_page\` VARCHAR(255) DEFAULT NULL,
  \`source_revision_timestamp\` DATETIME DEFAULT NULL,
  \`content_hash\` CHAR(64) DEFAULT NULL,
  \`payload_json\` LONGTEXT NOT NULL,
  \`fetched_at\` DATETIME DEFAULT NULL,
  \`parsed_at\` DATETIME DEFAULT NULL,
  \`parse_status\` VARCHAR(32) NOT NULL DEFAULT 'ok',
  \`is_current\` TINYINT(1) NOT NULL DEFAULT 1,
  \`notes\` TEXT DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_source_dataset_landings_current\` (\`dataset_type\`, \`provider\`, \`source_key\`, \`source_page\`, \`is_current\`),
  KEY \`idx_source_dataset_landings_dataset_current\` (\`dataset_type\`, \`is_current\`),
  KEY \`idx_source_dataset_landings_provider_source_key\` (\`provider\`, \`source_key\`),
  KEY \`idx_source_dataset_landings_source_page\` (\`source_page\`),
  KEY \`idx_source_dataset_landings_fetched_at\` (\`fetched_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`.trim();
}
