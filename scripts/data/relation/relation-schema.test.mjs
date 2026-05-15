import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RELATION_DATABASE_NAME,
  RELATION_TABLE_NAMES,
  buildRelationSchemaSql,
  buildRelationSchemaStatements
} from './relation-schema.mjs';

const EXPECTED_TABLE_NAMES = [
  'relation_runs',
  'relation_run_reports',
  'relation_items',
  'relation_npcs',
  'relation_projectiles',
  'relation_buffs',
  'relation_bosses',
  'relation_armor_sets',
  'relation_armor_set_items',
  'relation_item_rarities',
  'relation_item_images',
  'relation_npc_images',
  'relation_projectile_images',
  'relation_buff_images',
  'relation_armor_set_images',
  'category_nodes',
  'item_category_assignments',
  'item_recipe_heads',
  'item_recipe_ingredients',
  'item_recipe_stations',
  'item_recipe_group_expansions',
  'item_source_facts',
  'item_source_details',
  'item_npc_shop_relations',
  'item_npc_loot_relations',
  'item_npc_relation_audits',
  'item_buff_relations',
  'npc_buff_relations',
  'item_biome_relations',
  'item_projectile_relations',
  'npc_projectile_relations',
  'item_projectile_audits',
  'npc_projectile_audits',
  'boss_item_reward_relations',
  'boss_effect_relations',
  'npc_series_nodes',
  'npc_series_memberships',
  'npc_series_item_relations'
];

function extractTableDdl(sql, tableName) {
  const match = sql.match(
    new RegExp(
      `CREATE TABLE IF NOT EXISTS \\\`${RELATION_DATABASE_NAME}\\\`\\.\\\`${tableName}\\\` \\([\\s\\S]*?\\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    )
  );
  assert.ok(match, `missing DDL for ${tableName}`);
  return match[0];
}

test('RELATION_DATABASE_NAME is terria_v1_relation', () => {
  assert.equal(RELATION_DATABASE_NAME, 'terria_v1_relation');
});

test('RELATION_TABLE_NAMES matches expected ordered list', () => {
  assert.deepEqual(RELATION_TABLE_NAMES, EXPECTED_TABLE_NAMES);
});

test('buildRelationSchemaStatements returns split statements in stable order', () => {
  const statements = buildRelationSchemaStatements();
  assert.equal(statements.length, EXPECTED_TABLE_NAMES.length + 1);
  assert.match(
    statements[0],
    /^CREATE DATABASE IF NOT EXISTS `terria_v1_relation` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;$/i
  );
  for (const statement of statements) {
    assert.doesNotMatch(statement, /^USE\s+/i);
  }
  for (let index = 0; index < EXPECTED_TABLE_NAMES.length; index += 1) {
    const tableName = EXPECTED_TABLE_NAMES[index];
    assert.match(
      statements[index + 1],
      new RegExp(`^CREATE TABLE IF NOT EXISTS \\\`${RELATION_DATABASE_NAME}\\\`\\.\\\`${tableName}\\\` `)
    );
  }
});

test('buildRelationSchemaSql joins the statement list', () => {
  const sql = buildRelationSchemaSql();
  const statements = buildRelationSchemaStatements();
  assert.equal(sql, `${statements.join('\n\n')}\n`);
});

test('table-scoped relation run metadata columns are correct', () => {
  const sql = buildRelationSchemaSql();
  const runs = extractTableDdl(sql, 'relation_runs');
  const reports = extractTableDdl(sql, 'relation_run_reports');
  const relationItems = extractTableDdl(sql, 'relation_items');
  const relationNpcs = extractTableDdl(sql, 'relation_npcs');
  const relationProjectiles = extractTableDdl(sql, 'relation_projectiles');
  const relationBuffs = extractTableDdl(sql, 'relation_buffs');
  const relationBosses = extractTableDdl(sql, 'relation_bosses');
  const relationArmorSets = extractTableDdl(sql, 'relation_armor_sets');
  const relationArmorSetItems = extractTableDdl(sql, 'relation_armor_set_items');
  const relationItemRarities = extractTableDdl(sql, 'relation_item_rarities');
  const relationItemImages = extractTableDdl(sql, 'relation_item_images');
  const relationNpcImages = extractTableDdl(sql, 'relation_npc_images');
  const relationProjectileImages = extractTableDdl(sql, 'relation_projectile_images');
  const relationBuffImages = extractTableDdl(sql, 'relation_buff_images');
  const relationArmorSetImages = extractTableDdl(sql, 'relation_armor_set_images');

  assert.match(runs, /`run_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(runs, /`apply_mode` TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(runs, /`scopes_json` LONGTEXT NOT NULL/);
  assert.match(runs, /`summary_json` LONGTEXT/);
  assert.match(runs, /UNIQUE KEY `uk_relation_runs_run_key` \(`run_key`\)/);

  assert.match(reports, /`run_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(reports, /`report_kind` VARCHAR\(64\) NOT NULL/);
  assert.match(reports, /`report_path` VARCHAR\(1000\) NOT NULL/);
  assert.match(reports, /`report_format` VARCHAR\(32\) NOT NULL/);
  assert.match(
    reports,
    /CONSTRAINT `fk_relation_run_reports_run_key`\s+FOREIGN KEY \(`run_key`\) REFERENCES `terria_v1_relation`\.`relation_runs` \(`run_key`\)/
  );

  assert.match(relationItems, /`source_id` INT DEFAULT NULL/);
  assert.match(relationItems, /`internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationItems, /`module_generated_at` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationItems, /`rare_raw` INT DEFAULT NULL/);
  assert.match(relationItems, /`value_raw` INT DEFAULT NULL/);
  assert.match(relationItems, /`sell_raw` INT DEFAULT NULL/);
  assert.match(relationItems, /`sell_text_raw` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationItems, /UNIQUE KEY `uk_relation_items_record_key` \(`record_key`\)/);

  assert.match(relationNpcs, /`source_id` INT DEFAULT NULL/);
  assert.match(relationNpcs, /`sub_name_zh` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationNpcs, /`flags_json` LONGTEXT/);
  assert.match(relationNpcs, /UNIQUE KEY `uk_relation_npcs_record_key` \(`record_key`\)/);

  assert.match(relationProjectiles, /`source_id` INT DEFAULT NULL/);
  assert.match(relationProjectiles, /`flags_json` LONGTEXT/);
  assert.match(relationProjectiles, /UNIQUE KEY `uk_relation_projectiles_record_key` \(`record_key`\)/);

  assert.match(relationBuffs, /`source_id` INT DEFAULT NULL/);
  assert.match(relationBuffs, /`buff_type` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationBuffs, /`tooltip_en` VARCHAR\(1000\) DEFAULT NULL/);
  assert.match(relationBuffs, /`immune_npcs_json` LONGTEXT/);
  assert.match(relationBuffs, /UNIQUE KEY `uk_relation_buffs_record_key` \(`record_key`\)/);

  assert.match(relationBosses, /`boss_title_en` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationBosses, /`group_type` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationBosses, /`npc_match_status` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationBosses, /UNIQUE KEY `uk_relation_bosses_record_key` \(`record_key`\)/);

  assert.match(relationArmorSets, /`text_key` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationArmorSets, /`sets_json` LONGTEXT/);
  assert.match(relationArmorSets, /`unique_item_ids_json` LONGTEXT/);
  assert.match(relationArmorSets, /UNIQUE KEY `uk_relation_armor_sets_record_key` \(`record_key`\)/);

  assert.match(relationArmorSetItems, /`armor_set_record_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(relationArmorSetItems, /`item_source_id` INT DEFAULT NULL/);
  assert.match(relationArmorSetItems, /`part_role` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationArmorSetItems, /`equipment_slot_id` INT DEFAULT NULL/);
  assert.match(relationArmorSetItems, /KEY `idx_relation_armor_set_items_set` \(`armor_set_record_key`\)/);

  assert.match(relationItemRarities, /`code` VARCHAR\(32\) NOT NULL/);
  assert.match(relationItemRarities, /`display_name_zh` VARCHAR\(64\) NOT NULL/);
  assert.match(relationItemRarities, /UNIQUE KEY `uk_relation_item_rarities_record_key` \(`record_key`\)/);

  assert.match(relationItemImages, /`item_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationItemImages, /`role` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationItemImages, /`original_url` VARCHAR\(1000\) DEFAULT NULL/);
  assert.match(relationItemImages, /`is_primary` TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(relationItemImages, /UNIQUE KEY `uk_relation_item_images_record_key` \(`record_key`\)/);

  assert.match(relationNpcImages, /`npc_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationNpcImages, /`source_file_title` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationNpcImages, /UNIQUE KEY `uk_relation_npc_images_record_key` \(`record_key`\)/);

  assert.match(relationProjectileImages, /`projectile_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationProjectileImages, /`cached_url` VARCHAR\(1000\) DEFAULT NULL/);
  assert.match(
    relationProjectileImages,
    /UNIQUE KEY `uk_relation_projectile_images_record_key` \(`record_key`\)/
  );

  assert.match(relationBuffImages, /`buff_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(relationBuffImages, /`content_type` VARCHAR\(128\) DEFAULT NULL/);
  assert.match(relationBuffImages, /UNIQUE KEY `uk_relation_buff_images_record_key` \(`record_key`\)/);

  assert.match(relationArmorSetImages, /`armor_set_record_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(relationArmorSetImages, /`image_role` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(relationArmorSetImages, /`original_url` VARCHAR\(1000\) DEFAULT NULL/);
  assert.match(relationArmorSetImages, /UNIQUE KEY `uk_relation_armor_set_images_record_key` \(`record_key`\)/);
});

test('table-scoped trace and audit columns include required types/defaults', () => {
  const sql = buildRelationSchemaSql();
  const assignmentTable = extractTableDdl(sql, 'item_category_assignments');
  assert.match(assignmentTable, /`source_maint_table` VARCHAR\(128\) DEFAULT NULL/);
  assert.match(
    assignmentTable,
    /`source_maint_record_key` CHAR\(64\) COLLATE utf8mb4_bin DEFAULT NULL/
  );
  assert.match(assignmentTable, /`landing_source_id` BIGINT DEFAULT NULL/);
  assert.match(
    assignmentTable,
    /`landing_content_hash` CHAR\(64\) COLLATE utf8mb4_bin DEFAULT NULL/
  );
  assert.match(assignmentTable, /`confidence` DECIMAL\(5,4\) NOT NULL DEFAULT 1\.0000/);
  assert.match(assignmentTable, /`review_status` VARCHAR\(64\) NOT NULL DEFAULT 'accepted'/);
  assert.match(assignmentTable, /`raw_json` LONGTEXT/);
  assert.match(assignmentTable, /`status` INT NOT NULL DEFAULT 1/);
  assert.match(assignmentTable, /`deleted` TINYINT NOT NULL DEFAULT 0/);
});

test('table-scoped domain columns and lookup indexes are present', () => {
  const sql = buildRelationSchemaSql();
  const recipeHeads = extractTableDdl(sql, 'item_recipe_heads');
  const categoryNodes = extractTableDdl(sql, 'category_nodes');
  const ingredients = extractTableDdl(sql, 'item_recipe_ingredients');
  const stations = extractTableDdl(sql, 'item_recipe_stations');
  const groupExpansions = extractTableDdl(sql, 'item_recipe_group_expansions');
  const sourceDetails = extractTableDdl(sql, 'item_source_details');
  const shopRelations = extractTableDdl(sql, 'item_npc_shop_relations');
  const lootRelations = extractTableDdl(sql, 'item_npc_loot_relations');
  const relationAudits = extractTableDdl(sql, 'item_npc_relation_audits');
  const relationBuffs = extractTableDdl(sql, 'relation_buffs');
  const npcBuffRelations = extractTableDdl(sql, 'npc_buff_relations');
  const itemProjectileRelations = extractTableDdl(sql, 'item_projectile_relations');
  const npcProjectileRelations = extractTableDdl(sql, 'npc_projectile_relations');
  const npcProjectileAudits = extractTableDdl(sql, 'npc_projectile_audits');
  const bossRewards = extractTableDdl(sql, 'boss_item_reward_relations');
  const bossEffects = extractTableDdl(sql, 'boss_effect_relations');
  const npcSeriesNodes = extractTableDdl(sql, 'npc_series_nodes');
  const npcSeriesMemberships = extractTableDdl(sql, 'npc_series_memberships');
  const npcSeriesItems = extractTableDdl(sql, 'npc_series_item_relations');

  assert.match(recipeHeads, /UNIQUE KEY `uk_item_recipe_heads_recipe_key` \(`recipe_key`\)/);
  assert.match(categoryNodes, /UNIQUE KEY `uk_category_nodes_node_key` \(`node_key`\)/);

  assert.match(ingredients, /`recipe_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(ingredients, /KEY `idx_item_recipe_ingredients_recipe_key` \(`recipe_key`\)/);
  assert.match(
    ingredients,
    /CONSTRAINT `fk_item_recipe_ingredients_recipe_key`\s+FOREIGN KEY \(`recipe_key`\) REFERENCES `terria_v1_relation`\.`item_recipe_heads` \(`recipe_key`\)/
  );
  assert.match(stations, /`recipe_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(stations, /KEY `idx_item_recipe_stations_recipe_key` \(`recipe_key`\)/);
  assert.match(
    stations,
    /CONSTRAINT `fk_item_recipe_stations_recipe_key`\s+FOREIGN KEY \(`recipe_key`\) REFERENCES `terria_v1_relation`\.`item_recipe_heads` \(`recipe_key`\)/
  );
  assert.match(groupExpansions, /`ingredient_record_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(groupExpansions, /`group_name` VARCHAR\(255\) NOT NULL/);
  assert.match(groupExpansions, /`member_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(
    groupExpansions,
    /CONSTRAINT `fk_item_recipe_group_expansions_recipe_key`\s+FOREIGN KEY \(`recipe_key`\) REFERENCES `terria_v1_relation`\.`item_recipe_heads` \(`recipe_key`\)/
  );

  assert.match(sourceDetails, /`source_fact_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(relationBuffs, /`inflicting_npcs_json` LONGTEXT/);
  assert.match(npcBuffRelations, /`relation_type` VARCHAR\(32\) NOT NULL DEFAULT 'inflicts'/);
  assert.match(npcBuffRelations, /UNIQUE KEY `uk_npc_buff_relations_record_key` \(`record_key`\)/);
  assert.match(
    sourceDetails,
    /KEY `idx_item_source_details_source_fact_key` \(`source_fact_key`\)/
  );
  assert.match(
    sourceDetails,
    /CONSTRAINT `fk_item_source_details_source_fact_key`\s+FOREIGN KEY \(`source_fact_key`\) REFERENCES `terria_v1_relation`\.`item_source_facts` \(`record_key`\)/
  );
  assert.match(shopRelations, /`source_fact_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(shopRelations, /`item_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(shopRelations, /`condition_parse_status` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(shopRelations, /`condition_events_json` LONGTEXT/);
  assert.match(
    shopRelations,
    /KEY `idx_item_npc_shop_relations_source_fact_key` \(`source_fact_key`\)/
  );
  assert.match(
    shopRelations,
    /CONSTRAINT `fk_item_npc_shop_relations_source_fact_key`\s+FOREIGN KEY \(`source_fact_key`\) REFERENCES `terria_v1_relation`\.`item_source_facts` \(`record_key`\)/
  );
  assert.match(lootRelations, /`source_fact_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(lootRelations, /`item_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(lootRelations, /`condition_time_code` VARCHAR\(64\) DEFAULT NULL/);
  assert.match(lootRelations, /`special_flags_json` LONGTEXT/);
  assert.match(
    lootRelations,
    /KEY `idx_item_npc_loot_relations_source_fact_key` \(`source_fact_key`\)/
  );
  assert.match(
    lootRelations,
    /CONSTRAINT `fk_item_npc_loot_relations_source_fact_key`\s+FOREIGN KEY \(`source_fact_key`\) REFERENCES `terria_v1_relation`\.`item_source_facts` \(`record_key`\)/
  );
  assert.match(relationAudits, /`audit_key` VARCHAR\(255\) NOT NULL/);
  assert.match(relationAudits, /`relation_kind` VARCHAR\(32\) NOT NULL/);
  assert.match(relationAudits, /`source_fact_key` VARCHAR\(255\)/);
  assert.match(relationAudits, /`item_internal_name` VARCHAR\(255\)/);
  assert.match(relationAudits, /`item_name` VARCHAR\(255\)/);
  assert.match(relationAudits, /`source_ref_name` VARCHAR\(255\)/);
  assert.match(relationAudits, /`source_ref_normalized` VARCHAR\(255\)/);
  assert.match(relationAudits, /`candidate_npc_internal_name` VARCHAR\(255\)/);
  assert.match(relationAudits, /`audit_status` VARCHAR\(32\) NOT NULL/);
  assert.match(relationAudits, /`reason_code` VARCHAR\(64\) NOT NULL/);
  assert.match(relationAudits, /`evidence_json` LONGTEXT/);
  assert.match(relationAudits, /PRIMARY KEY \(`audit_key`\)/);
  assert.match(itemProjectileRelations, /`item_source_id` INT DEFAULT NULL/);
  assert.match(itemProjectileRelations, /`item_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(itemProjectileRelations, /`projectile_source_id` INT DEFAULT NULL/);
  assert.match(itemProjectileRelations, /`projectile_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(itemProjectileRelations, /`relation_type` VARCHAR\(64\) NOT NULL/);
  assert.match(itemProjectileRelations, /`source_field` VARCHAR\(64\) NOT NULL/);
  assert.match(itemProjectileRelations, /`source_value` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(itemProjectileRelations, /KEY `idx_item_projectile_relations_projectile` \(`projectile_source_id`, `projectile_internal_name`\)/);
  assert.match(npcProjectileRelations, /`npc_source_id` INT DEFAULT NULL/);
  assert.match(npcProjectileRelations, /`npc_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(npcProjectileRelations, /`projectile_source_id` INT DEFAULT NULL/);
  assert.match(npcProjectileRelations, /`projectile_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(npcProjectileRelations, /`relation_type` VARCHAR\(64\) NOT NULL/);
  assert.match(npcProjectileRelations, /`source_field` VARCHAR\(64\) NOT NULL/);
  assert.match(npcProjectileRelations, /KEY `idx_npc_projectile_relations_projectile` \(`projectile_source_id`, `projectile_internal_name`\)/);
  assert.match(npcProjectileAudits, /`npc_source_id` INT DEFAULT NULL/);
  assert.match(npcProjectileAudits, /`npc_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(npcProjectileAudits, /`projectile_source_id` INT DEFAULT NULL/);
  assert.match(npcProjectileAudits, /`projectile_internal_name` VARCHAR\(255\) DEFAULT NULL/);
  assert.match(npcProjectileAudits, /`audit_status` VARCHAR\(64\) NOT NULL/);
  assert.match(npcProjectileAudits, /`available_fields_json` LONGTEXT/);
  assert.match(bossRewards, /`boss_record_key` CHAR\(64\) COLLATE utf8mb4_bin NOT NULL/);
  assert.match(bossRewards, /`reward_source_fact_keys_json` LONGTEXT/);
  assert.match(bossRewards, /KEY `idx_boss_item_reward_relations_boss_record_key` \(`boss_record_key`\)/);
  assert.match(bossEffects, /`effect_type` VARCHAR\(64\) NOT NULL/);
  assert.match(bossEffects, /`target_type` VARCHAR\(64\) NOT NULL/);
  assert.match(bossEffects, /KEY `idx_boss_effect_relations_boss_record_key` \(`boss_record_key`\)/);
  assert.match(npcSeriesNodes, /`series_key` VARCHAR\(255\) NOT NULL/);
  assert.match(npcSeriesNodes, /UNIQUE KEY `uk_npc_series_nodes_series_key` \(`series_key`\)/);
  assert.match(npcSeriesMemberships, /`series_key` VARCHAR\(255\) NOT NULL/);
  assert.match(npcSeriesMemberships, /`npc_internal_name` VARCHAR\(255\) NOT NULL/);
  assert.match(npcSeriesItems, /`relation_type` VARCHAR\(64\) NOT NULL/);
  assert.match(npcSeriesItems, /`item_internal_name` VARCHAR\(255\) NOT NULL/);
});

test('text/blob family columns do not emit DEFAULT NULL and all tables pin collation', () => {
  const sql = buildRelationSchemaSql();
  assert.doesNotMatch(sql, /`[^`]+` (?:TEXT|LONGTEXT) DEFAULT NULL/);
  for (const tableName of EXPECTED_TABLE_NAMES) {
    const ddl = extractTableDdl(sql, tableName);
    assert.match(ddl, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;/);
  }
  assert.doesNotMatch(sql, /item_npc_shop_candidates/);
  assert.doesNotMatch(sql, /item_npc_loot_candidates/);
});

test('statement-oriented API is safe per statement without session-scoped USE', () => {
  const statements = buildRelationSchemaStatements();
  for (const statement of statements) {
    assert.doesNotMatch(statement, /^\s*USE\s+/i);
  }
  for (const tableName of EXPECTED_TABLE_NAMES) {
    const statement = statements.find((item) =>
      new RegExp(
        `^CREATE TABLE IF NOT EXISTS \\\`${RELATION_DATABASE_NAME}\\\`\\.\\\`${tableName}\\\` `
      ).test(item)
    );
    assert.ok(statement, `missing schema-qualified table statement for ${tableName}`);
  }
});

test('record key unique indexes exist on all relation result tables', () => {
  const sql = buildRelationSchemaSql();
  const tablesWithRecordKeyUnique = [
    'relation_buffs',
    'relation_armor_sets',
    'relation_armor_set_items',
    'relation_item_rarities',
    'relation_item_images',
    'relation_npc_images',
    'relation_projectile_images',
    'relation_buff_images',
    'relation_armor_set_images',
    'category_nodes',
    'item_category_assignments',
    'item_recipe_heads',
    'item_recipe_ingredients',
    'item_recipe_stations',
    'item_recipe_group_expansions',
    'item_source_facts',
    'item_source_details',
    'item_npc_shop_relations',
    'item_npc_loot_relations',
    'item_buff_relations',
    'item_biome_relations',
    'item_projectile_relations',
    'npc_projectile_relations',
    'item_projectile_audits',
    'npc_projectile_audits'
  ];

  for (const tableName of tablesWithRecordKeyUnique) {
    const ddl = extractTableDdl(sql, tableName);
    assert.match(
      ddl,
      new RegExp(`UNIQUE KEY \\\`uk_${tableName}_record_key\\\` \\(\\\`record_key\\\`\\)`),
      `missing record_key unique index in ${tableName}`
    );
  }

  assert.doesNotMatch(sql, /item_npc_shop_candidates/);
  assert.doesNotMatch(sql, /item_npc_loot_candidates/);
});
