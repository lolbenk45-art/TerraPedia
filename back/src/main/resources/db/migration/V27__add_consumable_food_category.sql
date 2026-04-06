INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '食物与饮品', 'CONSUMABLE_FOOD', 'CONSUMABLE', 5, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'CONSUMABLE'
  AND NOT EXISTS (SELECT 1 FROM `category` WHERE `code` = 'CONSUMABLE_FOOD');
