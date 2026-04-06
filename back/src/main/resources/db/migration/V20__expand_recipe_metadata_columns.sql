ALTER TABLE `recipes`
  ADD COLUMN `result_internal_name` VARCHAR(255) DEFAULT NULL AFTER `result_item_id`,
  MODIFY COLUMN `version_scope` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0 AFTER `source_revision_timestamp`;

ALTER TABLE `recipe_ingredients`
  ADD COLUMN `ingredient_internal_name` VARCHAR(255) DEFAULT NULL AFTER `ingredient_item_id`;

ALTER TABLE `recipe_stations`
  ADD COLUMN `station_internal_name` VARCHAR(255) DEFAULT NULL AFTER `station_item_id`;

UPDATE `recipes`
SET `sort_order` = `id`
WHERE `sort_order` = 0;
