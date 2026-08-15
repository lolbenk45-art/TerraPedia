SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'description'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `description` TEXT NULL AFTER `category_id`'
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
        AND column_name = 'deleted'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `deleted` TINYINT DEFAULT 0 AFTER `status`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
