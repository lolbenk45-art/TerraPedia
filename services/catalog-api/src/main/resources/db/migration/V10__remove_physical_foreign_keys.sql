-- Remove physical foreign keys and keep logical foreign keys only.
-- This migration is idempotent and safe for environments where constraints may already be absent.

SET @drop_fk_user_refresh_tokens = (
    SELECT IF(
        COUNT(*) > 0,
        'ALTER TABLE `user_refresh_tokens` DROP FOREIGN KEY `fk_user_refresh_tokens_user_id`',
        'SELECT 1'
    )
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'user_refresh_tokens'
      AND CONSTRAINT_NAME = 'fk_user_refresh_tokens_user_id'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
PREPARE stmt_drop_fk_user_refresh_tokens FROM @drop_fk_user_refresh_tokens;
EXECUTE stmt_drop_fk_user_refresh_tokens;
DEALLOCATE PREPARE stmt_drop_fk_user_refresh_tokens;

SET @drop_fk_article_review_log = (
    SELECT IF(
        COUNT(*) > 0,
        'ALTER TABLE `article_review_log` DROP FOREIGN KEY `fk_article_review_log_article_id`',
        'SELECT 1'
    )
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'article_review_log'
      AND CONSTRAINT_NAME = 'fk_article_review_log_article_id'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
PREPARE stmt_drop_fk_article_review_log FROM @drop_fk_article_review_log;
EXECUTE stmt_drop_fk_article_review_log;
DEALLOCATE PREPARE stmt_drop_fk_article_review_log;
