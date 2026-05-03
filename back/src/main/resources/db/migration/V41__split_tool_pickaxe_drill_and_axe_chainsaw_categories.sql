INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '采掘工具', 'TOOL_PICKAXE_DRILL', 'TOOL', 29, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '镐类', 'TOOL_PICKAXE', 'TOOL', 28, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `parent_id` = VALUES(`parent_id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '钻头', 'TOOL_DRILL', 'TOOL', 27, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `parent_id` = VALUES(`parent_id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '砍伐工具', 'TOOL_AXE_CHAINSAW', 'TOOL', 26, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '斧类', 'TOOL_AXE', 'TOOL', 25, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `parent_id` = VALUES(`parent_id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `category` (`parent_id`, `name`, `code`, `top_type`, `sort`, `status`, `creator_id`, `deleted`)
SELECT parent_ref.id, '链锯', 'TOOL_CHAINSAW', 'TOOL', 24, 1, 1, 0
FROM `category` parent_ref
WHERE parent_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND parent_ref.`deleted` = 0
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `parent_id` = VALUES(`parent_id`),
  `name` = VALUES(`name`),
  `top_type` = VALUES(`top_type`),
  `sort` = VALUES(`sort`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

UPDATE `items` item_ref
JOIN `category` old_ref ON old_ref.`id` = item_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_DRILL' AND new_ref.`deleted` = 0
SET item_ref.`category_id` = new_ref.`id`,
    item_ref.`updated_at` = NOW()
WHERE old_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND item_ref.`deleted` = 0
  AND (
    LOWER(COALESCE(item_ref.`name`, '')) LIKE '%drill%'
    OR LOWER(COALESCE(item_ref.`internal_name`, '')) LIKE '%drill%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%钻头%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%电钻%'
  );

UPDATE `items` item_ref
JOIN `category` old_ref ON old_ref.`id` = item_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_PICKAXE' AND new_ref.`deleted` = 0
SET item_ref.`category_id` = new_ref.`id`,
    item_ref.`updated_at` = NOW()
WHERE old_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND item_ref.`deleted` = 0;

UPDATE `items` item_ref
JOIN `category` old_ref ON old_ref.`id` = item_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_CHAINSAW' AND new_ref.`deleted` = 0
SET item_ref.`category_id` = new_ref.`id`,
    item_ref.`updated_at` = NOW()
WHERE old_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND item_ref.`deleted` = 0
  AND (
    LOWER(COALESCE(item_ref.`name`, '')) LIKE '%chainsaw%'
    OR LOWER(COALESCE(item_ref.`internal_name`, '')) LIKE '%chainsaw%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%链锯%'
  );

UPDATE `items` item_ref
JOIN `category` old_ref ON old_ref.`id` = item_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_AXE' AND new_ref.`deleted` = 0
SET item_ref.`category_id` = new_ref.`id`,
    item_ref.`updated_at` = NOW()
WHERE old_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND item_ref.`deleted` = 0;

INSERT INTO `item_category_rel` (
  `item_id`, `category_id`, `is_primary`, `relation_type`, `sort_order`, `source_provider`, `source_page`, `source_revision_timestamp`, `status`, `deleted`
)
SELECT item_ref.`id`, new_ref.`id`, CASE WHEN item_ref.`category_id` = new_ref.`id` THEN 1 ELSE rel_ref.`is_primary` END,
       rel_ref.`relation_type`, rel_ref.`sort_order`, rel_ref.`source_provider`, rel_ref.`source_page`, rel_ref.`source_revision_timestamp`, 1, 0
FROM `item_category_rel` rel_ref
JOIN `items` item_ref ON item_ref.`id` = rel_ref.`item_id` AND item_ref.`deleted` = 0
JOIN `category` old_ref ON old_ref.`id` = rel_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_DRILL' AND new_ref.`deleted` = 0
WHERE old_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND rel_ref.`deleted` = 0
  AND (
    LOWER(COALESCE(item_ref.`name`, '')) LIKE '%drill%'
    OR LOWER(COALESCE(item_ref.`internal_name`, '')) LIKE '%drill%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%钻头%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%电钻%'
  )
ON DUPLICATE KEY UPDATE
  `is_primary` = VALUES(`is_primary`),
  `relation_type` = VALUES(`relation_type`),
  `sort_order` = VALUES(`sort_order`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `item_category_rel` (
  `item_id`, `category_id`, `is_primary`, `relation_type`, `sort_order`, `source_provider`, `source_page`, `source_revision_timestamp`, `status`, `deleted`
)
SELECT item_ref.`id`, new_ref.`id`, CASE WHEN item_ref.`category_id` = new_ref.`id` THEN 1 ELSE rel_ref.`is_primary` END,
       rel_ref.`relation_type`, rel_ref.`sort_order`, rel_ref.`source_provider`, rel_ref.`source_page`, rel_ref.`source_revision_timestamp`, 1, 0
FROM `item_category_rel` rel_ref
JOIN `items` item_ref ON item_ref.`id` = rel_ref.`item_id` AND item_ref.`deleted` = 0
JOIN `category` old_ref ON old_ref.`id` = rel_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_PICKAXE' AND new_ref.`deleted` = 0
WHERE old_ref.`code` = 'TOOL_PICKAXE_DRILL'
  AND rel_ref.`deleted` = 0
  AND LOWER(COALESCE(item_ref.`name`, '')) NOT LIKE '%drill%'
  AND LOWER(COALESCE(item_ref.`internal_name`, '')) NOT LIKE '%drill%'
  AND COALESCE(item_ref.`name_zh`, '') NOT LIKE '%钻头%'
  AND COALESCE(item_ref.`name_zh`, '') NOT LIKE '%电钻%'
ON DUPLICATE KEY UPDATE
  `is_primary` = VALUES(`is_primary`),
  `relation_type` = VALUES(`relation_type`),
  `sort_order` = VALUES(`sort_order`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `item_category_rel` (
  `item_id`, `category_id`, `is_primary`, `relation_type`, `sort_order`, `source_provider`, `source_page`, `source_revision_timestamp`, `status`, `deleted`
)
SELECT item_ref.`id`, new_ref.`id`, CASE WHEN item_ref.`category_id` = new_ref.`id` THEN 1 ELSE rel_ref.`is_primary` END,
       rel_ref.`relation_type`, rel_ref.`sort_order`, rel_ref.`source_provider`, rel_ref.`source_page`, rel_ref.`source_revision_timestamp`, 1, 0
FROM `item_category_rel` rel_ref
JOIN `items` item_ref ON item_ref.`id` = rel_ref.`item_id` AND item_ref.`deleted` = 0
JOIN `category` old_ref ON old_ref.`id` = rel_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_CHAINSAW' AND new_ref.`deleted` = 0
WHERE old_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND rel_ref.`deleted` = 0
  AND (
    LOWER(COALESCE(item_ref.`name`, '')) LIKE '%chainsaw%'
    OR LOWER(COALESCE(item_ref.`internal_name`, '')) LIKE '%chainsaw%'
    OR COALESCE(item_ref.`name_zh`, '') LIKE '%链锯%'
  )
ON DUPLICATE KEY UPDATE
  `is_primary` = VALUES(`is_primary`),
  `relation_type` = VALUES(`relation_type`),
  `sort_order` = VALUES(`sort_order`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

INSERT INTO `item_category_rel` (
  `item_id`, `category_id`, `is_primary`, `relation_type`, `sort_order`, `source_provider`, `source_page`, `source_revision_timestamp`, `status`, `deleted`
)
SELECT item_ref.`id`, new_ref.`id`, CASE WHEN item_ref.`category_id` = new_ref.`id` THEN 1 ELSE rel_ref.`is_primary` END,
       rel_ref.`relation_type`, rel_ref.`sort_order`, rel_ref.`source_provider`, rel_ref.`source_page`, rel_ref.`source_revision_timestamp`, 1, 0
FROM `item_category_rel` rel_ref
JOIN `items` item_ref ON item_ref.`id` = rel_ref.`item_id` AND item_ref.`deleted` = 0
JOIN `category` old_ref ON old_ref.`id` = rel_ref.`category_id`
JOIN `category` new_ref ON new_ref.`code` = 'TOOL_AXE' AND new_ref.`deleted` = 0
WHERE old_ref.`code` = 'TOOL_AXE_CHAINSAW'
  AND rel_ref.`deleted` = 0
  AND LOWER(COALESCE(item_ref.`name`, '')) NOT LIKE '%chainsaw%'
  AND LOWER(COALESCE(item_ref.`internal_name`, '')) NOT LIKE '%chainsaw%'
  AND COALESCE(item_ref.`name_zh`, '') NOT LIKE '%链锯%'
ON DUPLICATE KEY UPDATE
  `is_primary` = VALUES(`is_primary`),
  `relation_type` = VALUES(`relation_type`),
  `sort_order` = VALUES(`sort_order`),
  `status` = 1,
  `deleted` = 0,
  `updated_at` = NOW();

UPDATE `item_category_rel` rel_ref
JOIN `category` old_ref ON old_ref.`id` = rel_ref.`category_id`
SET rel_ref.`is_primary` = 0,
    rel_ref.`status` = 1,
    rel_ref.`deleted` = 0,
    rel_ref.`updated_at` = NOW()
WHERE old_ref.`code` IN ('TOOL_PICKAXE_DRILL', 'TOOL_AXE_CHAINSAW');
