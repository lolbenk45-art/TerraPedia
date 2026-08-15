SET @projectiles_name_zh_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'projectiles'
      AND COLUMN_NAME = 'name_zh'
);

SET @projectiles_name_zh_sql := IF(
    @projectiles_name_zh_exists = 0,
    'ALTER TABLE `projectiles` ADD COLUMN `name_zh` VARCHAR(255) DEFAULT NULL AFTER `name`',
    'SELECT 1'
);
PREPARE projectiles_name_zh_stmt FROM @projectiles_name_zh_sql;
EXECUTE projectiles_name_zh_stmt;
DEALLOCATE PREPARE projectiles_name_zh_stmt;

SET @projectiles_name_zh_index_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'projectiles'
      AND INDEX_NAME = 'idx_projectiles_name_zh'
);

SET @projectiles_name_zh_index_sql := IF(
    @projectiles_name_zh_index_exists = 0,
    'ALTER TABLE `projectiles` ADD INDEX `idx_projectiles_name_zh` (`name_zh`)',
    'SELECT 1'
);
PREPARE projectiles_name_zh_index_stmt FROM @projectiles_name_zh_index_sql;
EXECUTE projectiles_name_zh_index_stmt;
DEALLOCATE PREPARE projectiles_name_zh_index_stmt;
