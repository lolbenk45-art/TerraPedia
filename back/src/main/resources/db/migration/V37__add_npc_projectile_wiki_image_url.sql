SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npcs'
        AND COLUMN_NAME = 'image_url'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `image_url` VARCHAR(500) DEFAULT NULL AFTER `sub_name_zh`'
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
        AND COLUMN_NAME = 'image_url'
    ),
    'SELECT 1',
    'ALTER TABLE `projectiles` ADD COLUMN `image_url` VARCHAR(500) DEFAULT NULL AFTER `name_zh`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
