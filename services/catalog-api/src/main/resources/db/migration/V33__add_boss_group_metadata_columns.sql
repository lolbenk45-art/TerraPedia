SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'boss_groups'
        AND COLUMN_NAME = 'boss_type'
    ),
    'SELECT 1',
    'ALTER TABLE `boss_groups` ADD COLUMN `boss_type` VARCHAR(32) DEFAULT NULL AFTER `name_zh`'
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
        AND TABLE_NAME = 'boss_groups'
        AND COLUMN_NAME = 'source_page'
    ),
    'SELECT 1',
    'ALTER TABLE `boss_groups` ADD COLUMN `source_page` VARCHAR(255) DEFAULT NULL AFTER `notes`'
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
        AND TABLE_NAME = 'boss_groups'
        AND COLUMN_NAME = 'source_revision_timestamp'
    ),
    'SELECT 1',
    'ALTER TABLE `boss_groups` ADD COLUMN `source_revision_timestamp` DATETIME DEFAULT NULL AFTER `source_page`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
