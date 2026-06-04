ALTER TABLE `users`
  ADD COLUMN `theme_preference` VARCHAR(40) NOT NULL DEFAULT 'dark' AFTER `avatar_updated_at`,
  ADD COLUMN `detail_density` VARCHAR(40) NOT NULL DEFAULT 'readable' AFTER `theme_preference`,
  ADD COLUMN `default_favorites_filter` VARCHAR(40) NOT NULL DEFAULT 'all' AFTER `detail_density`;

CREATE TABLE IF NOT EXISTS `user_saved_routes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` VARCHAR(40) NOT NULL,
  `target_id` BIGINT NOT NULL,
  `route_mode` VARCHAR(40) NOT NULL DEFAULT 'crafting',
  `selected_variant` VARCHAR(120) DEFAULT NULL,
  `selected_recipe_key` VARCHAR(120) DEFAULT NULL,
  `max_depth` INT NOT NULL DEFAULT 5,
  `title` VARCHAR(255) NOT NULL,
  `note` VARCHAR(600) DEFAULT NULL,
  `url` VARCHAR(500) NOT NULL,
  `snapshot_json` JSON DEFAULT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_saved_route_target` (`user_id`, `target_type`, `target_id`, `route_mode`),
  KEY `idx_user_saved_routes_user_updated` (`user_id`, `deleted`, `updated_at`),
  KEY `idx_user_saved_routes_target` (`target_type`, `target_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `type` VARCHAR(60) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` VARCHAR(1000) DEFAULT NULL,
  `target_url` VARCHAR(500) DEFAULT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `read_at` DATETIME DEFAULT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_notifications_user_created` (`user_id`, `deleted`, `created_at`),
  KEY `idx_user_notifications_user_read` (`user_id`, `deleted`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
