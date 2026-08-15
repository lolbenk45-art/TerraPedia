SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'banner_source_item_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `banner_source_item_id` INT DEFAULT NULL'
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
        AND COLUMN_NAME = 'banner_item_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `banner_item_id` BIGINT DEFAULT NULL'
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
        AND COLUMN_NAME = 'catch_source_item_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `catch_source_item_id` INT DEFAULT NULL'
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
        AND COLUMN_NAME = 'catch_item_id'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `catch_item_id` BIGINT DEFAULT NULL'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
