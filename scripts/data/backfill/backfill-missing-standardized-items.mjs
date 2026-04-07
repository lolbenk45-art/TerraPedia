#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadStandardizedDataset } from '../lib/load-standardized-dataset.mjs';
import {
  CATEGORY_DEFINITIONS,
  getCategoryDisplayName,
  normalizeCategoryCode,
} from '../lib/item-category-normalization.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) args[body.slice(0, eq)] = body.slice(eq + 1);
    else args[body] = 'true';
  }
  return args;
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toTinyIntBoolean(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return 1;
  if (text === 'false' || text === '0' || text === 'no') return 0;
  return fallback;
}

function normalizeCode(value) {
  const text = toNullableString(value);
  return text ? text.toUpperCase() : null;
}

function normalizeInternalName(value, fallbackName = '') {
  const text = toNullableString(value);
  if (text) return text;
  const fallback = String(fallbackName || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return fallback || null;
}

function mapRarityToId(rarityId, rarityText) {
  const explicit = toNullableInteger(rarityId);
  if (explicit != null) return explicit;
  const rarity = String(rarityText || '').trim().toLowerCase();
  if (rarity === 'common' || rarity === '普通') return 1;
  if (rarity === 'uncommon' || rarity === 'rare' || rarity === '稀有') return 2;
  if (rarity === 'epic' || rarity === '史诗') return 3;
  if (rarity === 'legendary' || rarity === '传说') return 4;
  return null;
}

async function ensureTopLevelCategory(conn, code, name, sortOrder) {
  const [result] = await conn.execute(
    `INSERT INTO category (parent_id, name, code, top_type, sort, status, deleted)
     VALUES (0, ?, ?, 'ROOT', ?, 1, 0)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       name = VALUES(name),
       sort = VALUES(sort),
       status = 1,
       deleted = 0,
       updated_at = NOW()`,
    [name, code, sortOrder]
  );
  return Number(result.insertId);
}

async function ensureCategoryDefinition(conn, categoryByCode, definition) {
  const parentId = definition.parentCode
    ? (categoryByCode.get(definition.parentCode) ?? 0)
    : 0;
  const topType = definition.topType ?? '';
  const [result] = await conn.execute(
    `INSERT INTO category (parent_id, name, code, top_type, sort, status, deleted)
     VALUES (?, ?, ?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       parent_id = VALUES(parent_id),
       name = VALUES(name),
       top_type = VALUES(top_type),
       sort = VALUES(sort),
       status = 1,
       deleted = 0,
       updated_at = NOW()`,
    [parentId, definition.name, definition.code, topType, definition.sort]
  );
  const id = Number(result.insertId);
  categoryByCode.set(definition.code, id);
  return id;
}

async function loadCategoryCodeMap(conn) {
  const [rows] = await conn.query('SELECT id, code FROM category WHERE deleted = 0');
  const map = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    map.set(code, Number(row.id));
  }
  return map;
}

async function ensureItemCategories(conn, itemRecords, categoryByCode) {
  const codes = new Set();
  for (const raw of Array.isArray(itemRecords) ? itemRecords : []) {
    const code = normalizeCategoryCode(raw?.categoryCode);
    if (code) codes.add(code);
  }

  for (const definition of CATEGORY_DEFINITIONS) {
    await ensureCategoryDefinition(conn, categoryByCode, definition);
  }

  const missingCodes = [...codes].filter((code) => !categoryByCode.has(code));
  if (missingCodes.length === 0) return 0;

  const [[maxSortRow]] = await conn.query(
    `SELECT COALESCE(MAX(sort), 0) AS max_sort
       FROM category
      WHERE deleted = 0
        AND (parent_id = 0 OR parent_id IS NULL)`
  );
  let nextSort = Number(maxSortRow?.max_sort ?? 0);
  let created = 0;

  for (const code of missingCodes.sort()) {
    const displayName = getCategoryDisplayName(code) ?? code;
    nextSort += 1;
    const id = await ensureTopLevelCategory(conn, code, displayName, nextSort);
    categoryByCode.set(code, id);
    created += 1;
  }

  return created;
}

async function loadItemLookup(conn) {
  const [rows] = await conn.query('SELECT id, internal_name, name FROM items WHERE deleted = 0');
  const byInternal = new Map();
  const byName = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const internalName = normalizeInternalName(row.internal_name);
    const name = toNullableString(row.name);
    if (internalName) byInternal.set(internalName, id);
    if (name) byName.set(name.toLowerCase(), id);
  }
  return { rows, byInternal, byName };
}

function buildItemPayload(raw, categoryByCode) {
  const name = toNullableString(raw?.name);
  const internalName = normalizeInternalName(raw?.internalName, name ?? '');
  const categoryCode = normalizeCategoryCode(raw?.categoryCode);
  const categoryId = categoryCode ? categoryByCode.get(categoryCode) : null;
  if (!name || !internalName || !categoryId) {
    return null;
  }

  const stackObj = raw?.stack ?? {};
  const statsObj = raw?.stats ?? {};
  const economyObj = raw?.economy ?? {};

  return {
    name,
    internalName,
    image: toNullableString(raw?.image ?? raw?.imageUrl ?? raw?.image_url),
    categoryId,
    description: toNullableString(raw?.description),
    damage: toNullableInteger(statsObj.damage ?? raw?.damage),
    defense: toNullableInteger(statsObj.defense ?? raw?.defense),
    knockback: toNullableInteger(statsObj.knockback ?? raw?.knockback),
    useTime: toNullableInteger(statsObj.useTime ?? raw?.useTime ?? raw?.use_time),
    width: toNullableInteger(statsObj.width ?? raw?.width),
    height: toNullableInteger(statsObj.height ?? raw?.height),
    buy: toNullableInteger(economyObj.buy ?? raw?.buy),
    sell: toNullableInteger(economyObj.sell ?? raw?.sell),
    tooltip: toNullableString(raw?.tooltip),
    rarityId: mapRarityToId(raw?.rarityId, raw?.rarity),
    gamePeriodId: toNullableInteger(raw?.gamePeriodId ?? raw?.game_period_id),
    gameModelId: toNullableInteger(raw?.gameModelId ?? raw?.game_model_id),
    isStackable: toTinyIntBoolean(stackObj.isStackable ?? raw?.isStackable ?? raw?.is_stackable, 0),
    stackSize: toNullableInteger(stackObj.stackSize ?? raw?.stackSize ?? raw?.stack_size) ?? 1,
    status: toNullableInteger(raw?.status) ?? 1,
    categoryCode,
  };
}

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const dataRoot = args.dataRoot || 'G:\\ClaudeCode\\data\\terraPedia\\standardized';
const output = args.output || path.join(repoRoot, 'reports', `items标准化补全汇总_${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const itemsDataset = loadStandardizedDataset(dataRoot, 'items');
const itemRecords = Array.isArray(itemsDataset.records) ? itemsDataset.records : [];

const conn = await mysql.createConnection(db);

try {
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    dataRoot,
    db,
    standardizedCount: itemRecords.length,
    dbCountBefore: 0,
    missingStandardizedItems: 0,
    extraDbItems: 0,
    categoryCreated: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    sampleMissing: [],
    sampleExtraDb: [],
  };

  if (apply) {
    await conn.beginTransaction();
  }

  const categoryByCode = await loadCategoryCodeMap(conn);
  summary.categoryCreated = await ensureItemCategories(conn, itemRecords, categoryByCode);

  const lookup = await loadItemLookup(conn);
  summary.dbCountBefore = lookup.rows.length;

  const standardizedInternalNames = new Set();

  for (const raw of itemRecords) {
    const payload = buildItemPayload(raw, categoryByCode);
    if (!payload) {
      summary.skippedInvalid += 1;
      continue;
    }
    standardizedInternalNames.add(payload.internalName);

    const exists = lookup.byInternal.has(payload.internalName);
    if (exists) {
      summary.skippedExisting += 1;
      continue;
    }

    if (summary.sampleMissing.length < 40) {
      summary.sampleMissing.push({
        internalName: payload.internalName,
        name: payload.name,
        categoryCode: payload.categoryCode,
      });
    }

    if (apply) {
      const [result] = await conn.execute(
        `INSERT INTO items
          (name, internal_name, image, category_id, description, damage, defense, knockback, use_time, width, height, buy, sell, tooltip, rarity_id, game_period_id, game_model_id, is_stackable, stack_size, status, deleted)
         VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          payload.name,
          payload.internalName,
          payload.image,
          payload.categoryId,
          payload.description,
          payload.damage,
          payload.defense,
          payload.knockback,
          payload.useTime,
          payload.width,
          payload.height,
          payload.buy,
          payload.sell,
          payload.tooltip,
          payload.rarityId,
          payload.gamePeriodId,
          payload.gameModelId,
          payload.isStackable,
          payload.stackSize,
          payload.status,
        ]
      );
      const insertedId = Number(result.insertId);
      lookup.byInternal.set(payload.internalName, insertedId);
      lookup.byName.set(payload.name.toLowerCase(), insertedId);
    }

    summary.inserted += 1;
  }

  summary.missingStandardizedItems = summary.inserted;

  for (const row of lookup.rows) {
    const internalName = normalizeInternalName(row.internal_name);
    if (internalName && !standardizedInternalNames.has(internalName)) {
      summary.extraDbItems += 1;
      if (summary.sampleExtraDb.length < 40) {
        summary.sampleExtraDb.push({
          id: Number(row.id),
          internalName,
          name: toNullableString(row.name),
        });
      }
    }
  }

  if (apply) {
    await conn.commit();
  }

  const reportDir = path.dirname(output);
  await fs.promises.mkdir(reportDir, { recursive: true });
  await fs.promises.writeFile(output, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  throw error;
} finally {
  await conn.end();
}
