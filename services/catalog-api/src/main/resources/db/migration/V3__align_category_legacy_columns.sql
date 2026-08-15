SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'category'
        AND column_name = 'description'
    ),
    'SELECT 1',
    'ALTER TABLE `category` ADD COLUMN `description` TEXT NULL AFTER `sort`'
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
        AND table_name = 'category'
        AND column_name = 'icon'
    ),
    'SELECT 1',
    'ALTER TABLE `category` ADD COLUMN `icon` VARCHAR(255) NULL AFTER `description`'
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
        AND table_name = 'category'
        AND column_name = 'deleted'
    ),
    'SELECT 1',
    'ALTER TABLE `category` ADD COLUMN `deleted` TINYINT DEFAULT 0 AFTER `creator_id`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
