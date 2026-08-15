-- Seed script for category table only.
-- Requires category table created by schema.sql or Flyway baseline migration.

-- 1) Insert root categories.
INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`)
SELECT s.parent_id, s.name, s.code, s.top_type, s.sort, s.status, s.creator_id
FROM (
  SELECT 0 AS parent_id, 'Weapon' AS name, 'WEAPON' AS code, 'ROOT' AS top_type, 1 AS sort, 1 AS status, 1 AS creator_id
  UNION ALL SELECT 0, 'Tool', 'TOOL', 'ROOT', 2, 1, 1
  UNION ALL SELECT 0, 'Armor', 'ARMOR', 'ROOT', 3, 1, 1
  UNION ALL SELECT 0, 'Consumable', 'CONSUMABLE', 'ROOT', 4, 1, 1
  UNION ALL SELECT 0, 'Material', 'MATERIAL', 'ROOT', 5, 1, 1
  UNION ALL SELECT 0, 'Furniture', 'FURNITURE', 'ROOT', 6, 1, 1
) s
WHERE NOT EXISTS (SELECT 1 FROM `category` c WHERE c.`code` = s.`code`);

-- 2) Insert child categories and resolve parent id by parent code.
INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`)
SELECT p.id, s.name, s.code, s.top_type, s.sort, s.status, s.creator_id
FROM (
  SELECT 'WEAPON' AS parent_code, 'Sword' AS name, 'SWORD' AS code, 'WEAPON' AS top_type, 1 AS sort, 1 AS status, 1 AS creator_id
  UNION ALL SELECT 'WEAPON', 'Bow', 'BOW', 'WEAPON', 2, 1, 1
  UNION ALL SELECT 'WEAPON', 'Staff', 'STAFF', 'WEAPON', 3, 1, 1
  UNION ALL SELECT 'TOOL', 'Pickaxe', 'PICKAXE', 'TOOL', 1, 1, 1
  UNION ALL SELECT 'TOOL', 'Axe', 'AXE', 'TOOL', 2, 1, 1
  UNION ALL SELECT 'ARMOR', 'Helmet', 'HELMET', 'ARMOR', 1, 1, 1
  UNION ALL SELECT 'ARMOR', 'Chestplate', 'CHESTPLATE', 'ARMOR', 2, 1, 1
  UNION ALL SELECT 'ARMOR', 'Leggings', 'LEGGINGS', 'ARMOR', 3, 1, 1
) s
JOIN `category` p ON p.`code` = s.parent_code
WHERE NOT EXISTS (SELECT 1 FROM `category` c WHERE c.`code` = s.`code`);
