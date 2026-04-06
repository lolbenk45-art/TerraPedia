SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'slug'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `slug` VARCHAR(255) DEFAULT NULL AFTER `internal_name`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'source_provider'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `source_provider` VARCHAR(64) DEFAULT NULL AFTER `tooltip`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'source_page'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `source_page` VARCHAR(255) DEFAULT NULL AFTER `source_provider`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'source_revision_timestamp'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `source_revision_timestamp` DATETIME DEFAULT NULL AFTER `source_page`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'last_synced_at'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `last_synced_at` DATETIME DEFAULT NULL AFTER `source_revision_timestamp`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND index_name = 'idx_items_slug'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_items_slug` ON `items` (`slug`)'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND index_name = 'idx_items_source_provider'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_items_source_provider` ON `items` (`source_provider`)'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
