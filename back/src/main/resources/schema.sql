-- Base schema for local development.
-- Keep table names aligned with current entity mapping: items / category.

CREATE TABLE IF NOT EXISTS `category` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `parent_id` BIGINT NOT NULL DEFAULT 0,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `top_type` VARCHAR(32) NOT NULL DEFAULT '',
  `sort` INT DEFAULT 0,
  `description` TEXT,
  `icon` VARCHAR(255),
  `status` INT DEFAULT 1,
  `creator_id` BIGINT,
  `deleted` TINYINT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_category_parent_id` (`parent_id`),
  UNIQUE KEY `uk_category_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `item_rarity` (
  `id` BIGINT NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `display_name_zh` VARCHAR(64) NOT NULL,
  `display_name_en` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_rarity_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `game_period` (
  `id` BIGINT NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `display_name_zh` VARCHAR(64) NOT NULL,
  `display_name_en` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_game_period_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `internal_name` VARCHAR(255) DEFAULT NULL,
  `slug` VARCHAR(255) DEFAULT NULL,
  `image` VARCHAR(500) DEFAULT NULL,
  `category_id` BIGINT DEFAULT NULL,
  `description` TEXT,
  `description_zh` TEXT,
  `damage` INT DEFAULT NULL,
  `defense` INT DEFAULT NULL,
  `knockback` INT DEFAULT NULL,
  `use_time` INT DEFAULT NULL,
  `width` INT DEFAULT NULL,
  `height` INT DEFAULT NULL,
  `buy` INT DEFAULT NULL,
  `sell` INT DEFAULT NULL,
  `tooltip` TEXT,
  `tooltip_zh` TEXT,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `last_synced_at` DATETIME DEFAULT NULL,
  `rarity_id` BIGINT DEFAULT NULL,
  `game_period_id` BIGINT DEFAULT NULL,
  `game_model_id` BIGINT DEFAULT NULL,
  `is_stackable` TINYINT(1) DEFAULT 0,
  `stack_size` INT DEFAULT 1,
  `status` INT DEFAULT 1,
  `deleted` TINYINT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_items_category_id` (`category_id`),
  INDEX `idx_items_name` (`name`),
  INDEX `idx_items_deleted` (`deleted`),
  INDEX `idx_items_slug` (`slug`),
  INDEX `idx_items_source_provider` (`source_provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS `item_category_rel` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT NOT NULL,
  `category_id` BIGINT NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `relation_type` VARCHAR(32) NOT NULL DEFAULT 'wiki_type',
  `sort_order` INT NOT NULL DEFAULT 0,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_category_rel_item_category` (`item_id`, `category_id`, `deleted`),
  INDEX `idx_item_category_rel_item_id` (`item_id`),
  INDEX `idx_item_category_rel_category_id` (`category_id`),
  INDEX `idx_item_category_rel_primary` (`item_id`, `is_primary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recipes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `result_item_id` BIGINT NOT NULL,
  `result_internal_name` VARCHAR(255) DEFAULT NULL,
  `result_quantity` INT NOT NULL DEFAULT 1,
  `version_scope` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_recipes_result_item_id` (`result_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recipe_ingredients` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `recipe_id` BIGINT NOT NULL,
  `ingredient_item_id` BIGINT DEFAULT NULL,
  `ingredient_internal_name` VARCHAR(255) DEFAULT NULL,
  `ingredient_name_raw` VARCHAR(255) DEFAULT NULL,
  `ingredient_group_type` VARCHAR(32) NOT NULL DEFAULT 'item',
  `quantity_min` INT DEFAULT NULL,
  `quantity_max` INT DEFAULT NULL,
  `quantity_text` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_recipe_ingredients_recipe_id` (`recipe_id`),
  INDEX `idx_recipe_ingredients_item_id` (`ingredient_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recipe_stations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `recipe_id` BIGINT NOT NULL,
  `station_id` BIGINT DEFAULT NULL,
  `station_item_id` BIGINT DEFAULT NULL,
  `station_internal_name` VARCHAR(255) DEFAULT NULL,
  `station_name_raw` VARCHAR(255) DEFAULT NULL,
  `is_alternative` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_recipe_stations_recipe_id` (`recipe_id`),
  INDEX `idx_recipe_stations_station_id` (`station_id`),
  INDEX `idx_recipe_stations_item_id` (`station_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crafting_stations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT DEFAULT NULL,
  `internal_name` VARCHAR(255) DEFAULT NULL,
  `name_en` VARCHAR(255) DEFAULT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `station_type` VARCHAR(32) NOT NULL DEFAULT 'crafting_station',
  `notes` TEXT DEFAULT NULL,
  `image_url` VARCHAR(500) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crafting_stations_item_id` (`item_id`),
  INDEX `idx_crafting_stations_internal_name` (`internal_name`),
  INDEX `idx_crafting_stations_type` (`station_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `item_acquisition_sources` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT NOT NULL,
  `source_type` VARCHAR(32) NOT NULL,
  `source_ref_type` VARCHAR(32) DEFAULT NULL,
  `source_ref_id` BIGINT DEFAULT NULL,
  `source_ref_name` VARCHAR(255) DEFAULT NULL,
  `biome_id` BIGINT DEFAULT NULL,
  `quantity_min` INT DEFAULT NULL,
  `quantity_max` INT DEFAULT NULL,
  `quantity_text` TEXT DEFAULT NULL,
  `chance_value` DECIMAL(8,4) DEFAULT NULL,
  `chance_text` TEXT DEFAULT NULL,
  `conditions` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_item_sources_item_id` (`item_id`),
  INDEX `idx_item_sources_type` (`source_type`),
  INDEX `idx_item_sources_ref` (`source_ref_type`, `source_ref_id`),
  INDEX `idx_item_sources_biome_id` (`biome_id`)
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
  `wiki_group_code` VARCHAR(100) DEFAULT NULL,
  `wiki_group_name_en` VARCHAR(255) DEFAULT NULL,
  `wiki_group_name_zh` VARCHAR(255) DEFAULT NULL,
  `wiki_parent_group_code` VARCHAR(100) DEFAULT NULL,
  `wiki_parent_group_name_en` VARCHAR(255) DEFAULT NULL,
  `wiki_parent_group_name_zh` VARCHAR(255) DEFAULT NULL,
  `wiki_section_level` INT DEFAULT NULL,
  `wiki_sort_order` INT DEFAULT NULL,
  `wiki_section_anchor` VARCHAR(255) DEFAULT NULL,
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
  INDEX `idx_biomes_layer` (`layer_type`),
  INDEX `idx_biomes_wiki_group` (`wiki_group_code`),
  INDEX `idx_biomes_wiki_parent_group` (`wiki_parent_group_code`),
  INDEX `idx_biomes_wiki_order` (`wiki_sort_order`)
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

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(120) DEFAULT NULL,
  `status` TINYINT NOT NULL DEFAULT 1,
  `last_login_at` DATETIME DEFAULT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  INDEX `idx_users_status_deleted` (`status`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `articles` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) DEFAULT NULL,
  `summary` VARCHAR(600) DEFAULT NULL,
  `cover_image` VARCHAR(500) DEFAULT NULL,
  `content_html` MEDIUMTEXT NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  `review_status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  `review_comment` VARCHAR(600) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `submitted_at` DATETIME DEFAULT NULL,
  `reviewer_name` VARCHAR(120) DEFAULT NULL,
  `published_at` DATETIME DEFAULT NULL,
  `author_id` BIGINT DEFAULT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_articles_slug` (`slug`),
  INDEX `idx_articles_status_deleted` (`status`, `deleted`),
  INDEX `idx_articles_review_status` (`review_status`),
  INDEX `idx_articles_published_at` (`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `article_review_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `article_id` BIGINT NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `from_review_status` VARCHAR(24) DEFAULT NULL,
  `to_review_status` VARCHAR(24) DEFAULT NULL,
  `comment` VARCHAR(600) DEFAULT NULL,
  `reviewer_name` VARCHAR(120) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_article_review_log_article_created` (`article_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `security_audit_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_type` VARCHAR(64) NOT NULL,
  `actor_type` VARCHAR(32) NOT NULL,
  `actor_id` BIGINT DEFAULT NULL,
  `email_masked` VARCHAR(255) DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `details` VARCHAR(600) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_security_audit_log_created_at` (`created_at`),
  INDEX `idx_security_audit_log_event_type` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
