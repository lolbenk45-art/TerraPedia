SET @schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'world_contexts'
        AND COLUMN_NAME = 'source_provider'
    ),
    'SELECT 1',
    'ALTER TABLE `world_contexts` ADD COLUMN `source_provider` VARCHAR(64) DEFAULT NULL AFTER `icon_url`'
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
        AND TABLE_NAME = 'world_contexts'
        AND COLUMN_NAME = 'source_page'
    ),
    'SELECT 1',
    'ALTER TABLE `world_contexts` ADD COLUMN `source_page` VARCHAR(255) DEFAULT NULL AFTER `source_provider`'
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
        AND TABLE_NAME = 'world_contexts'
        AND COLUMN_NAME = 'source_revision_timestamp'
    ),
    'SELECT 1',
    'ALTER TABLE `world_contexts` ADD COLUMN `source_revision_timestamp` DATETIME DEFAULT NULL AFTER `source_page`'
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
        AND TABLE_NAME = 'world_contexts'
        AND COLUMN_NAME = 'last_synced_at'
    ),
    'SELECT 1',
    'ALTER TABLE `world_contexts` ADD COLUMN `last_synced_at` DATETIME DEFAULT NULL AFTER `source_revision_timestamp`'
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
        AND TABLE_NAME = 'world_contexts'
        AND COLUMN_NAME = 'raw_json'
    ),
    'SELECT 1',
    'ALTER TABLE `world_contexts` ADD COLUMN `raw_json` LONGTEXT DEFAULT NULL AFTER `last_synced_at`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'world_contexts'
        AND INDEX_NAME = 'idx_world_contexts_source'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_world_contexts_source` ON `world_contexts` (`source_provider`, `source_page`)'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
