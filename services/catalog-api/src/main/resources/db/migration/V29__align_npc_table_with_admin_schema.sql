SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'game_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `game_id` BIGINT DEFAULT NULL AFTER `id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `npcs`
SET `game_id` = `source_id`
WHERE `game_id` IS NULL;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'sub_name'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `sub_name` VARCHAR(255) DEFAULT NULL AFTER `name`'
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
        AND COLUMN_NAME = 'category_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `category_id` BIGINT DEFAULT NULL AFTER `sub_name`'
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
        AND COLUMN_NAME = 'game_period_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `game_period_id` BIGINT DEFAULT NULL AFTER `category_id`'
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
        AND COLUMN_NAME = 'game_model_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `game_model_id` BIGINT DEFAULT NULL AFTER `game_period_id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `npcs`
SET `sub_name` = COALESCE(`sub_name`, ''),
    `category_id` = COALESCE(`category_id`, 0),
    `game_period_id` = COALESCE(`game_period_id`, 0),
    `game_model_id` = COALESCE(`game_model_id`, 0);

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND INDEX_NAME = 'uk_npcs_game_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD UNIQUE KEY `uk_npcs_game_id` (`game_id`)'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
