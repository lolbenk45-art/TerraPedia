SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'name_zh'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `name_zh` VARCHAR(255) DEFAULT NULL AFTER `name`'
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
        AND COLUMN_NAME = 'sub_name_zh'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `sub_name_zh` VARCHAR(255) DEFAULT NULL AFTER `sub_name`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
