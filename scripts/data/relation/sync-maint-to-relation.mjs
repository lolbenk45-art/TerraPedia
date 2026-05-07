#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  DEPRECATED_RELATION_TABLE_NAMES,
  RELATION_DATABASE_NAME,
  buildRelationSchemaStatements
} from './relation-schema.mjs';
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
import { buildRelationItemRarities } from './item-rarity-support-processor.mjs';
import { buildArmorSetRelations } from './armor-set-processor.mjs';
import { buildProjectionSchemaStatements } from './projection-schema.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { writeRelationReports } from './relation-report.mjs';
import {
  isManagedImageUrl,
  normalizeManagedImageUrlPrefixes,
  resolveManagedImageUrlPrefixes
} from './managed-image-url-policy.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = getProjectRoot();

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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    allowLocalItemImageFallback: booleanOption(raw['allow-local-item-image-fallback'] ?? raw.allowLocalItemImageFallback, true),
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    wikiArmorSetsInput: raw['wiki-armor-sets-input'] ?? raw.wikiArmorSetsInput ?? path.join(repoRoot, 'data', 'generated', 'wiki-armor-sets.latest.json'),
    scopes: String(raw.scopes ?? 'category,recipe,npc,buff,biome,projectile')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

function readWikiArmorSets(inputPath) {
  if (!inputPath) {
    return [];
  }
  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (Array.isArray(payload.records)) {
    return payload.records;
  }
  if (Array.isArray(payload.armorSets)) {
    return payload.armorSets;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
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

async function queryMaintOptional(queryMaint, sql, fallback = []) {
  try {
    return await queryMaint(sql);
  } catch (error) {
    const code = error?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|does not exist|unknown table/i.test(message)) {
      return fallback;
    }
    throw error;
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
      const existing = index.get(candidate);
      if (!existing) {
        index.set(candidate, row);
      } else if (Array.isArray(existing)) {
        existing.push(row);
      } else {
        index.set(candidate, [existing, row]);
      }
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

function isManagedProjectionImageUrl(value, prefixes) {
  return isManagedImageUrl(value, prefixes);
}

function escapeSqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function escapeSqlLikeLiteral(value) {
  return escapeSqlString(String(value).replace(/[\\%_]/g, (match) => `\\${match}`));
}

function buildManagedImageSqlLikeAny(column, prefixes) {
  const clauses = normalizeManagedImageUrlPrefixes(prefixes)
    .map((prefix) => `BINARY TRIM(${column}) LIKE BINARY '${escapeSqlLikeLiteral(prefix)}%' ESCAPE '\\\\'`);
  return clauses.length ? `(${clauses.join(' OR ')})` : 'FALSE';
}

function buildManagedImageSqlNotLikeAll(column, prefixes) {
  const clauses = normalizeManagedImageUrlPrefixes(prefixes)
    .map((prefix) => `BINARY TRIM(${column}) NOT LIKE BINARY '${escapeSqlLikeLiteral(prefix)}%' ESCAPE '\\\\'`);
  return clauses.length ? `(${clauses.join(' AND ')})` : 'TRUE';
}

export function rewriteArmorSetRelatedItemImages(relatedItems, imageByInternalName, prefixes) {
  if (!Array.isArray(relatedItems)) {
    return { changed: false, items: relatedItems };
  }
  let changed = false;
  const items = relatedItems.map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }
    const copy = { ...item };
    const internalName = copy.internalName ?? copy.internal_name ?? copy.itemInternalName ?? copy.item_internal_name;
    const key = typeof internalName === 'string' ? internalName.trim().toLowerCase() : '';
    const managedImage = key ? imageByInternalName.get(key) : null;
    if (managedImage && copy.image !== managedImage) {
      copy.image = managedImage;
      changed = true;
    } else if (!managedImage && copy.image && !isManagedProjectionImageUrl(copy.image, prefixes)) {
      copy.image = null;
      changed = true;
    }
    return copy;
  });
  return { changed, items };
}

function addIndexEntry(index, key, row) {
  if (!key) return;
  const normalizedKey = String(key).trim().toLowerCase();
  if (!normalizedKey) return;
  const existing = index.get(normalizedKey);
  if (!existing) {
    index.set(normalizedKey, row);
  } else if (Array.isArray(existing)) {
    existing.push(row);
  } else {
    index.set(normalizedKey, [existing, row]);
  }
}

async function queryRelationOptional(queryRelation, sql, fallback = []) {
  try {
    return await queryRelation(sql);
  } catch (error) {
    const code = error?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|does not exist|unknown table/i.test(message)) {
      return fallback;
    }
    throw error;
  }
}

function buildItemSourceLookupIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    addIndexEntry(index, row.internal_name, row);
    addIndexEntry(index, row.english_name, row);
    addIndexEntry(index, row.name, row);
    addIndexEntry(index, row.name_zh, row);
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

async function reconcileItemStackSizeFromMaint(connection, maintDatabase) {
  await connection.query(
    `
    UPDATE \`relation_items\` ri
    INNER JOIN \`${maintDatabase}\`.\`maint_items\` mi
      ON mi.source_id = ri.source_id
    SET ri.stack_size = mi.stack_size
    WHERE ri.deleted = 0
      AND mi.deleted = 0
      AND mi.stack_size IS NOT NULL
    `.trim()
  );

  await connection.query(
    `
    UPDATE \`projection_items\` pi
    INNER JOIN \`relation_items\` ri
      ON ri.record_key = pi.relation_record_key
    SET
      pi.stack_size = ri.stack_size,
      pi.is_stackable = CASE
        WHEN ri.stack_size IS NULL THEN NULL
        WHEN ri.stack_size > 1 THEN 1
        ELSE 0
      END
    WHERE pi.deleted = 0
      AND ri.deleted = 0
      AND ri.stack_size IS NOT NULL
    `.trim()
  );
}

async function reconcileProjectionItemImageFromMaint(connection, maintDatabase, prefixes) {
  const managedCachedUrlPredicate = buildManagedImageSqlLikeAny('mi.cached_url', prefixes);
  const [result] = await connection.query(
    `
    UPDATE \`projection_items\` pi
    INNER JOIN (
      SELECT ranked.*
      FROM (
        SELECT
          mi.*,
          ROW_NUMBER() OVER (
            PARTITION BY mi.item_internal_name
            ORDER BY COALESCE(mi.is_primary, 0) DESC, COALESCE(mi.sort_order, 2147483647) ASC, mi.id ASC
          ) AS image_rank
        FROM \`${maintDatabase}\`.\`maint_item_images\` mi
        WHERE mi.deleted = 0
          AND mi.cached_url IS NOT NULL
          AND TRIM(mi.cached_url) <> ''
          AND ${managedCachedUrlPredicate}
      ) ranked
      WHERE ranked.image_rank = 1
    ) picked
      ON picked.item_internal_name COLLATE utf8mb4_unicode_ci = pi.internal_name COLLATE utf8mb4_unicode_ci
    SET pi.image = picked.cached_url
    WHERE pi.deleted = 0
    `.trim()
  );
  return Number(result?.affectedRows ?? 0);
}

async function reconcileProjectionItemImageFromLocal(connection, localDatabase, enabled = true, prefixes) {
  if (!localDatabase || !enabled) {
    return 0;
  }

  const localImageManagedPredicate = buildManagedImageSqlLikeAny('li.image', prefixes);
  const projectionImageUnmanagedPredicate = buildManagedImageSqlNotLikeAll('pi.image', prefixes);
  const [result] = await connection.query(
    `
    UPDATE \`projection_items\` pi
    INNER JOIN \`${localDatabase}\`.\`items\` li
      ON li.internal_name COLLATE utf8mb4_unicode_ci = pi.internal_name COLLATE utf8mb4_unicode_ci
    SET pi.image = li.image
    WHERE pi.deleted = 0
      AND li.deleted = 0
      AND (pi.image IS NULL OR TRIM(pi.image) = '' OR ${projectionImageUnmanagedPredicate})
      AND li.image IS NOT NULL
      AND TRIM(li.image) <> ''
      AND ${localImageManagedPredicate}
    `.trim()
  );
  return Number(result?.affectedRows ?? 0);
}

async function reconcileProjectionArmorSetRelatedItemImagesFromLocal(connection, localDatabase, enabled = true, prefixes) {
  if (!localDatabase || !enabled) {
    return 0;
  }

  const [armorRows] = await connection.query(
    `
    SELECT id, related_items_json
    FROM \`projection_armor_sets\`
    WHERE deleted = 0
      AND related_items_json IS NOT NULL
      AND TRIM(related_items_json) <> ''
    `.trim()
  );
  if (!armorRows.length) {
    return 0;
  }

  const localImageManagedPredicate = buildManagedImageSqlLikeAny('image', prefixes);
  const [itemRows] = await connection.query(
    `
    SELECT internal_name, image
    FROM \`${localDatabase}\`.\`items\`
    WHERE deleted = 0
      AND internal_name IS NOT NULL
      AND image IS NOT NULL
      AND TRIM(image) <> ''
      AND ${localImageManagedPredicate}
    `.trim()
  );
  const imageByInternalName = new Map(
    itemRows
      .filter((row) => row.internal_name && isManagedProjectionImageUrl(row.image, prefixes))
      .map((row) => [String(row.internal_name).trim().toLowerCase(), row.image.trim()])
  );
  if (!imageByInternalName.size) {
    return 0;
  }

  let changedRows = 0;
  for (const row of armorRows) {
    let relatedItems;
    try {
      relatedItems = JSON.parse(row.related_items_json);
    } catch {
      continue;
    }
    if (!Array.isArray(relatedItems)) {
      continue;
    }
    const rewrite = rewriteArmorSetRelatedItemImages(relatedItems, imageByInternalName, prefixes);
    if (rewrite.changed) {
      await connection.query(
        'UPDATE `projection_armor_sets` SET related_items_json = ? WHERE id = ?',
        [JSON.stringify(rewrite.items), row.id]
      );
      changedRows += 1;
    }
  }
  return changedRows;
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

async function dropDeprecatedRelationTables(connection, databaseName = RELATION_DATABASE_NAME) {
  for (const tableName of DEPRECATED_RELATION_TABLE_NAMES) {
    await connection.query(`DROP TABLE IF EXISTS \`${databaseName}\`.\`${tableName}\``);
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
      tableName: 'relation_items',
      columns: [
        ['rare_raw', 'INT DEFAULT NULL AFTER `height`'],
        ['value_raw', 'INT DEFAULT NULL AFTER `rare_raw`'],
        ['sell_raw', 'INT DEFAULT NULL AFTER `value_raw`'],
        ['sell_text_raw', 'VARCHAR(255) DEFAULT NULL AFTER `sell_raw`']
      ]
    },
    {
      tableName: 'relation_npcs',
      columns: [
        ['sub_name_zh', 'VARCHAR(255) DEFAULT NULL AFTER `name_zh`']
      ]
    },
    {
      tableName: 'projection_npcs',
      columns: [
        ['image_url', 'VARCHAR(500) DEFAULT NULL AFTER `sub_name_zh`'],
        ['loot_items_json', 'LONGTEXT AFTER `raw_json`'],
        ['shop_items_json', 'LONGTEXT AFTER `loot_items_json`'],
        ['source_items_json', 'LONGTEXT AFTER `shop_items_json`']
      ]
    },
    {
      tableName: 'projection_items',
      columns: [
        ['source_npcs_json', 'LONGTEXT AFTER `stack_size`']
      ]
    },
    {
      tableName: 'projection_projectiles',
      columns: [
        ['image_url', 'VARCHAR(500) DEFAULT NULL AFTER `name_zh`'],
        ['source_items_json', 'LONGTEXT AFTER `tile_collide`'],
        ['source_npcs_json', 'LONGTEXT AFTER `source_items_json`']
      ]
    },
    {
      tableName: 'projection_armor_sets',
      columns: [
        ['entity_type', 'VARCHAR(64) DEFAULT NULL AFTER `text_key`'],
        ['composition_kind', 'VARCHAR(64) DEFAULT NULL AFTER `entity_type`']
      ]
    },
    {
      tableName: 'item_npc_shop_relations',
      columns: [
        ['item_name', 'VARCHAR(255) DEFAULT NULL AFTER `item_internal_name`'],
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
        ['item_name', 'VARCHAR(255) DEFAULT NULL AFTER `item_internal_name`'],
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

function flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries, armorSet) {
  return {
    relationItems: [],
    relationNpcs: [],
    relationProjectiles: [],
    relationBuffs: [],
    relationBosses: [],
    relationArmorSets: armorSet.relationArmorSets,
    relationArmorSetItems: armorSet.relationArmorSetItems,
    relationArmorSetImages: armorSet.relationArmorSetImages,
    relationItemRarities: [],
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
    itemNpcRelationAudits: itemSource.itemNpcRelationAudits,
    itemBuffRelations: secondary.itemBuffRelations,
    itemBiomeRelations: secondary.itemBiomeRelations,
    itemProjectileRelations: secondary.itemProjectileRelations,
    npcProjectileRelations: secondary.npcProjectileRelations,
    itemProjectileAudits: secondary.itemProjectileAudits,
    npcProjectileAudits: secondary.npcProjectileAudits,
    bossItemRewardRelations: bossSeries.bossItemRewardRelations,
    bossEffectRelations: bossSeries.bossEffectRelations,
    npcSeriesNodes: npcSeries.npcSeriesNodes,
    npcSeriesMemberships: npcSeries.npcSeriesMemberships,
    npcSeriesItemRelations: npcSeries.npcSeriesItemRelations,
    projectionItems: [],
    projectionNpcs: [],
    projectionBosses: [],
    projectionProjectiles: [],
    projectionBuffs: [],
    projectionArmorSets: [],
    issues: [
      ...category.issues,
      ...recipe.issues,
      ...itemSource.issues,
      ...bossSeries.issues,
      ...npcSeries.issues,
      ...armorSet.issues
    ]
  };
}

export async function runSync(options, dependencies = {}) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const managedImageUrlPrefixes = normalizeManagedImageUrlPrefixes(
    dependencies.managedImageUrlPrefixes ?? resolveManagedImageUrlPrefixes()
  );
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };

  const queryMaint = dependencies.queryMaint ?? ((sql) => loadDataset(mysqlOptions, options.maintDatabase, sql));
  const queryRelation = dependencies.queryRelation ?? ((sql) => loadDataset(mysqlOptions, options.relationDatabase, sql));
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
    localProjectiles,
    maintNpcs,
    localBuffRows,
    itemImageRows,
    maintItemPages,
    maintItemNumericOverrides,
    maintItemRarityOverrides
    ,
    maintItemTextOverrides,
    maintArmorSets,
    maintArmorSetImages,
    existingRelationArmorSetImages
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
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, 'SELECT internal_name, image_url FROM projectiles WHERE deleted = 0') : [],
    queryMaint('SELECT * FROM maint_npcs'),
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, 'SELECT internal_name, image, image_cached_url FROM buffs WHERE deleted = 0') : [],
    queryMaint('SELECT * FROM maint_item_images'),
    queryMaint('SELECT item_internal_name, sell_text, sell_value, source_revision_timestamp, updated_at FROM maint_item_pages'),
    queryMaint('SELECT item_internal_name, damage_value, defense_value, knockback_value, use_time, buy_value, sell_value FROM maint_item_numeric_overrides WHERE deleted = 0'),
    queryMaint('SELECT item_internal_name, rarity_id FROM maint_item_rarity_overrides WHERE deleted = 0'),
    queryMaint('SELECT item_internal_name, tooltip_zh, description_zh FROM maint_item_text_overrides WHERE deleted = 0'),
    queryMaint('SELECT * FROM maint_armor_sets WHERE deleted = 0'),
    queryMaintOptional(queryMaint, 'SELECT * FROM maint_armor_set_images WHERE deleted = 0', []),
    queryRelationOptional(queryRelation, 'SELECT * FROM relation_armor_set_images WHERE deleted = 0', [])
  ]);

  const wikiArmorSets = readWikiArmorSets(options.wikiArmorSetsInput);
  const itemIndex = buildItemIndex(maintItems);
  const itemSourceLookupIndex = buildItemSourceLookupIndex(maintItems);
  const npcIndex = buildNpcIndex(maintNpcs);
  const baseEntities = buildBaseEntityRelations({
    maintItems,
    maintItemNumericOverrides,
    maintItemPages,
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
    maintBuffs: maintBuffRows,
    localProjectiles,
    localBuffs: localBuffRows
  });
  const relationItemRarities = buildRelationItemRarities();

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
  const itemSource = buildItemSourceRelations({ itemSourceRows, npcIndex, itemIndex: itemSourceLookupIndex });
  const secondary = buildSecondaryRelations({
    itemBiomeRows,
    maintBuffRows,
    maintProjectileRows: maintProjectiles,
    maintItemRows: maintItems,
    maintNpcRows: maintNpcs,
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
  const armorSet = buildArmorSetRelations({
    wikiArmorSets,
    maintArmorSets,
    maintItems,
    maintArmorSetImages,
    existingRelationArmorSetImages,
    managedImageUrlPrefixes
  });

  const results = flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries, armorSet);
  results.relationItems = baseEntities.relationItems;
  results.relationNpcs = baseEntities.relationNpcs;
  results.relationProjectiles = baseEntities.relationProjectiles;
  results.relationBuffs = buffEntities.relationBuffs;
  results.relationBosses = bossSeries.relationBosses;
  results.relationItemRarities = relationItemRarities;
  results.relationItemImages = imageEntities.relationItemImages;
  results.relationNpcImages = imageEntities.relationNpcImages;
  results.relationProjectileImages = imageEntities.relationProjectileImages;
  results.relationBuffImages = imageEntities.relationBuffImages;
  results.itemRecipeGroupExpansions = recipeExpansions.groupExpansions;
  const projection = buildProjectionPayload({
    relationItems: results.relationItems,
    relationItemImages: results.relationItemImages,
    relationItemRarities: results.relationItemRarities,
    itemNumericOverrides: maintItemNumericOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      damageValue: row.damage_value,
      defenseValue: row.defense_value,
      knockbackValue: row.knockback_value,
      useTime: row.use_time,
      buyValue: row.buy_value,
      sellValue: row.sell_value,
    })),
    itemRarityOverrides: maintItemRarityOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      rarityId: row.rarity_id,
    })),
    itemTextOverrides: maintItemTextOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      tooltipZh: row.tooltip_zh,
      descriptionZh: row.description_zh,
    })),
    relationNpcs: results.relationNpcs,
    relationNpcImages: results.relationNpcImages,
    relationProjectiles: results.relationProjectiles,
    relationProjectileImages: results.relationProjectileImages,
    itemNpcShopRelations: results.itemNpcShopRelations,
    itemNpcLootRelations: results.itemNpcLootRelations,
    itemProjectileRelations: results.itemProjectileRelations,
    npcProjectileRelations: results.npcProjectileRelations,
    relationBosses: results.relationBosses,
    bossItemRewardRelations: results.bossItemRewardRelations,
    bossEffectRelations: results.bossEffectRelations,
    relationBuffs: results.relationBuffs,
    relationBuffImages: results.relationBuffImages,
    relationArmorSets: results.relationArmorSets,
    relationArmorSetItems: results.relationArmorSetItems,
    relationArmorSetImages: results.relationArmorSetImages,
    managedImageUrlPrefixes
  });
  results.projectionItems = projection.projectionItems;
  results.projectionNpcs = projection.projectionNpcs;
  results.projectionBosses = projection.projectionBosses;
  results.projectionProjectiles = projection.projectionProjectiles;
  results.projectionBuffs = projection.projectionBuffs;
  results.projectionArmorSets = projection.projectionArmorSets;
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
      npc: results.itemSourceFacts.length
        + results.itemSourceDetails.length
        + results.itemNpcShopRelations.length
        + results.itemNpcLootRelations.length
        + results.itemNpcRelationAudits.length,
      buff: results.itemBuffRelations.length,
      biome: results.itemBiomeRelations.length,
      projectile: results.itemProjectileRelations.length
        + results.npcProjectileRelations.length
        + results.itemProjectileAudits.length
        + results.npcProjectileAudits.length,
      boss: results.relationBosses.length + results.bossItemRewardRelations.length + results.bossEffectRelations.length,
      npcSeries: results.npcSeriesNodes.length + results.npcSeriesMemberships.length + results.npcSeriesItemRelations.length,
      armorSet: results.relationArmorSets.length + results.relationArmorSetItems.length + results.relationArmorSetImages.length
    },
    entityBreakdown: {
      item: results.relationItems.length,
      npc: results.relationNpcs.length,
      projectile: results.relationProjectiles.length,
      buff: results.relationBuffs.length,
      armorSet: results.relationArmorSets.length
    },
    imageBreakdown: {
      item: results.relationItemImages.length,
      npc: results.relationNpcImages.length,
      projectile: results.relationProjectileImages.length,
      buff: results.relationBuffImages.length,
      armorSet: results.relationArmorSetImages.length
    },
    bridgeBreakdown: {
      itemTextOverrideRows: maintItemTextOverrides.length,
      localItemImageFallbackEnabled: Boolean(options.allowLocalItemImageFallback && options.localDatabase),
      maintItemImageFillRows: 0,
      localItemImageFallbackRows: 0,
      localArmorSetRelatedItemImageFallbackRows: 0,
    },
    unresolvedSamples: results.issues.slice(0, 20)
  };

  const applyStartedAt = new Date();

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
        await dropDeprecatedRelationTables(adminConnection, options.relationDatabase);
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
        await dropDeprecatedRelationTables(connection, options.relationDatabase);
      });
    }

    await executeRelation(async (connection) => {
      await insertRun(connection, {
        runKey,
        applyMode: 1,
        maintDatabase: options.maintDatabase,
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        scopes: options.scopes,
        summaryJson: summary,
        startedAt: applyStartedAt,
        finishedAt: null,
        status: 'running'
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
        'item_npc_relation_audits',
        'item_source_details',
        'item_source_facts',
        'item_buff_relations',
        'item_biome_relations',
        'item_projectile_relations',
        'npc_projectile_relations',
        'item_projectile_audits',
        'npc_projectile_audits',
        'boss_item_reward_relations',
        'boss_effect_relations',
        'npc_series_item_relations',
        'npc_series_memberships',
        'npc_series_nodes',
        'relation_armor_set_images',
        'relation_armor_set_items',
        'relation_armor_sets',
        'relation_item_rarities',
        'relation_item_images',
        'relation_npc_images',
        'relation_projectile_images',
        'relation_buff_images',
        'relation_bosses',
        'projection_items',
        'projection_npcs',
        'projection_bosses',
        'projection_projectiles',
        'projection_buffs',
        'projection_armor_sets',
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
      await upsertRows(connection, 'relation_armor_sets', results.relationArmorSets);
      await upsertRows(connection, 'relation_armor_set_items', results.relationArmorSetItems);
      await upsertRows(connection, 'relation_item_rarities', results.relationItemRarities);
      await upsertRows(connection, 'relation_item_images', results.relationItemImages);
      await upsertRows(connection, 'relation_npc_images', results.relationNpcImages);
      await upsertRows(connection, 'relation_projectile_images', results.relationProjectileImages);
      await upsertRows(connection, 'relation_buff_images', results.relationBuffImages);
      await upsertRows(connection, 'relation_armor_set_images', results.relationArmorSetImages);
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
      await upsertRows(connection, 'item_npc_relation_audits', results.itemNpcRelationAudits);
      await upsertRows(connection, 'item_buff_relations', results.itemBuffRelations);
      await upsertRows(connection, 'item_biome_relations', results.itemBiomeRelations);
      await upsertRows(connection, 'item_projectile_relations', results.itemProjectileRelations);
      await upsertRows(connection, 'npc_projectile_relations', results.npcProjectileRelations);
      await upsertRows(connection, 'item_projectile_audits', results.itemProjectileAudits);
      await upsertRows(connection, 'npc_projectile_audits', results.npcProjectileAudits);
      await upsertRows(connection, 'boss_item_reward_relations', results.bossItemRewardRelations);
      await upsertRows(connection, 'boss_effect_relations', results.bossEffectRelations);
      await upsertRows(connection, 'npc_series_nodes', results.npcSeriesNodes);
      await upsertRows(connection, 'npc_series_memberships', results.npcSeriesMemberships);
      await upsertRows(connection, 'npc_series_item_relations', results.npcSeriesItemRelations);
      await upsertRows(connection, 'projection_items', results.projectionItems);
      await upsertRows(connection, 'projection_npcs', results.projectionNpcs);
      await upsertRows(connection, 'projection_bosses', results.projectionBosses);
      await upsertRows(connection, 'projection_projectiles', results.projectionProjectiles);
      await upsertRows(connection, 'projection_buffs', results.projectionBuffs);
      await upsertRows(connection, 'projection_armor_sets', results.projectionArmorSets);
      await reconcileItemStackSizeFromMaint(connection, options.maintDatabase);
      summary.bridgeBreakdown.maintItemImageFillRows = await reconcileProjectionItemImageFromMaint(
        connection,
        options.maintDatabase,
        managedImageUrlPrefixes
      );
      summary.bridgeBreakdown.localItemImageFallbackRows = await reconcileProjectionItemImageFromLocal(
        connection,
        options.localDatabase,
        options.allowLocalItemImageFallback,
        managedImageUrlPrefixes
      );
      summary.bridgeBreakdown.localArmorSetRelatedItemImageFallbackRows =
        await reconcileProjectionArmorSetRelatedItemImagesFromLocal(
          connection,
          options.localDatabase,
          options.allowLocalItemImageFallback,
          managedImageUrlPrefixes
        );
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
    await executeRelation(async (connection) => {
      await insertReportRows(connection, runKey, reportPaths);
      await insertRun(connection, {
        runKey,
        applyMode: 1,
        maintDatabase: options.maintDatabase,
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        scopes: options.scopes,
        summaryJson: summary,
        startedAt: applyStartedAt,
        finishedAt: new Date(),
        status: 'succeeded'
      });
    });
  }

  return {
    runKey,
    apply: options.apply,
    maintDatabase: options.maintDatabase,
    localDatabase: options.localDatabase,
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
