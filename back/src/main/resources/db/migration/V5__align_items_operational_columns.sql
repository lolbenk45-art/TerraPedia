SET @ddl = (
  SELECT IF(
    EXISTS(
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'items'
        AND column_name = 'damage'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `damage` INT DEFAULT NULL AFTER `description`'
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
        AND column_name = 'defense'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `defense` INT DEFAULT NULL AFTER `damage`'
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
        AND column_name = 'rarity_id'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `rarity_id` BIGINT DEFAULT NULL AFTER `defense`'
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
        AND column_name = 'game_period_id'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `game_period_id` BIGINT DEFAULT NULL AFTER `rarity_id`'
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
        AND column_name = 'game_model_id'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `game_model_id` BIGINT DEFAULT NULL AFTER `game_period_id`'
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
        AND column_name = 'is_stackable'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `is_stackable` TINYINT(1) DEFAULT 0 AFTER `game_model_id`'
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
        AND column_name = 'stack_size'
    ),
    'SELECT 1',
    'ALTER TABLE `items` ADD COLUMN `stack_size` INT DEFAULT 1 AFTER `is_stackable`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
