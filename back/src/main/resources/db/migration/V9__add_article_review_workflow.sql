ALTER TABLE `articles`
  ADD COLUMN `review_status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT' AFTER `status`,
  ADD COLUMN `review_comment` VARCHAR(600) DEFAULT NULL AFTER `review_status`,
  ADD COLUMN `reviewed_at` DATETIME DEFAULT NULL AFTER `review_comment`,
  ADD COLUMN `submitted_at` DATETIME DEFAULT NULL AFTER `reviewed_at`,
  ADD COLUMN `reviewer_name` VARCHAR(120) DEFAULT NULL AFTER `submitted_at`;

CREATE TABLE IF NOT EXISTS `article_review_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `article_id` BIGINT NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `from_review_status` VARCHAR(24) DEFAULT NULL,
  `to_review_status` VARCHAR(24) DEFAULT NULL,
  `comment` VARCHAR(600) DEFAULT NULL,
  `reviewer_name` VARCHAR(120) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_article_review_log_article_created` (`article_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE `articles`
SET
  `review_status` = CASE
    WHEN `status` = 'PUBLISHED' THEN 'APPROVED'
    ELSE 'DRAFT'
  END,
  `reviewed_at` = CASE
    WHEN `status` = 'PUBLISHED' THEN COALESCE(`published_at`, NOW())
    ELSE NULL
  END,
  `reviewer_name` = CASE
    WHEN `status` = 'PUBLISHED' THEN 'SYSTEM_MIGRATION'
    ELSE NULL
  END;
