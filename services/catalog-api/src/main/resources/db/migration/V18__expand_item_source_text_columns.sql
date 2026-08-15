ALTER TABLE `item_acquisition_sources`
  MODIFY COLUMN `quantity_text` TEXT DEFAULT NULL,
  MODIFY COLUMN `chance_text` TEXT DEFAULT NULL;
