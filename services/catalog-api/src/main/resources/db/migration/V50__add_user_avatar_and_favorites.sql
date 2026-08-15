ALTER TABLE `users`
  ADD COLUMN `avatar_url` VARCHAR(500) DEFAULT NULL AFTER `display_name`,
  ADD COLUMN `avatar_object_key` VARCHAR(500) DEFAULT NULL AFTER `avatar_url`,
  ADD COLUMN `avatar_updated_at` DATETIME DEFAULT NULL AFTER `avatar_object_key`;

CREATE TABLE IF NOT EXISTS `user_item_favorites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `item_id` BIGINT NOT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_item_favorite` (`user_id`, `item_id`),
  KEY `idx_user_item_favorites_user_created` (`user_id`, `deleted`, `created_at`),
  KEY `idx_user_item_favorites_item` (`item_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_article_favorites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `article_id` BIGINT NOT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_article_favorite` (`user_id`, `article_id`),
  KEY `idx_user_article_favorites_user_created` (`user_id`, `deleted`, `created_at`),
  KEY `idx_user_article_favorites_article` (`article_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
