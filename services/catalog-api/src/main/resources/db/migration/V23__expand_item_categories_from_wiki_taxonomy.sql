INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '饰品', 'ACCESSORY', 'ACCESSORY', 51, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'ACCESSORY');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '时装', 'VANITY', 'VANITY', 52, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'VANITY');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '染料', 'DYE', 'DYE', 53, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'DYE');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '宠物召唤', 'PET', 'PET', 54, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'PET');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '坐骑召唤', 'MOUNT', 'MOUNT', 55, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MOUNT');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '小动物', 'CRITTER', 'CRITTER', 56, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CRITTER');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT 0, '杂项', 'MISC', 'MISC', 57, 1, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MISC');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '盾牌', 'ACCESSORY_SHIELD', 'ACCESSORY', 50, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ACCESSORY'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'ACCESSORY_SHIELD');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '靴子', 'ACCESSORY_BOOTS', 'ACCESSORY', 49, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ACCESSORY'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'ACCESSORY_BOOTS');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '其他饰品', 'ACCESSORY_MISC', 'ACCESSORY', 48, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ACCESSORY'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'ACCESSORY_MISC');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '药水', 'CONSUMABLE_POTION', 'CONSUMABLE', 10, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_POTION');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '召唤物品', 'CONSUMABLE_SUMMON', 'CONSUMABLE', 9, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_SUMMON');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '抓包与宝匣', 'CONSUMABLE_GRAB_BAG', 'CONSUMABLE', 8, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_GRAB_BAG');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '永久增益', 'CONSUMABLE_PERMANENT_BOOSTER', 'CONSUMABLE', 7, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_PERMANENT_BOOSTER');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '其他消耗品', 'CONSUMABLE_MISC', 'CONSUMABLE', 6, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_MISC');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '矿石', 'MATERIAL_ORE', 'MATERIAL', 15, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_ORE');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '锭', 'MATERIAL_BAR', 'MATERIAL', 14, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_BAR');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '宝石', 'MATERIAL_GEM', 'MATERIAL', 13, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_GEM');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '种子', 'MATERIAL_SEED', 'MATERIAL', 12, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_SEED');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '药水材料', 'MATERIAL_POTION_INGREDIENT', 'MATERIAL', 11, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_POTION_INGREDIENT');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '物块', 'MATERIAL_BLOCK', 'MATERIAL', 10, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_BLOCK');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '砖块', 'MATERIAL_BRICK', 'MATERIAL', 9, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_BRICK');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '墙', 'MATERIAL_WALL', 'MATERIAL', 8, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_WALL');

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '其他材料', 'MATERIAL_MISC', 'MATERIAL', 7, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'MATERIAL'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'MATERIAL_MISC');
