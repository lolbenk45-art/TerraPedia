SET @schema_name = DATABASE();

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_code'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_code` VARCHAR(100) DEFAULT NULL AFTER `biome_type`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_name_en'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_name_en` VARCHAR(255) DEFAULT NULL AFTER `wiki_group_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_group_name_zh'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_group_name_zh` VARCHAR(255) DEFAULT NULL AFTER `wiki_group_name_en`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_code'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_code` VARCHAR(100) DEFAULT NULL AFTER `wiki_group_name_zh`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_name_en'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_name_en` VARCHAR(255) DEFAULT NULL AFTER `wiki_parent_group_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_parent_group_name_zh'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_parent_group_name_zh` VARCHAR(255) DEFAULT NULL AFTER `wiki_parent_group_name_en`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_section_level'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_section_level` INT DEFAULT NULL AFTER `wiki_parent_group_name_zh`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_sort_order'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_sort_order` INT DEFAULT NULL AFTER `wiki_section_level`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND COLUMN_NAME = 'wiki_section_anchor'
  ),
  'ALTER TABLE `biomes` ADD COLUMN `wiki_section_anchor` VARCHAR(255) DEFAULT NULL AFTER `wiki_sort_order`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_group'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_group` (`wiki_group_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_parent_group'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_parent_group` (`wiki_parent_group_code`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'biomes' AND INDEX_NAME = 'idx_biomes_wiki_order'
  ),
  'ALTER TABLE `biomes` ADD INDEX `idx_biomes_wiki_order` (`wiki_sort_order`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
