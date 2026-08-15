CREATE TABLE IF NOT EXISTS `condition_terms` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `name_en` VARCHAR(255) NOT NULL,
  `name_zh` VARCHAR(255) DEFAULT NULL,
  `term_type` VARCHAR(64) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `source_provider` VARCHAR(64) DEFAULT NULL,
  `source_page` VARCHAR(255) DEFAULT NULL,
  `raw_json` LONGTEXT DEFAULT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_condition_terms_code` (`code`),
  INDEX `idx_condition_terms_type` (`term_type`),
  INDEX `idx_condition_terms_source` (`source_provider`, `source_page`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `condition_terms`
  (code, name_en, name_zh, term_type, description, source_provider, source_page, raw_json, sort_order, status, deleted)
SELECT
  wc.code,
  wc.name_en,
  wc.name_zh,
  CASE
    WHEN wc.code IN ('MOON_PHASE_1_4', 'MOON_PHASE_LISTED') THEN 'MOON_PHASE_RANGE'
    WHEN wc.code IN ('MARTIAN_MADNESS_COMPLETED', 'PIRATE_INVASION_COMPLETED', 'SNOW_LEGION_COMPLETED') THEN 'EVENT_COMPLETED'
    WHEN wc.code IN ('ANY_MECH_BOSS_DEFEATED', 'ALL_MECH_BOSSES_DEFEATED') THEN 'BOSS_PROGRESS'
    ELSE 'GAME_PROGRESS'
  END AS term_type,
  wc.description,
  COALESCE(wc.source_provider, 'terrapedia_local'),
  COALESCE(wc.source_page, 'town_npc_shop_conditions'),
  COALESCE(wc.raw_json, JSON_OBJECT('classification', 'local_condition_term', 'sourcePage', COALESCE(wc.source_page, 'town_npc_shop_conditions'))),
  wc.sort_order,
  wc.status,
  0
FROM `world_contexts` wc
WHERE wc.deleted = 0
  AND wc.code IN (
    'MOON_PHASE_1_4',
    'MOON_PHASE_LISTED',
    'MARTIAN_MADNESS_COMPLETED',
    'PIRATE_INVASION_COMPLETED',
    'SNOW_LEGION_COMPLETED',
    'ANY_MECH_BOSS_DEFEATED',
    'ALL_MECH_BOSSES_DEFEATED'
  )
ON DUPLICATE KEY UPDATE
  name_en = VALUES(name_en),
  name_zh = VALUES(name_zh),
  term_type = VALUES(term_type),
  description = VALUES(description),
  source_provider = VALUES(source_provider),
  source_page = VALUES(source_page),
  raw_json = VALUES(raw_json),
  sort_order = VALUES(sort_order),
  status = VALUES(status),
  deleted = 0,
  updated_at = NOW();

UPDATE `npc_shop_conditions` nsc
JOIN `world_contexts` wc ON nsc.ref_type = 'WORLD_CONTEXT' AND nsc.ref_id = wc.id
JOIN `condition_terms` ct ON ct.code = wc.code AND ct.deleted = 0
SET nsc.ref_type = 'CONDITION_TERM',
    nsc.ref_id = ct.id
WHERE wc.code IN (
  'MOON_PHASE_1_4',
  'MOON_PHASE_LISTED',
  'MARTIAN_MADNESS_COMPLETED',
  'PIRATE_INVASION_COMPLETED',
  'SNOW_LEGION_COMPLETED',
  'ANY_MECH_BOSS_DEFEATED',
  'ALL_MECH_BOSSES_DEFEATED'
);
UPDATE `recipe_context_requirements` rcr
JOIN `world_contexts` wc ON rcr.ref_type = 'WORLD_CONTEXT' AND rcr.ref_id = wc.id
JOIN `condition_terms` ct ON ct.code = wc.code AND ct.deleted = 0
SET rcr.ref_type = 'CONDITION_TERM',
    rcr.ref_id = ct.id
WHERE wc.code IN (
  'MOON_PHASE_1_4',
  'MOON_PHASE_LISTED',
  'MARTIAN_MADNESS_COMPLETED',
  'PIRATE_INVASION_COMPLETED',
  'SNOW_LEGION_COMPLETED',
  'ANY_MECH_BOSS_DEFEATED',
  'ALL_MECH_BOSSES_DEFEATED'
);

UPDATE `world_contexts`
SET deleted = 1,
    status = 0,
    updated_at = NOW()
WHERE code IN (
  'MOON_PHASE_1_4',
  'MOON_PHASE_LISTED',
  'MARTIAN_MADNESS_COMPLETED',
  'PIRATE_INVASION_COMPLETED',
  'SNOW_LEGION_COMPLETED',
  'ANY_MECH_BOSS_DEFEATED',
  'ALL_MECH_BOSSES_DEFEATED'
);
