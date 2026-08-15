CREATE TABLE IF NOT EXISTS `recipes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `result_item_id` BIGINT NOT NULL,
  `result_quantity` INT NOT NULL DEFAULT 1,
  `version_scope` VARCHAR(128) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `source_revision_timestamp` DATETIME DEFAULT NULL,
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
  `ingredient_name_raw` VARCHAR(255) DEFAULT NULL,
  `ingredient_group_type` VARCHAR(32) NOT NULL DEFAULT 'item',
  `quantity_min` INT DEFAULT NULL,
  `quantity_max` INT DEFAULT NULL,
  `quantity_text` VARCHAR(64) DEFAULT NULL,
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
  `station_item_id` BIGINT DEFAULT NULL,
  `station_name_raw` VARCHAR(255) DEFAULT NULL,
  `is_alternative` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_recipe_stations_recipe_id` (`recipe_id`),
  INDEX `idx_recipe_stations_item_id` (`station_item_id`)
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
  `quantity_text` VARCHAR(64) DEFAULT NULL,
  `chance_value` DECIMAL(8,4) DEFAULT NULL,
  `chance_text` VARCHAR(64) DEFAULT NULL,
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
