SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'projectiles'
        AND COLUMN_NAME = 'source_items_json'
    ),
    'SELECT 1',
    'ALTER TABLE `projectiles` ADD COLUMN `source_items_json` LONGTEXT DEFAULT NULL AFTER `raw_json`'
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
        AND TABLE_NAME = 'projectiles'
        AND COLUMN_NAME = 'source_npcs_json'
    ),
    'SELECT 1',
    'ALTER TABLE `projectiles` ADD COLUMN `source_npcs_json` LONGTEXT DEFAULT NULL AFTER `source_items_json`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
