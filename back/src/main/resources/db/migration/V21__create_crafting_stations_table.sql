CREATE TABLE IF NOT EXISTS `crafting_stations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT DEFAULT NULL,
  `internal_name` VARCHAR(255) DEFAULT NULL,
  `name_en` VARCHAR(255) DEFAULT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `station_type` VARCHAR(32) NOT NULL DEFAULT 'crafting_station',
  `notes` TEXT DEFAULT NULL,
  `image_url` VARCHAR(500) DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crafting_stations_item_id` (`item_id`),
  INDEX `idx_crafting_stations_internal_name` (`internal_name`),
  INDEX `idx_crafting_stations_type` (`station_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `recipe_stations`
  ADD COLUMN `station_id` BIGINT DEFAULT NULL AFTER `recipe_id`,
  ADD INDEX `idx_recipe_stations_station_id` (`station_id`);

INSERT INTO `crafting_stations` (
  `item_id`,
  `internal_name`,
  `name_en`,
  `name_zh`,
  `image_url`,
  `sort_order`,
  `status`,
  `deleted`
)
SELECT DISTINCT
  rs.`station_item_id`,
  COALESCE(NULLIF(rs.`station_internal_name`, ''), NULLIF(i.`internal_name`, '')),
  COALESCE(NULLIF(i.`name`, ''), NULLIF(rs.`station_name_raw`, '')),
  NULLIF(i.`name_zh`, ''),
  NULLIF(i.`image`, ''),
  0,
  1,
  0
FROM `recipe_stations` rs
LEFT JOIN `items` i ON i.`id` = rs.`station_item_id`
WHERE rs.`station_item_id` IS NOT NULL
   OR NULLIF(rs.`station_internal_name`, '') IS NOT NULL
   OR NULLIF(rs.`station_name_raw`, '') IS NOT NULL;

UPDATE `recipe_stations` rs
JOIN `crafting_stations` cs
  ON (
    rs.`station_item_id` IS NOT NULL
    AND cs.`item_id` = rs.`station_item_id`
  ) OR (
    rs.`station_item_id` IS NULL
    AND NULLIF(rs.`station_internal_name`, '') IS NOT NULL
    AND cs.`internal_name` = rs.`station_internal_name`
  ) OR (
    rs.`station_item_id` IS NULL
    AND NULLIF(rs.`station_internal_name`, '') IS NULL
    AND NULLIF(rs.`station_name_raw`, '') IS NOT NULL
    AND cs.`name_en` = rs.`station_name_raw`
  )
SET rs.`station_id` = cs.`id`
WHERE rs.`station_id` IS NULL;
