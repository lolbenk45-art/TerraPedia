CREATE TABLE IF NOT EXISTS `source_dataset_landings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `dataset_type` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(128) NOT NULL,
  `source_kind` VARCHAR(64) NOT NULL,
  `source_key` VARCHAR(255) NOT NULL,
  `source_locator` VARCHAR(500) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `content_hash` CHAR(64) DEFAULT NULL,
  `payload_json` LONGTEXT NOT NULL,
  `fetched_at` DATETIME DEFAULT NULL,
  `parsed_at` DATETIME DEFAULT NULL,
  `parse_status` VARCHAR(32) NOT NULL DEFAULT 'ok',
  `is_current` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_dataset_landings_current` (`dataset_type`, `provider`, `source_key`, `source_page`, `is_current`),
  KEY `idx_source_dataset_landings_dataset_current` (`dataset_type`, `is_current`),
  KEY `idx_source_dataset_landings_provider_source_key` (`provider`, `source_key`),
  KEY `idx_source_dataset_landings_source_page` (`source_page`),
  KEY `idx_source_dataset_landings_fetched_at` (`fetched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `source_dataset_landings`
  ADD COLUMN `artifact_role` VARCHAR(32) NULL AFTER `parse_status`,
  ADD COLUMN `producer_id` VARCHAR(128) NULL AFTER `artifact_role`,
  ADD COLUMN `producer_version` VARCHAR(64) NULL AFTER `producer_id`,
  ADD COLUMN `producer_run_key` VARCHAR(128) NULL AFTER `producer_version`,
  ADD COLUMN `bootstrap_manifest_hash` CHAR(64) NULL AFTER `producer_run_key`,
  ADD COLUMN `full_file_content_hash` CHAR(64) NULL AFTER `bootstrap_manifest_hash`,
  ADD COLUMN `full_file_byte_size` BIGINT UNSIGNED NULL AFTER `full_file_content_hash`;

UPDATE `source_dataset_landings`
SET `artifact_role` = 'legacy_compat',
    `producer_id` = 'legacy.source-dataset-importer',
    `producer_version` = 'pre-v56',
    `producer_run_key` = CONCAT('legacy-', `id`),
    `source_page` = COALESCE(`source_page`, `source_key`)
WHERE `artifact_role` IS NULL
   OR `producer_id` IS NULL
   OR `producer_version` IS NULL
   OR `producer_run_key` IS NULL
   OR `source_page` IS NULL;

ALTER TABLE `source_dataset_landings`
  MODIFY COLUMN `artifact_role` VARCHAR(32) NOT NULL,
  MODIFY COLUMN `producer_id` VARCHAR(128) NOT NULL,
  MODIFY COLUMN `producer_version` VARCHAR(64) NOT NULL,
  MODIFY COLUMN `producer_run_key` VARCHAR(128) NOT NULL,
  MODIFY COLUMN `source_page` VARCHAR(255) NOT NULL,
  ADD COLUMN `current_slot` TINYINT GENERATED ALWAYS AS
    (CASE WHEN `is_current` = 1 THEN 1 ELSE NULL END) STORED AFTER `is_current`,
  DROP INDEX `uk_source_dataset_landings_current`,
  ADD UNIQUE KEY `uk_source_dataset_landings_current`
    (`dataset_type`, `provider`, `source_key`, `source_page`, `current_slot`),
  ADD UNIQUE KEY `uk_source_dataset_landings_bootstrap_hash`
    (`dataset_type`, `provider`, `source_key`, `source_page`, `bootstrap_manifest_hash`),
  ADD KEY `idx_source_dataset_landings_artifact_role`
    (`dataset_type`, `artifact_role`, `is_current`);
