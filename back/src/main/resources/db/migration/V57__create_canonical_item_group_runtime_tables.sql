CREATE TABLE IF NOT EXISTS `item_groups` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `canonical_key` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `canonical_name` VARCHAR(255) DEFAULT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `normalized_domains_json` LONGTEXT,
  `source_layer` VARCHAR(32) NOT NULL,
  `source_priority` INT NOT NULL,
  `relation_record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `source_content_hash` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `canonical_version` BIGINT NOT NULL,
  `materialized_at` DATETIME NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_groups_record_key` (`record_key`),
  UNIQUE KEY `uk_item_groups_canonical_layer` (`canonical_key`, `source_layer`),
  KEY `idx_item_groups_source_layer` (`source_layer`, `deleted`),
  CHECK (`source_layer` IN ('recipe_reference', 'source_group', 'central_override'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `item_group_members` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `group_id` BIGINT NOT NULL,
  `item_id` BIGINT NOT NULL,
  `source_item_id` INT DEFAULT NULL,
  `member_key` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `internal_name` VARCHAR(255) DEFAULT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `resolution_state` VARCHAR(32) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_group_members_record_key` (`record_key`),
  UNIQUE KEY `uk_item_group_members_group_item` (`group_id`, `item_id`),
  KEY `idx_item_group_members_member_key` (`member_key`),
  CONSTRAINT `fk_item_group_members_group_id`
    FOREIGN KEY (`group_id`) REFERENCES `item_groups` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_item_group_members_item_id`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `item_group_aliases` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `canonical_key` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `source_layer` VARCHAR(32) NOT NULL,
  `alias_text` VARCHAR(255) NOT NULL,
  `normalized_alias` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `alias_kind` VARCHAR(32) NOT NULL,
  `alias_language` VARCHAR(16) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_group_aliases_record_key` (`record_key`),
  UNIQUE KEY `uk_item_group_aliases_alias_group_layer` (`normalized_alias`, `canonical_key`, `source_layer`),
  KEY `idx_item_group_aliases_normalized_alias` (`normalized_alias`),
  KEY `idx_item_group_aliases_canonical_layer` (`canonical_key`, `source_layer`),
  CHECK (`source_layer` IN ('recipe_reference', 'source_group', 'central_override'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `item_group_admin_audit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `record_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `actor` VARCHAR(255) NOT NULL,
  `action` VARCHAR(16) NOT NULL,
  `canonical_key` VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  `before_logical_key` VARCHAR(767) DEFAULT NULL,
  `after_logical_key` VARCHAR(767) DEFAULT NULL,
  `canonical_snapshot_hash` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_group_admin_audit_record_key` (`record_key`),
  KEY `idx_item_group_admin_audit_canonical_key` (`canonical_key`, `created_at`),
  CHECK (`action` IN ('CREATE', 'UPDATE', 'DELETE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER `trg_item_group_admin_audit_no_update`
BEFORE UPDATE ON `item_group_admin_audit` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'item group admin audit rows are immutable';

CREATE TRIGGER `trg_item_group_admin_audit_no_delete`
BEFORE DELETE ON `item_group_admin_audit` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'item group admin audit rows are immutable';

CREATE TABLE IF NOT EXISTS `item_group_projection_state` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `singleton_key` TINYINT NOT NULL DEFAULT 1,
  `canonical_snapshot_hash` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `canonical_version` BIGINT NOT NULL,
  `relation_run_key` CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  `group_count` INT NOT NULL,
  `member_count` INT NOT NULL,
  `alias_count` INT NOT NULL,
  `publication_status` VARCHAR(32) NOT NULL DEFAULT 'UNPUBLISHED',
  `published_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_group_projection_state_singleton` (`singleton_key`),
  CHECK (`singleton_key` = 1),
  CHECK (`publication_status` IN ('UNPUBLISHED', 'PUBLISHED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
