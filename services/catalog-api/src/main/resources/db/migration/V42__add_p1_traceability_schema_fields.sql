SET @local_schema_name = DATABASE();

SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @local_schema_name
        AND TABLE_NAME = 'buffs'
        AND COLUMN_NAME = 'image_provider'
    ),
    'SELECT 1',
    'ALTER TABLE `buffs` ADD COLUMN `image_provider` VARCHAR(64) DEFAULT NULL AFTER `image_last_verified_at`'
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
      WHERE TABLE_SCHEMA = @local_schema_name
        AND TABLE_NAME = 'buffs'
        AND COLUMN_NAME = 'image_source_page'
    ),
    'SELECT 1',
    'ALTER TABLE `buffs` ADD COLUMN `image_source_page` VARCHAR(500) DEFAULT NULL AFTER `image_provider`'
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
      WHERE TABLE_SCHEMA = @local_schema_name
        AND TABLE_NAME = 'buffs'
        AND COLUMN_NAME = 'image_source_file_title'
    ),
    'SELECT 1',
    'ALTER TABLE `buffs` ADD COLUMN `image_source_file_title` VARCHAR(255) DEFAULT NULL AFTER `image_source_page`'
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
      WHERE TABLE_SCHEMA = @local_schema_name
        AND TABLE_NAME = 'buffs'
        AND COLUMN_NAME = 'image_source_revision_timestamp'
    ),
    'SELECT 1',
    'ALTER TABLE `buffs` ADD COLUMN `image_source_revision_timestamp` DATETIME DEFAULT NULL AFTER `image_source_file_title`'
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
      WHERE TABLE_SCHEMA = 'terria_v1_maint'
        AND TABLE_NAME = 'maint_items'
        AND COLUMN_NAME = 'canonical_version'
    ),
    'SELECT 1',
    'ALTER TABLE `terria_v1_maint`.`maint_items` ADD COLUMN `canonical_version` VARCHAR(32) DEFAULT NULL AFTER `landing_content_hash`'
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
      WHERE TABLE_SCHEMA = 'terria_v1_maint'
        AND TABLE_NAME = 'maint_npcs'
        AND COLUMN_NAME = 'canonical_version'
    ),
    'SELECT 1',
    'ALTER TABLE `terria_v1_maint`.`maint_npcs` ADD COLUMN `canonical_version` VARCHAR(32) DEFAULT NULL AFTER `landing_content_hash`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
