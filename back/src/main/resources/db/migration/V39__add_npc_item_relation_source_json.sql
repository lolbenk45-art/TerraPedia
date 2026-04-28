SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'items'
        AND COLUMN_NAME = 'source_npcs_json'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `source_npcs_json` LONGTEXT DEFAULT NULL AFTER `stack_size`'
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
        AND COLUMN_NAME = 'loot_items_json'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `loot_items_json` LONGTEXT DEFAULT NULL AFTER `raw_json`'
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
        AND COLUMN_NAME = 'shop_items_json'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `shop_items_json` LONGTEXT DEFAULT NULL AFTER `loot_items_json`'
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
        AND COLUMN_NAME = 'source_items_json'
    ),
    'SELECT 1',
    'ALTER TABLE `npcs` ADD COLUMN `source_items_json` LONGTEXT DEFAULT NULL AFTER `shop_items_json`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
