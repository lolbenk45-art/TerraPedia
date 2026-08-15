SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'npc_loot_entries'
        AND COLUMN_NAME = 'drop_source_kind'
    ),
    'SELECT 1',
    'ALTER TABLE `npc_loot_entries` ADD COLUMN `drop_source_kind` VARCHAR(32) DEFAULT NULL AFTER `source_item_id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
