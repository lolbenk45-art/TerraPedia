CREATE TABLE IF NOT EXISTS `world_contexts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `name_en` VARCHAR(255) NOT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `context_type` VARCHAR(32) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `icon_url` VARCHAR(500) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_world_contexts_code` (`code`),
  INDEX `idx_world_contexts_type` (`context_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recipe_context_requirements` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `recipe_id` BIGINT NOT NULL,
  `ref_type` VARCHAR(32) NOT NULL,
  `ref_id` BIGINT NOT NULL,
  `requirement_role` VARCHAR(32) NOT NULL DEFAULT 'required',
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_recipe_context_requirements` (`recipe_id`, `ref_type`, `ref_id`, `requirement_role`),
  INDEX `idx_recipe_context_requirements_recipe` (`recipe_id`),
  INDEX `idx_recipe_context_requirements_ref` (`ref_type`, `ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `boss_groups` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `name_en` VARCHAR(255) NOT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `image_url` VARCHAR(500) DEFAULT NULL,
  `progression_order` INT NOT NULL DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_boss_groups_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `npc_loot_entries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `npc_id` BIGINT NOT NULL,
  `item_id` BIGINT DEFAULT NULL,
  `source_item_id` INT DEFAULT NULL,
  `quantity_min` INT DEFAULT NULL,
  `quantity_max` INT DEFAULT NULL,
  `quantity_text` VARCHAR(255) DEFAULT NULL,
  `chance_value` DECIMAL(8,4) DEFAULT NULL,
  `chance_text` VARCHAR(255) DEFAULT NULL,
  `conditions` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_npc_loot_entries_npc` (`npc_id`),
  INDEX `idx_npc_loot_entries_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `npc_buff_relations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `npc_id` BIGINT NOT NULL,
  `buff_id` BIGINT DEFAULT NULL,
  `buff_source_id` INT DEFAULT NULL,
  `relation_type` VARCHAR(32) NOT NULL DEFAULT 'inflicts',
  `duration_ticks` INT DEFAULT NULL,
  `chance_value` DECIMAL(8,4) DEFAULT NULL,
  `chance_text` VARCHAR(255) DEFAULT NULL,
  `conditions` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_npc_buff_relations_npc` (`npc_id`),
  INDEX `idx_npc_buff_relations_buff` (`buff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `npc_shop_entries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `npc_id` BIGINT NOT NULL,
  `item_id` BIGINT DEFAULT NULL,
  `source_item_id` INT DEFAULT NULL,
  `price_text` VARCHAR(255) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_npc_shop_entries_npc` (`npc_id`),
  INDEX `idx_npc_shop_entries_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `npc_shop_conditions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `shop_entry_id` BIGINT NOT NULL,
  `ref_type` VARCHAR(32) NOT NULL,
  `ref_id` BIGINT NOT NULL,
  `condition_role` VARCHAR(32) NOT NULL DEFAULT 'required',
  `notes` TEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_npc_shop_conditions` (`shop_entry_id`, `ref_type`, `ref_id`, `condition_role`),
  INDEX `idx_npc_shop_conditions_entry` (`shop_entry_id`),
  INDEX `idx_npc_shop_conditions_ref` (`ref_type`, `ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'armor_sets'
        AND COLUMN_NAME = 'male_images'
    ),
    'SELECT 1',
    'ALTER TABLE `armor_sets` ADD COLUMN `male_images` TEXT DEFAULT NULL AFTER `unique_item_ids_json`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'armor_sets'
        AND COLUMN_NAME = 'female_images'
    ),
    'SELECT 1',
    'ALTER TABLE `armor_sets` ADD COLUMN `female_images` TEXT DEFAULT NULL AFTER `male_images`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'armor_sets'
        AND COLUMN_NAME = 'special_images'
    ),
    'SELECT 1',
    'ALTER TABLE `armor_sets` ADD COLUMN `special_images` TEXT DEFAULT NULL AFTER `female_images`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'is_boss'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `is_boss` TINYINT(1) DEFAULT 0 AFTER `game_model_id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'boss_group_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `boss_group_id` BIGINT DEFAULT NULL AFTER `is_boss`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'boss_role'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `boss_role` VARCHAR(32) DEFAULT NULL AFTER `boss_group_id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'is_friendly'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `is_friendly` TINYINT(1) DEFAULT 0 AFTER `boss_role`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'is_town_npc'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `is_town_npc` TINYINT(1) DEFAULT 0 AFTER `is_friendly`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'behavior_notes'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `behavior_notes` TEXT DEFAULT NULL AFTER `is_town_npc`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `npcs`
SET
  `is_boss` = CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(`raw_json`, '$.flags.boss')) = 'true' THEN 1
    ELSE COALESCE(`is_boss`, 0)
  END,
  `is_friendly` = CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(`raw_json`, '$.flags.friendly')) = 'true' THEN 1
    ELSE COALESCE(`is_friendly`, 0)
  END,
  `is_town_npc` = CASE
    WHEN JSON_UNQUOTE(JSON_EXTRACT(`raw_json`, '$.extras.townNPC')) = 'true' THEN 1
    ELSE COALESCE(`is_town_npc`, 0)
  END
WHERE `raw_json` IS NOT NULL
  AND TRIM(`raw_json`) != '';

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `description`, `sort_order`, `status`, `deleted`)
SELECT 'ECTO_MIST', 'Ecto Mist', '灵雾', 'ENVIRONMENT', 'Crafting or selling condition sourced from cemetery mist.', 10, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'ECTO_MIST');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `description`, `sort_order`, `status`, `deleted`)
SELECT 'SNOW', 'Snow', '雪原', 'ENVIRONMENT', 'Environment-based crafting or selling condition.', 20, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'SNOW');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'NEW_MOON', 'New Moon', '新月', 'MOON_PHASE', 110, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'NEW_MOON');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'WAXING_CRESCENT', 'Waxing Crescent', '娥眉月', 'MOON_PHASE', 120, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'WAXING_CRESCENT');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'FIRST_QUARTER', 'First Quarter', '上弦月', 'MOON_PHASE', 130, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'FIRST_QUARTER');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'WAXING_GIBBOUS', 'Waxing Gibbous', '盈凸月', 'MOON_PHASE', 140, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'WAXING_GIBBOUS');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'FULL_MOON', 'Full Moon', '满月', 'MOON_PHASE', 150, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'FULL_MOON');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'WANING_GIBBOUS', 'Waning Gibbous', '亏凸月', 'MOON_PHASE', 160, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'WANING_GIBBOUS');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'LAST_QUARTER', 'Last Quarter', '下弦月', 'MOON_PHASE', 170, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'LAST_QUARTER');

INSERT INTO `world_contexts` (`code`, `name_en`, `name_zh`, `context_type`, `sort_order`, `status`, `deleted`)
SELECT 'WANING_CRESCENT', 'Waning Crescent', '残月', 'MOON_PHASE', 180, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `world_contexts` WHERE `code` = 'WANING_CRESCENT');
