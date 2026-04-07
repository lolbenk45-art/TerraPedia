#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const GROUP_NAME_MAP = new Map([
  ['Any Adamantite Bar', '任意精金锭'],
  ['Any Cobalt Bar', '任意钴锭'],
  ['Any Fruit', '任意水果'],
  ['Any Gem Critter', '任意宝石小动物'],
  ['Any Guide to Critter Companionship', '任意小动物友谊指南'],
  ['Any Guide to Environmental Preservation', '任意环境保护指南'],
  ['Any Iron Bar', '任意铁锭'],
  ['Any Magic Mirror', '任意魔镜'],
  ['Any Mythril Bar', '任意秘银锭'],
  ['Any Pressure Plate', '任意压力板'],
  ['Any Stone Block', '任意石块'],
  ['Any Wood', '任意木材'],
]);
const STATION_NAME_MAP = new Map([
  ['Alchemy Flask', '炼金瓶'],
  ['Alchemy Table', '炼药桌'],
  ['By Hand', '徒手'],
  ['Chair', '椅子'],
  ['Crimson Altar', '猩红祭坛'],
  ['Demon Altar', '恶魔祭坛'],
  ['Ecto Mist', '灵雾'],
  ['Heavy Work Bench', '重型装配台'],
  ['Honey', '蜂蜜'],
  ['Lava', '岩浆'],
  ['Living Wood', '生命木'],
  ['Placed Bottle', '放置的瓶子'],
  ['Sink', '水槽'],
  ['Snow biome', '雪原生物群系'],
  ['Table', '桌子'],
  ['Water', '水'],
  ['Water fountain', '喷泉'],
]);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: resolveDefaultDatabaseName(),
};

const conn = await mysql.createConnection(db);

try {
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    dbName: db.database,
    groupIngredients: await summarizeGroupIngredients(conn),
    craftingStations: await summarizeCraftingStations(conn),
    ingredients: await summarizeIngredients(conn),
    stations: await summarizeStations(conn),
    samples: {
      groupIngredients: await loadGroupIngredientSamples(conn),
      craftingStations: await loadCraftingStationSamples(conn),
      ingredients: await loadIngredientSamples(conn),
      stations: await loadStationSamples(conn),
    },
  };

  if (apply) {
    await conn.beginTransaction();
    summary.groupIngredients.updated = await applyGroupIngredientBackfill(conn);
    summary.craftingStations.updated = await applyCraftingStationBackfill(conn);
    summary.ingredients.updated = await applyIngredientBackfill(conn);
    summary.stations.updated = await applyStationBackfill(conn);
    await conn.commit();
    summary.after = {
      groupIngredients: await summarizeGroupIngredients(conn),
      craftingStations: await summarizeCraftingStations(conn),
      ingredients: await summarizeIngredients(conn),
      stations: await summarizeStations(conn),
    };
  }

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  throw error;
} finally {
  await conn.end();
}

async function summarizeIngredients(connection) {
  const [[row]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN ri.ingredient_item_id IS NOT NULL
           AND i.name_zh IS NOT NULL
           AND TRIM(i.name_zh) <> ''
          THEN 1 ELSE 0
        END
      ) AS linkedWithZh,
      SUM(
        CASE
          WHEN ri.ingredient_item_id IS NOT NULL
           AND i.name_zh IS NOT NULL
           AND TRIM(i.name_zh) <> ''
           AND (
             ri.ingredient_name_raw IS NULL
             OR TRIM(ri.ingredient_name_raw) = ''
             OR TRIM(ri.ingredient_name_raw) <> TRIM(i.name_zh)
           )
          THEN 1 ELSE 0
        END
      ) AS needsSync
    FROM recipe_ingredients ri
    LEFT JOIN items i ON i.id = ri.ingredient_item_id
  `);
  return {
    total: Number(row?.total ?? 0),
    linkedWithZh: Number(row?.linkedWithZh ?? 0),
    needsSync: Number(row?.needsSync ?? 0),
    updated: 0,
  };
}

async function summarizeGroupIngredients(connection) {
  const groupInListSql = buildInListSql(GROUP_NAME_MAP);
  const [[row]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN ingredient_group_type = 'group'
           AND ingredient_name_raw IN (${groupInListSql})
          THEN 1 ELSE 0
        END
      ) AS mappable,
      SUM(
        CASE
          WHEN ingredient_group_type = 'group'
           AND ingredient_name_raw IN (${groupInListSql})
           AND ingredient_name_raw <> CASE ingredient_name_raw
             ${buildCaseWhenSql(GROUP_NAME_MAP)}
             ELSE ingredient_name_raw
           END
          THEN 1 ELSE 0
        END
      ) AS needsSync
    FROM recipe_ingredients
  `);
  return {
    total: Number(row?.total ?? 0),
    mappable: Number(row?.mappable ?? 0),
    needsSync: Number(row?.needsSync ?? 0),
    updated: 0,
  };
}

async function summarizeCraftingStations(connection) {
  const stationInListSql = buildInListSql(STATION_NAME_MAP);
  const [[row]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN (cs.name_zh IS NULL OR TRIM(cs.name_zh) = '')
           AND i.name_zh IS NOT NULL
           AND TRIM(i.name_zh) <> ''
           AND (
             (cs.internal_name IS NOT NULL AND i.internal_name IS NOT NULL AND cs.internal_name = i.internal_name)
             OR
             (cs.name_en IS NOT NULL AND i.name IS NOT NULL AND cs.name_en = i.name)
           )
          THEN 1 ELSE 0
        END
      ) AS autoMappable,
      SUM(
        CASE
          WHEN (cs.name_zh IS NULL OR TRIM(cs.name_zh) = '')
           AND cs.name_en IN (${stationInListSql})
          THEN 1 ELSE 0
        END
      ) AS dictionaryMappable
    FROM crafting_stations cs
    LEFT JOIN items i ON i.id = cs.item_id
    WHERE cs.deleted = 0
  `);
  return {
    total: Number(row?.total ?? 0),
    autoMappable: Number(row?.autoMappable ?? 0),
    dictionaryMappable: Number(row?.dictionaryMappable ?? 0),
    updated: 0,
  };
}

async function summarizeStations(connection) {
  const [[row]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(
        CASE
          WHEN COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), '')) IS NOT NULL
          THEN 1 ELSE 0
        END
      ) AS linkedWithZh,
      SUM(
        CASE
          WHEN COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), '')) IS NOT NULL
           AND (
             rs.station_name_raw IS NULL
             OR TRIM(rs.station_name_raw) = ''
             OR TRIM(rs.station_name_raw) <> COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), ''))
           )
          THEN 1 ELSE 0
        END
      ) AS needsSync
    FROM recipe_stations rs
    LEFT JOIN items i ON i.id = rs.station_item_id
    LEFT JOIN crafting_stations cs ON cs.id = rs.station_id
  `);
  return {
    total: Number(row?.total ?? 0),
    linkedWithZh: Number(row?.linkedWithZh ?? 0),
    needsSync: Number(row?.needsSync ?? 0),
    updated: 0,
  };
}

async function loadGroupIngredientSamples(connection) {
  const groupInListSql = buildInListSql(GROUP_NAME_MAP);
  const [rows] = await connection.query(`
    SELECT id, ingredient_name_raw AS currentName, quantity_text AS quantityText
    FROM recipe_ingredients
    WHERE ingredient_group_type = 'group'
      AND ingredient_name_raw IN (${groupInListSql})
      AND ingredient_name_raw <> CASE ingredient_name_raw
        ${buildCaseWhenSql(GROUP_NAME_MAP)}
        ELSE ingredient_name_raw
      END
    ORDER BY id ASC
    LIMIT 20
  `);
  return rows.map((row) => ({
    ...row,
    targetName: GROUP_NAME_MAP.get(row.currentName) ?? null,
  }));
}

async function loadCraftingStationSamples(connection) {
  const stationInListSql = buildInListSql(STATION_NAME_MAP);
  const [rows] = await connection.query(`
    SELECT
      cs.id,
      cs.internal_name AS internalName,
      cs.name_en AS nameEn,
      cs.name_zh AS currentNameZh,
      i.name AS itemName,
      i.internal_name AS itemInternalName,
      i.name_zh AS itemNameZh
    FROM crafting_stations cs
    LEFT JOIN items i ON i.id = cs.item_id
    WHERE cs.deleted = 0
      AND (
        (
          (cs.name_zh IS NULL OR TRIM(cs.name_zh) = '')
          AND i.name_zh IS NOT NULL
          AND TRIM(i.name_zh) <> ''
          AND (
            (cs.internal_name IS NOT NULL AND i.internal_name IS NOT NULL AND cs.internal_name = i.internal_name)
            OR
            (cs.name_en IS NOT NULL AND i.name IS NOT NULL AND cs.name_en = i.name)
          )
        )
        OR
        (
          (cs.name_zh IS NULL OR TRIM(cs.name_zh) = '')
          AND cs.name_en IN (${stationInListSql})
        )
      )
    ORDER BY cs.id ASC
    LIMIT 20
  `);
  return rows.map((row) => ({
    ...row,
    targetNameZh: shouldSyncCraftingStationFromItem(row)
      ? row.itemNameZh
      : STATION_NAME_MAP.get(row.nameEn) || null,
  }));
}

async function loadIngredientSamples(connection) {
  const [rows] = await connection.query(`
    SELECT
      ri.id,
      ri.ingredient_internal_name AS internalName,
      ri.ingredient_name_raw AS currentName,
      i.name AS itemName,
      i.name_zh AS itemNameZh
    FROM recipe_ingredients ri
    JOIN items i ON i.id = ri.ingredient_item_id
    WHERE i.name_zh IS NOT NULL
      AND TRIM(i.name_zh) <> ''
      AND (
        ri.ingredient_name_raw IS NULL
        OR TRIM(ri.ingredient_name_raw) = ''
        OR TRIM(ri.ingredient_name_raw) <> TRIM(i.name_zh)
      )
    ORDER BY ri.id ASC
    LIMIT 20
  `);
  return rows;
}

async function loadStationSamples(connection) {
  const [rows] = await connection.query(`
    SELECT
      rs.id,
      rs.station_internal_name AS internalName,
      rs.station_name_raw AS currentName,
      i.name AS itemName,
      i.name_zh AS itemNameZh,
      cs.name_en AS stationNameEn,
      cs.name_zh AS stationNameZh
    FROM recipe_stations rs
    LEFT JOIN items i ON i.id = rs.station_item_id
    LEFT JOIN crafting_stations cs ON cs.id = rs.station_id
    WHERE COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), '')) IS NOT NULL
      AND (
        rs.station_name_raw IS NULL
        OR TRIM(rs.station_name_raw) = ''
        OR TRIM(rs.station_name_raw) <> COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), ''))
      )
    ORDER BY rs.id ASC
    LIMIT 20
  `);
  return rows;
}

async function applyGroupIngredientBackfill(connection) {
  const groupInListSql = buildInListSql(GROUP_NAME_MAP);
  const [result] = await connection.query(`
    UPDATE recipe_ingredients
    SET
      ingredient_name_raw = CASE ingredient_name_raw
        ${buildCaseWhenSql(GROUP_NAME_MAP)}
        ELSE ingredient_name_raw
      END,
      updated_at = NOW()
    WHERE ingredient_group_type = 'group'
      AND ingredient_name_raw IN (${groupInListSql})
      AND ingredient_name_raw <> CASE ingredient_name_raw
        ${buildCaseWhenSql(GROUP_NAME_MAP)}
        ELSE ingredient_name_raw
      END
  `);
  return Number(result?.affectedRows ?? 0);
}

async function applyCraftingStationBackfill(connection) {
  const stationInListSql = buildInListSql(STATION_NAME_MAP);
  const [autoResult] = await connection.query(`
    UPDATE crafting_stations cs
    JOIN items i ON i.id = cs.item_id
    SET
      cs.name_zh = i.name_zh,
      cs.updated_at = NOW()
    WHERE cs.deleted = 0
      AND (cs.name_zh IS NULL OR TRIM(cs.name_zh) = '')
      AND i.name_zh IS NOT NULL
      AND TRIM(i.name_zh) <> ''
      AND (
        (cs.internal_name IS NOT NULL AND i.internal_name IS NOT NULL AND cs.internal_name = i.internal_name)
        OR
        (cs.name_en IS NOT NULL AND i.name IS NOT NULL AND cs.name_en = i.name)
      )
  `);

  const [dictionaryResult] = await connection.query(`
    UPDATE crafting_stations
    SET
      name_zh = CASE name_en
        ${buildCaseWhenSql(STATION_NAME_MAP)}
        ELSE name_zh
      END,
      updated_at = NOW()
    WHERE deleted = 0
      AND (name_zh IS NULL OR TRIM(name_zh) = '')
      AND name_en IN (${stationInListSql})
  `);

  return Number(autoResult?.affectedRows ?? 0) + Number(dictionaryResult?.affectedRows ?? 0);
}

async function applyIngredientBackfill(connection) {
  const [result] = await connection.query(`
    UPDATE recipe_ingredients ri
    JOIN items i ON i.id = ri.ingredient_item_id
    SET
      ri.ingredient_name_raw = i.name_zh,
      ri.updated_at = NOW()
    WHERE i.name_zh IS NOT NULL
      AND TRIM(i.name_zh) <> ''
      AND (
        ri.ingredient_name_raw IS NULL
        OR TRIM(ri.ingredient_name_raw) = ''
        OR TRIM(ri.ingredient_name_raw) <> TRIM(i.name_zh)
      )
  `);
  return Number(result?.affectedRows ?? 0);
}

async function applyStationBackfill(connection) {
  const stationInListSql = buildInListSql(STATION_NAME_MAP);
  const [linkedResult] = await connection.query(`
    UPDATE recipe_stations rs
    LEFT JOIN items i ON i.id = rs.station_item_id
    LEFT JOIN crafting_stations cs ON cs.id = rs.station_id
    SET
      rs.station_name_raw = COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), '')),
      rs.updated_at = NOW()
    WHERE COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), '')) IS NOT NULL
      AND (
        rs.station_name_raw IS NULL
        OR TRIM(rs.station_name_raw) = ''
        OR TRIM(rs.station_name_raw) <> COALESCE(NULLIF(TRIM(i.name_zh), ''), NULLIF(TRIM(cs.name_zh), ''))
      )
  `);

  const [dictionaryResult] = await connection.query(`
    UPDATE recipe_stations
    SET
      station_name_raw = CASE station_name_raw
        ${buildCaseWhenSql(STATION_NAME_MAP)}
        ELSE station_name_raw
      END,
      updated_at = NOW()
    WHERE station_name_raw IN (${stationInListSql})
      AND station_name_raw <> CASE station_name_raw
        ${buildCaseWhenSql(STATION_NAME_MAP)}
        ELSE station_name_raw
      END
  `);

  return Number(linkedResult?.affectedRows ?? 0) + Number(dictionaryResult?.affectedRows ?? 0);
}

function resolveDefaultDatabaseName() {
  if (toText(process.env.TERRAPEDIA_DB_NAME)) return process.env.TERRAPEDIA_DB_NAME;
  return 'terria_v1_local';
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function shouldSyncCraftingStationFromItem(row) {
  const internalName = toText(row?.internalName);
  const itemInternalName = toText(row?.itemInternalName);
  const nameEn = toText(row?.nameEn);
  const itemName = toText(row?.itemName);
  return (internalName && itemInternalName && internalName === itemInternalName)
    || (nameEn && itemName && nameEn === itemName);
}

function makeSqlPlaceholders(size) {
  return new Array(size).fill('?').join(', ');
}

function buildCaseWhenSql(map) {
  return [...map.entries()]
    .map(([from, to]) => `WHEN '${escapeSqlLiteral(from)}' THEN '${escapeSqlLiteral(to)}'`)
    .join('\n        ');
}

function buildInListSql(map) {
  return [...map.keys()]
    .map((value) => `'${escapeSqlLiteral(value)}'`)
    .join(', ');
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}
