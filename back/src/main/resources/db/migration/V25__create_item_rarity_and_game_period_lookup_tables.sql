CREATE TABLE IF NOT EXISTS `item_rarity` (
  `id` BIGINT NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `display_name_zh` VARCHAR(64) NOT NULL,
  `display_name_en` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_rarity_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `game_period` (
  `id` BIGINT NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `display_name_zh` VARCHAR(64) NOT NULL,
  `display_name_en` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_game_period_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `item_rarity` (`id`, `code`, `display_name_zh`, `display_name_en`, `sort_order`, `status`, `deleted`)
VALUES
  (1, 'common', '普通', 'Common', 1, 1, 0),
  (2, 'rare', '稀有', 'Rare', 2, 1, 0),
  (3, 'epic', '史诗', 'Epic', 3, 1, 0),
  (4, 'legendary', '传说', 'Legendary', 4, 1, 0)
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `display_name_zh` = VALUES(`display_name_zh`),
  `display_name_en` = VALUES(`display_name_en`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `deleted` = VALUES(`deleted`),
  `updated_at` = NOW();

INSERT INTO `game_period` (`id`, `code`, `display_name_zh`, `display_name_en`, `sort_order`, `status`, `deleted`)
VALUES
  (1, 'pre_hardmode', '困难模式前', 'Pre-Hardmode', 1, 1, 0),
  (2, 'hardmode', '困难模式', 'Hardmode', 2, 1, 0)
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `display_name_zh` = VALUES(`display_name_zh`),
  `display_name_en` = VALUES(`display_name_en`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `deleted` = VALUES(`deleted`),
  `updated_at` = NOW();
