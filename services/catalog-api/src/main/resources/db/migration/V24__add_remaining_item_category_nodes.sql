INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '翅膀', 'ACCESSORY_WINGS', 'ACCESSORY', 47, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ACCESSORY'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'ACCESSORY_WINGS');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '货币', 'MATERIAL_CURRENCY', 'MATERIAL', 6, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_CURRENCY');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '钥匙', 'MATERIAL_KEY', 'MATERIAL', 5, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_KEY');
