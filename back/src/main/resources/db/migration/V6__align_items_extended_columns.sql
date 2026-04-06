SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'knockback'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `knockback` INT DEFAULT NULL AFTER `defense`'
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
        AND column_name = 'use_time'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `use_time` INT DEFAULT NULL AFTER `knockback`'
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
        AND column_name = 'width'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `width` INT DEFAULT NULL AFTER `use_time`'
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
        AND column_name = 'height'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `height` INT DEFAULT NULL AFTER `width`'
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
        AND column_name = 'buy'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `buy` INT DEFAULT NULL AFTER `height`'
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
        AND column_name = 'sell'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `sell` INT DEFAULT NULL AFTER `buy`'
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
        AND column_name = 'tooltip'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `tooltip` TEXT DEFAULT NULL AFTER `sell`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
