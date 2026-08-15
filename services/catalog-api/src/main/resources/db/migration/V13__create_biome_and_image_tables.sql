CREATE TABLE IF NOT EXISTS `item_images` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'icon',
  `provider` VARCHAR(32) NOT NULL DEFAULT 'wiki_gg',
  `source_file_title` VARCHAR(255) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `original_url` VARCHAR(500) DEFAULT NULL,
  `cached_url` VARCHAR(500) DEFAULT NULL,
  `width` INT DEFAULT NULL,
  `height` INT DEFAULT NULL,
  `content_type` VARCHAR(128) DEFAULT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `last_verified_at` DATETIME DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_item_images_item_id` (`item_id`),
  INDEX `idx_item_images_primary` (`item_id`, `is_primary`),
  INDEX `idx_item_images_provider` (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `biomes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `name_en` VARCHAR(255) NOT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `alias_en` VARCHAR(255) DEFAULT NULL,
  `alias_zh` VARCHAR(255) DEFAULT NULL,
  `layer_type` VARCHAR(32) DEFAULT NULL,
  `biome_type` VARCHAR(32) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `icon_url` VARCHAR(500) DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `last_synced_at` DATETIME DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_biomes_code` (`code`),
  INDEX `idx_biomes_type` (`biome_type`),
  INDEX `idx_biomes_layer` (`layer_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `item_biomes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT NOT NULL,
  `biome_id` BIGINT NOT NULL,
  `relation_type` VARCHAR(32) NOT NULL DEFAULT 'relevant_to',
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_biomes_relation` (`item_id`, `biome_id`, `relation_type`),
  INDEX `idx_item_biomes_item_id` (`item_id`),
  INDEX `idx_item_biomes_biome_id` (`biome_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `biome_relations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `biome_id` BIGINT NOT NULL,
  `related_biome_id` BIGINT NOT NULL,
  `relation_type` VARCHAR(32) NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_biome_relations` (`biome_id`, `related_biome_id`, `relation_type`),
  INDEX `idx_biome_relations_biome_id` (`biome_id`),
  INDEX `idx_biome_relations_related_id` (`related_biome_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `biome_resources` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `biome_id` BIGINT NOT NULL,
  `item_id` BIGINT DEFAULT NULL,
  `resource_name_raw` VARCHAR(255) DEFAULT NULL,
  `resource_type` VARCHAR(32) NOT NULL DEFAULT 'feature',
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_biome_resources_biome_id` (`biome_id`),
  INDEX `idx_biome_resources_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `entity_source_snapshots` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_id` BIGINT DEFAULT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `source_kind` VARCHAR(32) NOT NULL,
  `source_locator` VARCHAR(500) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `payload_json` LONGTEXT DEFAULT NULL,
  `fetched_at` DATETIME NOT NULL,
  `is_current` TINYINT(1) NOT NULL DEFAULT 1,
  `parse_status` VARCHAR(32) NOT NULL DEFAULT 'parsed',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_entity_snapshots_entity` (`entity_type`, `entity_id`),
  INDEX `idx_entity_snapshots_provider` (`provider`),
  INDEX `idx_entity_snapshots_current` (`entity_type`, `entity_id`, `is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
