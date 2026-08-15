ALTER TABLE `buffs`
  ADD COLUMN `image_original_url` VARCHAR(500) DEFAULT NULL AFTER `image`,
  ADD COLUMN `image_cached_url` VARCHAR(500) DEFAULT NULL AFTER `image_original_url`,
  ADD COLUMN `image_content_type` VARCHAR(128) DEFAULT NULL AFTER `image_cached_url`,
  ADD COLUMN `image_last_verified_at` DATETIME DEFAULT NULL AFTER `image_content_type`;

UPDATE `buffs`
SET `image_original_url` = `image`
WHERE `image_original_url` IS NULL
  AND `image` IS NOT NULL
  AND `image` LIKE '%wiki.gg%';

UPDATE `buffs`
SET `image_cached_url` = `image`
WHERE `image_cached_url` IS NULL
  AND `image` IS NOT NULL
  AND `image` LIKE '%/terrapedia-images/%';
