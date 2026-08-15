UPDATE `category`
SET `name` = '武器',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'WEAPON';

UPDATE `category`
SET `name` = '工具',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'TOOL';

UPDATE `category`
SET `name` = '盔甲',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'ARMOR';

UPDATE `category`
SET `name` = '家具',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'FURNITURE';

UPDATE `category`
SET `name` = '状态效果',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` IN ('CATEGORY_BUFF', 'BUFF');

UPDATE `category`
SET `name` = '非玩家角色',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` IN ('CATEGORY_NPC', 'NPC');

UPDATE `category`
SET `name` = '投射物',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'PROJECTILE';

UPDATE `category`
SET `name` = '盔甲套装',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'ARMOR_SET';

UPDATE `category`
SET `name` = '消耗品',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'CONSUMABLE';

UPDATE `category`
SET `name` = '材料',
    `updated_at` = NOW()
WHERE `deleted` = 0
  AND `code` = 'MATERIAL';

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '镐和钻头', 'TOOL_PICKAXE_DRILL', 'TOOL', 28, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'TOOL_PICKAXE_DRILL'
  );

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '斧头和链锯', 'TOOL_AXE_CHAINSAW', 'TOOL', 27, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'TOOL_AXE_CHAINSAW'
  );

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '盔甲部件', 'ARMOR_PART', 'ARMOR', 47, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ARMOR'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'ARMOR_PART'
  );

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '头盔', 'ARMOR_PART_HEAD', 'ARMOR', 40, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ARMOR_PART'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'ARMOR_PART_HEAD'
  );

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '胸甲', 'ARMOR_PART_BODY', 'ARMOR', 41, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ARMOR_PART'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'ARMOR_PART_BODY'
  );

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '护腿', 'ARMOR_PART_LEGS', 'ARMOR', 42, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'ARMOR_PART'
  AND parent_ref.`deleted` = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `category` current_ref
    WHERE current_ref.`code` = 'ARMOR_PART_LEGS'
  );

UPDATE `items` target
JOIN `category` from_ref ON from_ref.`id` = target.`category_id` AND from_ref.`deleted` = 0
JOIN `category` to_ref ON to_ref.`code` = 'TOOL_PICKAXE_DRILL' AND to_ref.`deleted` = 0
SET target.`category_id` = to_ref.`id`,
    target.`updated_at` = NOW()
WHERE from_ref.`code` = 'PICKAXE'
  AND target.`deleted` = 0;

UPDATE `items` target
JOIN `category` from_ref ON from_ref.`id` = target.`category_id` AND from_ref.`deleted` = 0
JOIN `category` to_ref ON to_ref.`code` = 'TOOL_AXE_CHAINSAW' AND to_ref.`deleted` = 0
SET target.`category_id` = to_ref.`id`,
    target.`updated_at` = NOW()
WHERE from_ref.`code` = 'AXE'
  AND target.`deleted` = 0;

UPDATE `items` target
JOIN `category` from_ref ON from_ref.`id` = target.`category_id` AND from_ref.`deleted` = 0
JOIN `category` to_ref ON to_ref.`code` = 'ARMOR_PART_HEAD' AND to_ref.`deleted` = 0
SET target.`category_id` = to_ref.`id`,
    target.`updated_at` = NOW()
WHERE from_ref.`code` = 'HELMET'
  AND target.`deleted` = 0;

UPDATE `items` target
JOIN `category` from_ref ON from_ref.`id` = target.`category_id` AND from_ref.`deleted` = 0
JOIN `category` to_ref ON to_ref.`code` = 'ARMOR_PART_BODY' AND to_ref.`deleted` = 0
SET target.`category_id` = to_ref.`id`,
    target.`updated_at` = NOW()
WHERE from_ref.`code` = 'CHESTPLATE'
  AND target.`deleted` = 0;

UPDATE `items` target
JOIN `category` from_ref ON from_ref.`id` = target.`category_id` AND from_ref.`deleted` = 0
JOIN `category` to_ref ON to_ref.`code` = 'ARMOR_PART_LEGS' AND to_ref.`deleted` = 0
SET target.`category_id` = to_ref.`id`,
    target.`updated_at` = NOW()
WHERE from_ref.`code` = 'LEGGINGS'
  AND target.`deleted` = 0;

DELETE legacy_ref
FROM `category` legacy_ref
LEFT JOIN `items` item_ref ON item_ref.`category_id` = legacy_ref.`id` AND item_ref.`deleted` = 0
LEFT JOIN `category` child_ref ON child_ref.`parent_id` = legacy_ref.`id` AND child_ref.`deleted` = 0
WHERE legacy_ref.`deleted` = 0
  AND legacy_ref.`code` IN ('SWORD', 'BOW', 'STAFF', 'PICKAXE', 'AXE', 'HELMET', 'CHESTPLATE', 'LEGGINGS')
  AND item_ref.`id` IS NULL
  AND child_ref.`id` IS NULL;
