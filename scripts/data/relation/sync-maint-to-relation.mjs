#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { buildRelationSchemaStatements } from './relation-schema.mjs';
import { createRecordKey } from './relation-trace.mjs';
import { buildBaseEntityRelations } from './base-entity-processor.mjs';
import { buildBuffEntityRelations } from './buff-entity-processor.mjs';
import { buildImageRelations } from './image-processor.mjs';
import { buildCategoryRelations } from './category-relation-processor.mjs';
import { buildRecipeRelations } from './recipe-relation-processor.mjs';
import { buildRecipeGroupExpansions } from './recipe-expansion-processor.mjs';
import { buildItemSourceRelations } from './item-source-relation-processor.mjs';
import { buildSecondaryRelations } from './secondary-relation-processor.mjs';
import { buildBossSeriesRelations } from './boss-series-processor.mjs';
import { buildNpcSeriesRelations } from './npc-series-processor.mjs';
import { buildProjectionSchemaStatements } from './projection-schema.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { writeRelationReports } from './relation-report.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    apply: booleanOption(raw.apply, false),
    createDatabase: booleanOption(raw['create-database'] ?? raw.createDatabase, false),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_maint',
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? null,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    scopes: String(raw.scopes ?? 'category,recipe,npc,buff,biome,projectile')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

function toDateTag(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function camelToSnake(name) {
  return String(name).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelToSnake(key)] = value;
  }
  return mapped;
}

async function queryRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return rows;
}

async function loadDataset(mysqlOptions, database, sql) {
  const connection = await mysql.createConnection({ ...mysqlOptions, database });
  try {
    return await queryRows(connection, sql);
  } finally {
    await connection.end();
  }
}

function buildNpcIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const candidates = [
      row.name,
      row.english_name,
      row.internal_name
    ].filter(Boolean);
    for (const candidate of candidates) {
      index.set(candidate, row);
    }
  }
  return index;
}

function buildItemIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (row.internal_name) index.set(row.internal_name, row);
  }
  return index;
}

async function upsertRows(connection, tableName, rows) {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    const sql = `
INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')})
VALUES (${placeholders})
ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}
`.trim();
    await connection.execute(sql, columns.map((column) => mapped[column]));
    total += 1;
  }
  return total;
}

async function clearRelationSnapshotTables(connection, tableNames) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const tableName of tableNames) {
      await connection.query(`DELETE FROM \`${tableName}\``);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function getTableColumns(connection, databaseName, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    [databaseName, tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function ensureRelationMigrations(connection, databaseName) {
  const migrations = [
    {
      tableName: 'item_npc_shop_relations',
      columns: [
        ['condition_source_text', 'TEXT AFTER `conditions`'],
        ['condition_parse_status', 'VARCHAR(64) DEFAULT NULL AFTER `condition_source_text`'],
        ['condition_biome_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_parse_status`'],
        ['condition_game_period_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_biome_code`'],
        ['condition_time_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_game_period_code`'],
        ['condition_weather_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_time_code`'],
        ['condition_events_json', 'LONGTEXT AFTER `condition_weather_code`'],
        ['special_flags_json', 'LONGTEXT AFTER `condition_events_json`']
      ]
    },
    {
      tableName: 'item_npc_loot_relations',
      columns: [
        ['condition_source_text', 'TEXT AFTER `conditions`'],
        ['condition_parse_status', 'VARCHAR(64) DEFAULT NULL AFTER `condition_source_text`'],
        ['condition_biome_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_parse_status`'],
        ['condition_game_period_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_biome_code`'],
        ['condition_time_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_game_period_code`'],
        ['condition_weather_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_time_code`'],
        ['condition_events_json', 'LONGTEXT AFTER `condition_weather_code`'],
        ['special_flags_json', 'LONGTEXT AFTER `condition_events_json`']
      ]
    }
  ];

  for (const migration of migrations) {
    const existingColumns = await getTableColumns(connection, databaseName, migration.tableName);
    for (const [columnName, definition] of migration.columns) {
      if (existingColumns.has(columnName)) {
        continue;
      }
      await connection.query(
        `ALTER TABLE \`${databaseName}\`.\`${migration.tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
      );
      existingColumns.add(columnName);
    }
  }
}

async function insertRun(connection, run) {
  const sql = `
INSERT INTO \`relation_runs\`
  (\`run_key\`, \`apply_mode\`, \`maint_database\`, \`local_database\`, \`relation_database\`, \`scopes_json\`, \`summary_json\`, \`started_at\`, \`finished_at\`, \`status\`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  \`apply_mode\` = VALUES(\`apply_mode\`),
  \`maint_database\` = VALUES(\`maint_database\`),
  \`local_database\` = VALUES(\`local_database\`),
  \`relation_database\` = VALUES(\`relation_database\`),
  \`scopes_json\` = VALUES(\`scopes_json\`),
  \`summary_json\` = VALUES(\`summary_json\`),
  \`started_at\` = VALUES(\`started_at\`),
  \`finished_at\` = VALUES(\`finished_at\`),
  \`status\` = VALUES(\`status\`)
`.trim();

  await connection.execute(sql, [
    run.runKey,
    run.applyMode,
    run.maintDatabase,
    run.localDatabase,
    run.relationDatabase,
    JSON.stringify(run.scopes),
    run.summaryJson == null ? null : JSON.stringify(run.summaryJson),
    run.startedAt,
    run.finishedAt,
    run.status
  ]);
}

async function insertReportRows(connection, runKey, reportPaths) {
  const rows = [
    ['audit_json', reportPaths.auditJsonPath, 'json'],
    ['audit_md', reportPaths.auditMdPath, 'md'],
    ['conflicts_json', reportPaths.conflictsPath, 'json'],
    ['unresolved_json', reportPaths.unresolvedPath, 'json']
  ];

  for (const [kind, reportPath, format] of rows) {
    await connection.execute(
      `
      INSERT INTO \`relation_run_reports\`
        (\`run_key\`, \`report_kind\`, \`report_path\`, \`report_format\`)
      VALUES (?, ?, ?, ?)
      `.trim(),
      [runKey, kind, reportPath, format]
    );
  }
}

function flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries) {
  return {
    relationItems: [],
    relationNpcs: [],
    relationProjectiles: [],
    relationBuffs: [],
    relationBosses: [],
    relationItemImages: [],
    relationNpcImages: [],
    relationProjectileImages: [],
    relationBuffImages: [],
    categoryNodes: category.categoryNodes,
    itemCategoryAssignments: category.itemCategoryAssignments,
    itemRecipeHeads: recipe.recipeHeads,
    itemRecipeIngredients: recipe.recipeIngredients,
    itemRecipeStations: recipe.recipeStations,
    itemRecipeGroupExpansions: [],
    itemSourceFacts: itemSource.sourceFacts,
    itemSourceDetails: itemSource.sourceDetails,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations,
    itemNpcShopCandidates: itemSource.npcShopCandidates,
    itemNpcLootCandidates: itemSource.npcLootCandidates,
    itemBuffRelations: secondary.itemBuffRelations,
    itemBiomeRelations: secondary.itemBiomeRelations,
    itemProjectileAudits: secondary.itemProjectileAudits,
    bossItemRewardRelations: bossSeries.bossItemRewardRelations,
    bossEffectRelations: bossSeries.bossEffectRelations,
    npcSeriesNodes: npcSeries.npcSeriesNodes,
    npcSeriesMemberships: npcSeries.npcSeriesMemberships,
    npcSeriesItemRelations: npcSeries.npcSeriesItemRelations,
    projectionItems: [],
    projectionNpcs: [],
    projectionProjectiles: [],
    projectionBuffs: [],
    issues: [
      ...category.issues,
      ...recipe.issues,
      ...itemSource.issues,
      ...bossSeries.issues,
      ...npcSeries.issues
    ]
  };
}

export async function runSync(options, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };

  const queryMaint = dependencies.queryMaint ?? ((sql) => loadDataset(mysqlOptions, options.maintDatabase, sql));
  const writeReports = dependencies.writeReports ?? ((payload) => writeRelationReports(payload));
  const executeRelation = dependencies.executeRelation ?? (async (fn) => {
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });
    try {
      return await fn(connection);
    } finally {
      await connection.end();
    }
  });

  const [
    categoryRows,
    itemCategoryRows,
    itemRecipes,
    itemPageRecipes,
    recipePageRecipes,
    itemSourceRows,
    itemBiomeRows,
    maintBuffRows,
    maintBossRows,
    maintNpcImageRows,
    maintItems,
    maintProjectiles,
    maintNpcs,
    itemImageRows
  ] = await Promise.all([
    queryMaint('SELECT * FROM maint_categories'),
    queryMaint('SELECT * FROM maint_item_categories'),
    queryMaint('SELECT * FROM maint_item_recipes'),
    queryMaint('SELECT * FROM maint_item_page_recipes'),
    queryMaint('SELECT * FROM maint_recipe_page_recipes'),
    queryMaint('SELECT * FROM maint_item_sources'),
    queryMaint('SELECT * FROM maint_item_biomes'),
    queryMaint('SELECT * FROM maint_buffs'),
    queryMaint('SELECT * FROM maint_bosses'),
    queryMaint('SELECT * FROM maint_npc_images'),
    queryMaint('SELECT * FROM maint_items'),
    queryMaint('SELECT * FROM maint_projectiles'),
    queryMaint('SELECT * FROM maint_npcs'),
    queryMaint('SELECT * FROM maint_item_images')
  ]);

  const itemIndex = buildItemIndex(maintItems);
  const npcIndex = buildNpcIndex(maintNpcs);
  const baseEntities = buildBaseEntityRelations({
    maintItems,
    maintNpcs,
    maintProjectiles
  });
  const buffEntities = buildBuffEntityRelations({
    maintBuffs: maintBuffRows
  });
  const imageEntities = buildImageRelations({
    maintItemImages: itemImageRows,
    maintNpcImages: maintNpcImageRows,
    maintProjectiles,
    maintBuffs: maintBuffRows
  });

  const category = buildCategoryRelations({ categoryRows, itemCategoryRows });
  const recipe = buildRecipeRelations({ itemRecipes, itemPageRecipes, recipePageRecipes, itemIndex });
  const recipeReferencePath = path.join(repoRoot, 'data', 'generated', 'recipe-material-reference.json');
  const recipeReferencePayload = fs.existsSync(recipeReferencePath)
    ? JSON.parse(fs.readFileSync(recipeReferencePath, 'utf8'))
    : { groups: [] };
  const recipeExpansions = buildRecipeGroupExpansions({
    recipeIngredients: recipe.recipeIngredients,
    recipeReferencePayload
  });
  const itemSource = buildItemSourceRelations({ itemSourceRows, npcIndex });
  const secondary = buildSecondaryRelations({
    itemBiomeRows,
    maintBuffRows,
    maintProjectileRows: maintProjectiles,
    maintItemRows: maintItems,
    itemImageRows
  });
  const bossSeries = buildBossSeriesRelations({
    maintBossRows,
    relationNpcRows: baseEntities.relationNpcs,
    itemNpcLootRelations: itemSource.npcLootRelations
  });
  const npcSeries = buildNpcSeriesRelations({
    relationNpcRows: baseEntities.relationNpcs,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations
  });

  const results = flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries);
  results.relationItems = baseEntities.relationItems;
  results.relationNpcs = baseEntities.relationNpcs;
  results.relationProjectiles = baseEntities.relationProjectiles;
  results.relationBuffs = buffEntities.relationBuffs;
  results.relationBosses = bossSeries.relationBosses;
  results.relationItemImages = imageEntities.relationItemImages;
  results.relationNpcImages = imageEntities.relationNpcImages;
  results.relationProjectileImages = imageEntities.relationProjectileImages;
  results.relationBuffImages = imageEntities.relationBuffImages;
  results.itemRecipeGroupExpansions = recipeExpansions.groupExpansions;
  const projection = buildProjectionPayload({
    relationItems: results.relationItems,
    relationItemImages: results.relationItemImages,
    relationNpcs: results.relationNpcs,
    relationNpcImages: results.relationNpcImages,
    relationProjectiles: results.relationProjectiles,
    relationProjectileImages: results.relationProjectileImages,
    relationBuffs: results.relationBuffs,
    relationBuffImages: results.relationBuffImages
  });
  results.projectionItems = projection.projectionItems;
  results.projectionNpcs = projection.projectionNpcs;
  results.projectionProjectiles = projection.projectionProjectiles;
  results.projectionBuffs = projection.projectionBuffs;
  const runKey = createRecordKey({
    dateTag: toDateTag(),
    scopes: options.scopes,
    apply: options.apply
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    domainSummary: {
      base: results.relationItems.length
        + results.relationNpcs.length
        + results.relationProjectiles.length
        + results.relationBuffs.length,
      image: results.relationItemImages.length
        + results.relationNpcImages.length
        + results.relationProjectileImages.length
        + results.relationBuffImages.length,
      category: results.categoryNodes.length + results.itemCategoryAssignments.length,
      recipe: results.itemRecipeHeads.length + results.itemRecipeIngredients.length + results.itemRecipeStations.length,
      npc: results.itemSourceFacts.length + results.itemSourceDetails.length + results.itemNpcShopCandidates.length + results.itemNpcLootCandidates.length,
      buff: results.itemBuffRelations.length,
      biome: results.itemBiomeRelations.length,
      projectile: results.itemProjectileAudits.length,
      boss: results.relationBosses.length + results.bossItemRewardRelations.length + results.bossEffectRelations.length,
      npcSeries: results.npcSeriesNodes.length + results.npcSeriesMemberships.length + results.npcSeriesItemRelations.length
    },
    entityBreakdown: {
      item: results.relationItems.length,
      npc: results.relationNpcs.length,
      projectile: results.relationProjectiles.length,
      buff: results.relationBuffs.length
    },
    imageBreakdown: {
      item: results.relationItemImages.length,
      npc: results.relationNpcImages.length,
      projectile: results.relationProjectileImages.length,
      buff: results.relationBuffImages.length
    },
    unresolvedSamples: results.issues.slice(0, 20)
  };

  if (options.apply) {
    if (options.createDatabase) {
      const adminConnection = await mysql.createConnection(mysqlOptions);
      try {
        for (const statement of buildRelationSchemaStatements()) {
          await adminConnection.query(statement);
        }
        for (const statement of buildProjectionSchemaStatements()) {
          await adminConnection.query(statement);
        }
        await ensureRelationMigrations(adminConnection, options.relationDatabase);
      } finally {
        await adminConnection.end();
      }
    } else {
      await executeRelation(async (connection) => {
        for (const statement of buildRelationSchemaStatements().slice(1)) {
          await connection.query(statement);
        }
        for (const statement of buildProjectionSchemaStatements()) {
          await connection.query(statement);
        }
        await ensureRelationMigrations(connection, options.relationDatabase);
      });
    }

    await executeRelation(async (connection) => {
      await insertRun(connection, {
        runKey,
        applyMode: 1,
        maintDatabase: options.maintDatabase,
        localDatabase: null,
        relationDatabase: options.relationDatabase,
        scopes: options.scopes,
        summaryJson: summary,
        startedAt: new Date(),
        finishedAt: new Date(),
        status: 'succeeded'
      });

      await clearRelationSnapshotTables(connection, [
        'item_recipe_group_expansions',
        'item_recipe_ingredients',
        'item_recipe_stations',
        'item_recipe_heads',
        'item_category_assignments',
        'category_nodes',
        'item_npc_shop_relations',
        'item_npc_loot_relations',
        'item_npc_shop_candidates',
        'item_npc_loot_candidates',
        'item_source_details',
        'item_source_facts',
        'item_buff_relations',
        'item_biome_relations',
        'item_projectile_audits',
        'boss_item_reward_relations',
        'boss_effect_relations',
        'npc_series_item_relations',
        'npc_series_memberships',
        'npc_series_nodes',
        'relation_item_images',
        'relation_npc_images',
        'relation_projectile_images',
        'relation_buff_images',
        'relation_bosses',
        'projection_items',
        'projection_npcs',
        'projection_projectiles',
        'projection_buffs',
        'relation_items',
        'relation_npcs',
        'relation_projectiles',
        'relation_buffs'
      ]);

      await upsertRows(connection, 'relation_items', results.relationItems);
      await upsertRows(connection, 'relation_npcs', results.relationNpcs);
      await upsertRows(connection, 'relation_projectiles', results.relationProjectiles);
      await upsertRows(connection, 'relation_buffs', results.relationBuffs);
      await upsertRows(connection, 'relation_bosses', results.relationBosses);
      await upsertRows(connection, 'relation_item_images', results.relationItemImages);
      await upsertRows(connection, 'relation_npc_images', results.relationNpcImages);
      await upsertRows(connection, 'relation_projectile_images', results.relationProjectileImages);
      await upsertRows(connection, 'relation_buff_images', results.relationBuffImages);
      await upsertRows(connection, 'category_nodes', results.categoryNodes);
      await upsertRows(connection, 'item_category_assignments', results.itemCategoryAssignments);
      await upsertRows(connection, 'item_recipe_heads', results.itemRecipeHeads);
      await upsertRows(connection, 'item_recipe_ingredients', results.itemRecipeIngredients);
      await upsertRows(connection, 'item_recipe_stations', results.itemRecipeStations);
      await upsertRows(connection, 'item_recipe_group_expansions', results.itemRecipeGroupExpansions);
      await upsertRows(connection, 'item_source_facts', results.itemSourceFacts);
      await upsertRows(connection, 'item_source_details', results.itemSourceDetails);
      await upsertRows(connection, 'item_npc_shop_relations', results.itemNpcShopRelations);
      await upsertRows(connection, 'item_npc_loot_relations', results.itemNpcLootRelations);
      await upsertRows(connection, 'item_npc_shop_candidates', results.itemNpcShopCandidates);
      await upsertRows(connection, 'item_npc_loot_candidates', results.itemNpcLootCandidates);
      await upsertRows(connection, 'item_buff_relations', results.itemBuffRelations);
      await upsertRows(connection, 'item_biome_relations', results.itemBiomeRelations);
      await upsertRows(connection, 'item_projectile_audits', results.itemProjectileAudits);
      await upsertRows(connection, 'boss_item_reward_relations', results.bossItemRewardRelations);
      await upsertRows(connection, 'boss_effect_relations', results.bossEffectRelations);
      await upsertRows(connection, 'npc_series_nodes', results.npcSeriesNodes);
      await upsertRows(connection, 'npc_series_memberships', results.npcSeriesMemberships);
      await upsertRows(connection, 'npc_series_item_relations', results.npcSeriesItemRelations);
      await upsertRows(connection, 'projection_items', results.projectionItems);
      await upsertRows(connection, 'projection_npcs', results.projectionNpcs);
      await upsertRows(connection, 'projection_projectiles', results.projectionProjectiles);
      await upsertRows(connection, 'projection_buffs', results.projectionBuffs);
    });
  }

  const reportPaths = await writeReports({
    repoRoot,
    dateTag: toDateTag(),
    summary,
    issues: results.issues,
    conflicts: []
  });

  if (options.apply) {
    await executeRelation((connection) => insertReportRows(connection, runKey, reportPaths));
  }

  return {
    runKey,
    apply: options.apply,
    maintDatabase: options.maintDatabase,
    localDatabase: null,
    relationDatabase: options.relationDatabase,
    results,
    summary,
    reportPaths
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSync(options);
  console.log(`Apply: ${result.apply}`);
  console.log(`Maint database: ${result.maintDatabase}`);
  console.log(`Relation database: ${result.relationDatabase}`);
  console.log(`Reports: ${result.reportPaths.auditJsonPath}`);
  console.log(`Relation writes: ${result.apply ? 'performed' : 0}`);
}
