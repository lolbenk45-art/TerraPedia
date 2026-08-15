CREATE TABLE IF NOT EXISTS `user_reading_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` BIGINT NOT NULL,
  `view_count` INT NOT NULL DEFAULT 1,
  `last_viewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_reading_history_target` (`user_id`, `target_type`, `target_id`),
  KEY `idx_user_reading_history_user_last_viewed` (`user_id`, `deleted`, `last_viewed_at`),
  KEY `idx_user_reading_history_target` (`target_type`, `target_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
