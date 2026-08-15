SET @schema_name = DATABASE();

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'npcs' AND COLUMN_NAME = 'wiki_assets_json'
  ),
  'ALTER TABLE `npcs` ADD COLUMN `wiki_assets_json` LONGTEXT DEFAULT NULL AFTER `source_items_json`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'npcs' AND COLUMN_NAME = 'living_preferences_json'
  ),
  'ALTER TABLE `npcs` ADD COLUMN `living_preferences_json` LONGTEXT DEFAULT NULL AFTER `wiki_assets_json`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
