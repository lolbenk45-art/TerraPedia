SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'boss_groups'
        AND COLUMN_NAME = 'summon_method'
    ),
    'SELECT 1',
    'ALTER TABLE `boss_groups` ADD COLUMN `summon_method` TEXT DEFAULT NULL AFTER `notes`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
