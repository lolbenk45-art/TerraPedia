SET @has_markdown := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_markdown'
);

SET @has_html := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_html'
);

SET @sql := IF(
  @has_markdown = 1 AND @has_html = 0,
  'ALTER TABLE `articles` CHANGE COLUMN `content_markdown` `content_html` MEDIUMTEXT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_markdown := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_markdown'
);

SET @has_html := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_html'
);

SET @sql := IF(
  @has_markdown = 1 AND @has_html = 1,
  'UPDATE `articles` SET `content_html` = CASE WHEN `content_html` IS NULL OR TRIM(`content_html`) = '''''' THEN `content_markdown` ELSE `content_html` END',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_markdown := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_markdown'
);

SET @has_html := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'articles'
    AND COLUMN_NAME = 'content_html'
);

SET @sql := IF(
  @has_markdown = 1 AND @has_html = 1,
  'ALTER TABLE `articles` DROP COLUMN `content_markdown`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
