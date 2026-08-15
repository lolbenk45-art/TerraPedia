ALTER TABLE `audio_assets`
  ADD COLUMN `display_name_zh` VARCHAR(255) DEFAULT NULL AFTER `source_key`,
  ADD COLUMN `display_name_en` VARCHAR(255) DEFAULT NULL AFTER `display_name_zh`,
  ADD INDEX `idx_audio_assets_display_name_zh` (`display_name_zh`);
