ALTER TABLE `items`
  ADD COLUMN `name_zh` VARCHAR(255) DEFAULT NULL AFTER `name`,
  ADD COLUMN `description_zh` TEXT DEFAULT NULL AFTER `description`,
  ADD COLUMN `tooltip_zh` TEXT DEFAULT NULL AFTER `tooltip`;
