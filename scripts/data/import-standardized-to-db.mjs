#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isStandardizedViewDir, loadStandardizedDataset } from './lib/load-standardized-dataset.mjs';
import {
  CATEGORY_DEFINITIONS,
  getCategoryDisplayName,
  normalizeCategoryCode,
} from './lib/item-category-normalization.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      args[body] = 'true';
    }
  }
  return args;
}

function extractDatabaseNameFromJdbcUrl(jdbcUrl) {
  if (!jdbcUrl) return null;
  const match = String(jdbcUrl).match(/jdbc:mysql:\/\/[^/]+\/([^?]+)/i);
  return match?.[1] ?? null;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadOptionalJson(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Optional JSON file not found: ${filePath}`);
  }
  return loadJson(filePath);
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isManagedAssetUrl(value) {
  const text = toNullableString(value);
  return text ? text.includes('/terrapedia-images/') : false;
}

function choosePreferredItemImage(incomingImage, existingImage) {
  const incoming = toNullableString(incomingImage);
  const existing = toNullableString(existingImage);
  if (isManagedAssetUrl(existing) && !isManagedAssetUrl(incoming)) {
    return existing;
  }
  return incoming ?? existing;
}

function choosePreferredInteger(incomingValue, existingValue) {
  const incoming = toNullableInteger(incomingValue);
  if (incoming != null) return incoming;
  return toNullableInteger(existingValue);
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toNullableDecimal(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function toTinyIntBoolean(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return 1;
  if (text === 'false' || text === '0' || text === 'no') return 0;
  return fallback;
}

function toDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizePositiveSortOrder(value, fallback) {
  const explicitSortOrder = toNullableInteger(value);
  if (explicitSortOrder != null && explicitSortOrder > 0) return explicitSortOrder;
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

function makeStatsSection() {
  return { input: 0, created: 0, updated: 0, skipped: 0, errors: [] };
}

function makeSummary() {
  return {
    categorySync: makeStatsSection(),
    items: makeStatsSection(),
    biomes: makeStatsSection(),
    biomeRelations: makeStatsSection(),
    biomeResources: makeStatsSection(),
    itemBiomes: makeStatsSection(),
    itemImages: makeStatsSection(),
    itemSources: makeStatsSection(),
    recipes: makeStatsSection(),
    recipeIngredients: makeStatsSection(),
    recipeStations: makeStatsSection(),
    snapshots: makeStatsSection(),
    itemImageBackfill: makeStatsSection(),
    sortNormalization: {
      item_images: 0,
      item_acquisition_sources: 0,
      item_biomes: 0,
      biome_resources: 0,
      recipe_ingredients: 0,
      recipe_stations: 0,
    },
  };
}

async function ensureRelationTextColumns(conn) {
  await conn.query(
    `ALTER TABLE item_acquisition_sources
        MODIFY COLUMN quantity_text TEXT DEFAULT NULL,
        MODIFY COLUMN chance_text TEXT DEFAULT NULL`
  );
}

function pushError(sectionStats, message) {
  sectionStats.errors.push(message);
}

function getItemId(itemLookup, internalName, itemName) {
  const internalKey = normalizeInternalName(internalName);
  if (internalKey && itemLookup.byInternal.has(internalKey)) {
    return itemLookup.byInternal.get(internalKey);
  }
  const nameKey = toNullableString(itemName)?.toLowerCase();
  if (nameKey && itemLookup.byName.has(nameKey)) {
    return itemLookup.byName.get(nameKey);
  }
  return null;
}

async function loadCategoryCodeMap(conn) {
  const [rows] = await conn.query(
    'SELECT id, code FROM category WHERE deleted = 0'
  );
  const map = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    map.set(code, Number(row.id));
  }
  return map;
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

async function ensureKnownCategories(conn, categoryByCode) {
  for (const definition of CATEGORY_DEFINITIONS) {
    await ensureCategoryDefinition(conn, categoryByCode, definition);
  }
}

async function ensureItemCategories(conn, itemRecords, categoryByCode, stats) {
  const codes = new Set();
  const records = Array.isArray(itemRecords) ? itemRecords : [];
  for (const raw of records) {
    const code = normalizeCategoryCode(raw?.categoryCode);
    if (code) codes.add(code);
  }

  stats.input = codes.size;
  if (codes.size === 0) return;

  await ensureKnownCategories(conn, categoryByCode);

  const missingCodes = [...codes].filter((code) => !categoryByCode.has(code));
  if (missingCodes.length === 0) return;

  const [[maxSortRow]] = await conn.query(
    `SELECT COALESCE(MAX(sort), 0) AS max_sort
       FROM category
      WHERE deleted = 0
        AND (parent_id = 0 OR parent_id IS NULL)`
  );
  let nextSort = Number(maxSortRow?.max_sort ?? 0);

  for (const code of missingCodes.sort()) {
    const displayName = getCategoryDisplayName(code) ?? code;
    nextSort += 1;
    const id = await ensureTopLevelCategory(conn, code, displayName, nextSort);
    categoryByCode.set(code, id);
    stats.created += 1;
  }
}

async function loadItemLookup(conn) {
  const [rows] = await conn.query(
    'SELECT id, internal_name, name, name_zh, image, game_period_id, game_model_id FROM items WHERE deleted = 0'
  );
  const byInternal = new Map();
  const byName = new Map();
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const internalName = normalizeInternalName(row.internal_name);
    const name = toNullableString(row.name);
    const nameZh = toNullableString(row.name_zh);
    if (internalName) byInternal.set(internalName, id);
    if (name) byName.set(name.toLowerCase(), id);
    byId.set(id, {
      id,
      internalName,
      name,
      nameZh,
      image: toNullableString(row.image),
      gamePeriodId: toNullableInteger(row.game_period_id),
      gameModelId: toNullableInteger(row.game_model_id),
    });
  }
  return { byInternal, byName, byId };
}

async function loadBiomeCodeMap(conn) {
  const [rows] = await conn.query('SELECT id, code FROM biomes WHERE deleted = 0');
  const map = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    map.set(code, Number(row.id));
  }
  return map;
}

async function importItems(conn, records, categoryByCode, stats) {
  stats.input = Array.isArray(records) ? records.length : 0;
  if (!Array.isArray(records) || records.length === 0) return;

  const existingLookup = await loadItemLookup(conn);

  for (let i = 0; i < records.length; i += 1) {
    const raw = records[i];
    const name = toNullableString(raw?.name);
    const internalName = normalizeInternalName(raw?.internalName, name ?? '');
    const categoryCode = normalizeCategoryCode(raw?.categoryCode);
    const categoryId = categoryCode ? categoryByCode.get(categoryCode) : null;

    if (!name || !internalName || !categoryId) {
      stats.skipped += 1;
      pushError(
        stats,
        `items[${i}] skipped: missing name/internalName/categoryCode(categoryId), name=${name ?? ''}, internalName=${internalName ?? ''}, categoryCode=${categoryCode ?? ''}`
      );
      continue;
    }

    const hasExplicitInternalName = toNullableString(raw?.internalName) != null;
    const existingId = existingLookup.byInternal.get(internalName)
      ?? (!hasExplicitInternalName ? (existingLookup.byName.get(name.toLowerCase()) ?? null) : null);
    const existingItem = existingId != null ? existingLookup.byId.get(existingId) ?? null : null;

    const stackObj = raw?.stack ?? {};
    const statsObj = raw?.stats ?? {};
    const economyObj = raw?.economy ?? {};

    const payload = {
      name,
      internalName,
      image: choosePreferredItemImage(raw?.image ?? raw?.imageUrl ?? raw?.image_url, existingItem?.image),
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
      gamePeriodId: choosePreferredInteger(raw?.gamePeriodId ?? raw?.game_period_id, existingItem?.gamePeriodId),
      gameModelId: choosePreferredInteger(raw?.gameModelId ?? raw?.game_model_id, existingItem?.gameModelId),
      isStackable: toTinyIntBoolean(stackObj.isStackable ?? raw?.isStackable ?? raw?.is_stackable, 0),
      stackSize: toNullableInteger(stackObj.stackSize ?? raw?.stackSize ?? raw?.stack_size) ?? 1,
      status: toNullableInteger(raw?.status) ?? 1,
    };

    if (existingId != null) {
      await conn.execute(
        `UPDATE items
           SET name = ?,
               internal_name = ?,
               image = ?,
               category_id = ?,
               description = ?,
               damage = ?,
               defense = ?,
               knockback = ?,
               use_time = ?,
               width = ?,
               height = ?,
               buy = ?,
               sell = ?,
               tooltip = ?,
               rarity_id = ?,
               game_period_id = ?,
               game_model_id = ?,
               is_stackable = ?,
               stack_size = ?,
               status = ?,
               deleted = 0,
               updated_at = NOW()
         WHERE id = ?`,
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
          existingId,
        ]
      );
      existingLookup.byId.set(existingId, {
        ...(existingItem ?? {}),
        id: existingId,
        internalName: payload.internalName,
        name: payload.name,
        nameZh: existingItem?.nameZh ?? null,
        image: payload.image,
        gamePeriodId: payload.gamePeriodId,
        gameModelId: payload.gameModelId,
      });
      stats.updated += 1;
      continue;
    }

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
    existingLookup.byInternal.set(payload.internalName, insertedId);
    existingLookup.byName.set(payload.name.toLowerCase(), insertedId);
    existingLookup.byId.set(insertedId, {
      id: insertedId,
      internalName: payload.internalName,
      name: payload.name,
      nameZh: null,
      image: payload.image,
      gamePeriodId: payload.gamePeriodId,
      gameModelId: payload.gameModelId,
    });
    stats.created += 1;
  }
}

async function upsertItemRecord(conn, itemLookup, payload, stats) {
  const name = toNullableString(payload.name) ?? payload.internalName;
  const existingId = itemLookup.byInternal.get(payload.internalName) ?? null;
  const existingItem = existingId != null ? itemLookup.byId.get(existingId) ?? null : null;

  const normalizedPayload = {
    name,
    internalName: payload.internalName,
    image: choosePreferredItemImage(payload.image, existingItem?.image),
    categoryId: payload.categoryId,
    description: toNullableString(payload.description),
    damage: toNullableInteger(payload.damage),
    defense: toNullableInteger(payload.defense),
    knockback: toNullableInteger(payload.knockback),
    useTime: toNullableInteger(payload.useTime),
    width: toNullableInteger(payload.width),
    height: toNullableInteger(payload.height),
    buy: toNullableInteger(payload.buy),
    sell: toNullableInteger(payload.sell),
    tooltip: toNullableString(payload.tooltip),
    rarityId: toNullableInteger(payload.rarityId),
    gamePeriodId: choosePreferredInteger(payload.gamePeriodId, existingItem?.gamePeriodId),
    gameModelId: choosePreferredInteger(payload.gameModelId, existingItem?.gameModelId),
    isStackable: toTinyIntBoolean(payload.isStackable, 0),
    stackSize: toNullableInteger(payload.stackSize) ?? 1,
    status: toNullableInteger(payload.status) ?? 1,
  };

  if (existingId != null) {
    await conn.execute(
      `UPDATE items
         SET name = ?,
             internal_name = ?,
             image = ?,
             category_id = ?,
             description = ?,
             damage = ?,
             defense = ?,
             knockback = ?,
             use_time = ?,
             width = ?,
             height = ?,
             buy = ?,
             sell = ?,
             tooltip = ?,
             rarity_id = ?,
             game_period_id = ?,
             game_model_id = ?,
             is_stackable = ?,
             stack_size = ?,
             status = ?,
             deleted = 0,
             updated_at = NOW()
       WHERE id = ?`,
      [
        normalizedPayload.name,
        normalizedPayload.internalName,
        normalizedPayload.image,
        normalizedPayload.categoryId,
        normalizedPayload.description,
        normalizedPayload.damage,
        normalizedPayload.defense,
        normalizedPayload.knockback,
        normalizedPayload.useTime,
        normalizedPayload.width,
        normalizedPayload.height,
        normalizedPayload.buy,
        normalizedPayload.sell,
        normalizedPayload.tooltip,
        normalizedPayload.rarityId,
        normalizedPayload.gamePeriodId,
        normalizedPayload.gameModelId,
        normalizedPayload.isStackable,
        normalizedPayload.stackSize,
        normalizedPayload.status,
        existingId,
      ]
    );
    itemLookup.byId.set(existingId, {
      ...(existingItem ?? {}),
      id: existingId,
      internalName: normalizedPayload.internalName,
      name: normalizedPayload.name,
      nameZh: existingItem?.nameZh ?? null,
      image: normalizedPayload.image,
      gamePeriodId: normalizedPayload.gamePeriodId,
      gameModelId: normalizedPayload.gameModelId,
    });
    stats.updated += 1;
    return;
  }

  const [insertResult] = await conn.execute(
    `INSERT INTO items
      (name, internal_name, image, category_id, description, damage, defense, knockback, use_time, width, height, buy, sell, tooltip, rarity_id, game_period_id, game_model_id, is_stackable, stack_size, status, deleted)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      normalizedPayload.name,
      normalizedPayload.internalName,
      normalizedPayload.image,
      normalizedPayload.categoryId,
      normalizedPayload.description,
      normalizedPayload.damage,
      normalizedPayload.defense,
      normalizedPayload.knockback,
      normalizedPayload.useTime,
      normalizedPayload.width,
      normalizedPayload.height,
      normalizedPayload.buy,
      normalizedPayload.sell,
      normalizedPayload.tooltip,
      normalizedPayload.rarityId,
      normalizedPayload.gamePeriodId,
      normalizedPayload.gameModelId,
      normalizedPayload.isStackable,
      normalizedPayload.stackSize,
      normalizedPayload.status,
    ]
  );
  const insertedId = Number(insertResult.insertId);
  itemLookup.byInternal.set(normalizedPayload.internalName, insertedId);
  if (normalizedPayload.name) {
    itemLookup.byName.set(normalizedPayload.name.toLowerCase(), insertedId);
  }
  itemLookup.byId.set(insertedId, {
    id: insertedId,
    internalName: normalizedPayload.internalName,
    name: normalizedPayload.name,
    nameZh: null,
    image: normalizedPayload.image,
    gamePeriodId: normalizedPayload.gamePeriodId,
    gameModelId: normalizedPayload.gameModelId,
  });
  stats.created += 1;
}

function buildBuffItemPayload(raw) {
  const name = toNullableString(raw?.localized?.zh?.name)
    ?? toNullableString(raw?.localized?.en?.name)
    ?? toNullableString(raw?.englishName)
    ?? toNullableString(raw?.internalName)
    ?? `Buff ${raw?.id ?? ''}`;
  const internalBase = normalizeInternalName(raw?.internalName ?? raw?.englishName ?? raw?.id, name);
  return {
    categoryCode: 'BUFF',
    internalName: `BUFF_${internalBase}`,
    name,
    image: raw?.image,
    description: `Buff ID ${raw?.id ?? ''}; source items: ${toNullableInteger(raw?.sourceItemCount) ?? 0}; immune npc count: ${toNullableInteger(raw?.immuneNpcCount) ?? 0}`,
    tooltip: toNullableString(raw?.localized?.zh?.tooltip) ?? toNullableString(raw?.localized?.en?.tooltip),
    isStackable: 0,
    stackSize: 1,
    status: 1,
  };
}

function buildNpcItemPayload(raw) {
  const name = toNullableString(raw?.name) ?? toNullableString(raw?.internalName) ?? `NPC ${raw?.id ?? ''}`;
  const internalBase = normalizeInternalName(raw?.internalName ?? raw?.name ?? raw?.id, name);
  return {
    categoryCode: 'NPC',
    internalName: `NPC_${internalBase}`,
    name,
    description: `NPC ID ${raw?.id ?? ''}; NetID ${raw?.netID ?? ''}; Type ${raw?.type ?? ''}`,
    damage: raw?.combat?.damage,
    defense: raw?.combat?.defense,
    width: raw?.dimensions?.width,
    height: raw?.dimensions?.height,
    sell: raw?.economy?.value,
    tooltip: toNullableString(raw?.buffImmune),
    isStackable: 0,
    stackSize: 1,
    status: 1,
  };
}

function buildProjectileItemPayload(raw) {
  const name = toNullableString(raw?.name) ?? toNullableString(raw?.internalName) ?? `Projectile ${raw?.id ?? ''}`;
  const internalBase = normalizeInternalName(raw?.internalName ?? raw?.name ?? raw?.id, name);
  return {
    categoryCode: 'PROJECTILE',
    internalName: `PROJECTILE_${internalBase}`,
    name,
    description: `Projectile ID ${raw?.id ?? ''}; aiStyle ${raw?.aiStyle ?? ''}`,
    damage: raw?.combat?.damage,
    knockback: raw?.combat?.knockBack,
    width: raw?.dimensions?.width,
    height: raw?.dimensions?.height,
    useTime: raw?.lifecycle?.timeLeft,
    isStackable: 0,
    stackSize: 1,
    status: 1,
  };
}

function buildArmorSetItemPayload(raw, index) {
  const name = toNullableString(raw?.textKey) ?? `Armor Set ${index + 1}`;
  const internalBase = normalizeInternalName(raw?.textKey ?? raw?.benefitExpression ?? index + 1, name);
  const uniqueCount = Array.isArray(raw?.uniqueItemIds) ? raw.uniqueItemIds.length : 0;
  return {
    categoryCode: 'ARMOR_SET',
    internalName: `ARMOR_SET_${internalBase}`,
    name,
    description: `benefit=${toNullableString(raw?.benefitExpression) ?? ''}; uniqueItems=${uniqueCount}; setCount=${toNullableInteger(raw?.setCount) ?? 0}`,
    tooltip: toNullableString(raw?.benefitExpression),
    isStackable: 0,
    stackSize: 1,
    status: 1,
  };
}

async function importExternalEntityRecords(conn, records, itemLookup, categoryByCode, stats, builder, label) {
  stats.input = Array.isArray(records) ? records.length : 0;
  if (!Array.isArray(records) || records.length === 0) return;

  for (let i = 0; i < records.length; i += 1) {
    const raw = records[i];
    const payload = builder(raw, i);
    const categoryCode = normalizeCategoryCode(payload.categoryCode);
    const categoryId = categoryCode ? categoryByCode.get(categoryCode) : null;
    if (!categoryId || !payload.internalName) {
      stats.skipped += 1;
      pushError(stats, `${label}[${i}] skipped: missing category/internalName`);
      continue;
    }

    try {
      await upsertItemRecord(conn, itemLookup, { ...payload, categoryId }, stats);
    } catch (error) {
      stats.skipped += 1;
      pushError(stats, `${label}[${i}] failed: ${error?.message ?? String(error)}`);
    }
  }
}

async function importBiomes(conn, biomeRecords, stats) {
  stats.input = Array.isArray(biomeRecords) ? biomeRecords.length : 0;
  if (!Array.isArray(biomeRecords) || biomeRecords.length === 0) return new Map();

  for (let i = 0; i < biomeRecords.length; i += 1) {
    const raw = biomeRecords[i];
    const code = normalizeCode(raw?.code ?? raw?.biomeCode);
    if (!code) {
      stats.skipped += 1;
      pushError(stats, `biomes[${i}] skipped: missing code`);
      continue;
    }

    const nameEn = toNullableString(raw?.nameEn ?? raw?.pageTitle ?? code) ?? code;

    await conn.execute(
      `INSERT INTO biomes
        (code, name_en, name_zh, alias_en, alias_zh, layer_type, biome_type, description, icon_url, source_provider, source_page, source_revision_timestamp, last_synced_at, status, deleted)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
       ON DUPLICATE KEY UPDATE
        name_en = VALUES(name_en),
        name_zh = VALUES(name_zh),
        alias_en = VALUES(alias_en),
        alias_zh = VALUES(alias_zh),
        layer_type = VALUES(layer_type),
        biome_type = VALUES(biome_type),
        description = VALUES(description),
        icon_url = VALUES(icon_url),
        source_provider = VALUES(source_provider),
        source_page = VALUES(source_page),
        source_revision_timestamp = VALUES(source_revision_timestamp),
        last_synced_at = VALUES(last_synced_at),
        status = 1,
        deleted = 0,
        updated_at = NOW()`,
      [
        code.toLowerCase(),
        nameEn,
        toNullableString(raw?.nameZh),
        toNullableString(raw?.aliasEn),
        toNullableString(raw?.aliasZh),
        toNullableString(raw?.layerType),
        toNullableString(raw?.biomeType),
        toNullableString(raw?.description),
        toNullableString(raw?.iconUrl),
        toNullableString(raw?.sourceProvider) ?? 'wiki_gg',
        toNullableString(raw?.sourcePage ?? raw?.pageTitle),
        toDateTime(raw?.sourceRevisionTimestamp ?? raw?.revisionTimestamp),
        toDateTime(raw?.lastSyncedAt ?? raw?.fetchedAt),
      ]
    );

    stats.updated += 1;
  }

  return loadBiomeCodeMap(conn);
}

async function importBiomeRelationsAndResources(conn, biomeRecords, biomeByCode, itemLookup, relationStats, resourceStats) {
  if (!Array.isArray(biomeRecords)) return;
  relationStats.input = 0;
  resourceStats.input = 0;

  for (const raw of biomeRecords) {
    const biomeCode = normalizeCode(raw?.code ?? raw?.biomeCode);
    const biomeId = biomeCode ? biomeByCode.get(biomeCode.toLowerCase()) ?? biomeByCode.get(biomeCode) : null;
    if (!biomeId) continue;

    const relations = Array.isArray(raw?.relations) ? raw.relations : [];
    relationStats.input += relations.length;
    for (const relation of relations) {
      const relatedCode = normalizeCode(relation?.relatedBiomeCode);
      const relatedId = relatedCode ? (biomeByCode.get(relatedCode.toLowerCase()) ?? biomeByCode.get(relatedCode)) : null;
      const relationType = toNullableString(relation?.relationType);
      if (!relatedId || !relationType || relatedId === biomeId) {
        relationStats.skipped += 1;
        continue;
      }
      await conn.execute(
        `INSERT INTO biome_relations (biome_id, related_biome_id, relation_type, notes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE notes = VALUES(notes), updated_at = NOW()`,
        [biomeId, relatedId, relationType, toNullableString(relation?.notes)]
      );
      relationStats.updated += 1;
    }

    const resources = Array.isArray(raw?.resources) ? raw.resources : [];
    resourceStats.input += resources.length;
    for (const [index, resource] of resources.entries()) {
      const itemId = getItemId(itemLookup, resource?.itemInternalName, resource?.itemName);
      const resourceNameRaw = toNullableString(resource?.resourceNameRaw ?? resource?.itemName);
      const resourceType = toNullableString(resource?.resourceType) ?? 'feature';
      const sortOrder = normalizePositiveSortOrder(resource?.sortOrder, index + 1);
      const [existingRows] = await conn.execute(
        `SELECT id
           FROM biome_resources
          WHERE biome_id = ?
            AND COALESCE(item_id, 0) = ?
            AND COALESCE(resource_name_raw, '') = ?
            AND resource_type = ?
            AND sort_order = ?
          LIMIT 1`,
        [biomeId, itemId ?? 0, resourceNameRaw ?? '', resourceType, sortOrder]
      );
      if (existingRows.length > 0) {
        await conn.execute(
          `UPDATE biome_resources
              SET item_id = ?,
                  notes = ?,
                  updated_at = NOW()
            WHERE id = ?`,
          [itemId, toNullableString(resource?.notes), Number(existingRows[0].id)]
        );
        resourceStats.updated += 1;
      } else {
        await conn.execute(
          `INSERT INTO biome_resources (biome_id, item_id, resource_name_raw, resource_type, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [biomeId, itemId, resourceNameRaw, resourceType, toNullableString(resource?.notes), sortOrder]
        );
        resourceStats.created += 1;
      }
    }
  }
}

async function importItemBiomes(conn, itemBiomeRecords, itemLookup, biomeByCode, stats) {
  stats.input = Array.isArray(itemBiomeRecords) ? itemBiomeRecords.length : 0;
  if (!Array.isArray(itemBiomeRecords)) return;

  for (const relation of itemBiomeRecords) {
    const itemId = getItemId(itemLookup, relation?.itemInternalName, relation?.itemName);
    const biomeCode = normalizeCode(relation?.biomeCode);
    const biomeId = biomeCode ? (biomeByCode.get(biomeCode.toLowerCase()) ?? biomeByCode.get(biomeCode)) : null;
    const relationType = toNullableString(relation?.relationType) ?? 'relevant_to';
    const sortOrder = normalizePositiveSortOrder(relation?.sortOrder, 1);

    if (!itemId || !biomeId) {
      stats.skipped += 1;
      continue;
    }

    await conn.execute(
      `INSERT INTO item_biomes (item_id, biome_id, relation_type, notes, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), updated_at = NOW()`,
      [itemId, biomeId, relationType, toNullableString(relation?.notes), sortOrder]
    );
    stats.updated += 1;
  }
}

async function importItemImages(conn, imageRecords, itemLookup, stats) {
  stats.input = Array.isArray(imageRecords) ? imageRecords.length : 0;
  if (!Array.isArray(imageRecords)) return;
  const sortCounterByItem = new Map();

  for (const image of imageRecords) {
    const itemId = getItemId(itemLookup, image?.itemInternalName, image?.itemName);
    if (!itemId) {
      stats.skipped += 1;
      continue;
    }
    const autoSortOrder = (sortCounterByItem.get(itemId) ?? 0) + 1;
    sortCounterByItem.set(itemId, autoSortOrder);

    const role = toNullableString(image?.role) ?? 'icon';
    const provider = toNullableString(image?.provider) ?? 'wiki_gg';
    const sourcePage = toNullableString(image?.sourcePage);
    const cachedUrl = toNullableString(image?.cachedUrl);
    const normalizedSortOrder = normalizePositiveSortOrder(image?.sortOrder, autoSortOrder);

    const [existingRows] = await conn.execute(
      `SELECT id
         FROM item_images
         WHERE item_id = ?
           AND role = ?
           AND provider = ?
           AND COALESCE(source_page, '') = ?
           AND COALESCE(cached_url, '') = ?
           AND deleted = 0
         ORDER BY id ASC`,
      [itemId, role, provider, sourcePage ?? '', cachedUrl ?? '']
    );

    const payload = [
      itemId,
      role,
      provider,
      toNullableString(image?.sourceFileTitle),
      sourcePage,
      toDateTime(image?.sourceRevisionTimestamp),
      toNullableString(image?.originalUrl),
      cachedUrl,
      toNullableInteger(image?.width),
      toNullableInteger(image?.height),
      toNullableString(image?.contentType),
      toTinyIntBoolean(image?.isPrimary, 0),
      normalizedSortOrder,
      1,
      0,
    ];

    if (existingRows.length > 0) {
      const preservedId = Number(existingRows[0].id);
      await conn.execute(
        `UPDATE item_images
            SET item_id = ?,
                role = ?,
                provider = ?,
                source_file_title = ?,
                source_page = ?,
                source_revision_timestamp = ?,
                original_url = ?,
                cached_url = ?,
                width = ?,
                height = ?,
                content_type = ?,
                is_primary = ?,
                sort_order = ?,
                status = ?,
                deleted = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [...payload, preservedId]
      );
      const duplicateIds = existingRows
        .slice(1)
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id));
      if (duplicateIds.length > 0) {
        const placeholders = duplicateIds.map(() => '?').join(', ');
        await conn.execute(
          `UPDATE item_images
              SET deleted = 1,
                  status = 0,
                  updated_at = NOW()
            WHERE id IN (${placeholders})`,
          duplicateIds
        );
      }
      stats.updated += 1;
    } else {
      await conn.execute(
        `INSERT INTO item_images
          (item_id, role, provider, source_file_title, source_page, source_revision_timestamp, original_url, cached_url, width, height, content_type, is_primary, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        payload
      );
      stats.created += 1;
    }
  }
}

async function backfillItemsPrimaryImage(conn, stats) {
  const [[source]] = await conn.query(
    `SELECT COUNT(DISTINCT item_id) AS item_count
       FROM item_images
      WHERE deleted = 0
        AND status = 1
        AND cached_url IS NOT NULL
        AND TRIM(cached_url) <> ''`
  );
  stats.input = Number(source?.item_count ?? 0);

  const [result] = await conn.query(
    `UPDATE items i
       JOIN (
         SELECT item_id, cached_url
         FROM (
           SELECT
             ii.item_id,
           ii.cached_url,
           ROW_NUMBER() OVER (
               PARTITION BY ii.item_id
               ORDER BY
                 CASE WHEN LOCATE('/terrapedia-images/', ii.cached_url) > 0 THEN 0 ELSE 1 END,
                 CASE WHEN ii.is_primary = 1 THEN 0 ELSE 1 END,
                 ii.sort_order ASC,
                 ii.id ASC
            ) AS rn
          FROM item_images ii
          WHERE ii.deleted = 0
             AND ii.status = 1
             AND ii.cached_url IS NOT NULL
             AND TRIM(ii.cached_url) <> ''
         ) ranked
         WHERE rn = 1
       ) best ON best.item_id = i.id
       SET i.image = best.cached_url,
           i.updated_at = NOW()
     WHERE i.deleted = 0
       AND (
         i.image IS NULL
         OR TRIM(i.image) = ''
         OR (i.image COLLATE utf8mb4_unicode_ci) <> (best.cached_url COLLATE utf8mb4_unicode_ci)
       )`
  );
  stats.updated = Number(result?.affectedRows ?? 0);
}

async function normalizeRelationSortOrders(conn, stats) {
  const updates = {
    item_images: `
      UPDATE item_images target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY item_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM item_images
        WHERE deleted = 0
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.deleted = 0
        AND (target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort)`,
    item_acquisition_sources: `
      UPDATE item_acquisition_sources target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY item_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM item_acquisition_sources
        WHERE deleted = 0
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.deleted = 0
        AND (target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort)`,
    item_biomes: `
      UPDATE item_biomes target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY item_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM item_biomes
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`,
    biome_resources: `
      UPDATE biome_resources target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY biome_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM biome_resources
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`,
    recipe_ingredients: `
      UPDATE recipe_ingredients target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY recipe_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM recipe_ingredients
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`,
    recipe_stations: `
      UPDATE recipe_stations target
      JOIN (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY recipe_id
            ORDER BY sort_order ASC, id ASC
          ) AS normalized_sort
        FROM recipe_stations
      ) ranked ON ranked.id = target.id
      SET target.sort_order = ranked.normalized_sort,
          target.updated_at = NOW()
      WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`,
  };

  for (const [key, sql] of Object.entries(updates)) {
    const [result] = await conn.query(sql);
    stats[key] = Number(result?.affectedRows ?? 0);
  }
}

async function importItemSources(conn, sourceRecords, itemLookup, biomeByCode, stats) {
  stats.input = Array.isArray(sourceRecords) ? sourceRecords.length : 0;
  if (!Array.isArray(sourceRecords)) return;

  for (const source of sourceRecords) {
    const itemId = getItemId(itemLookup, source?.itemInternalName, source?.itemName);
    if (!itemId) {
      stats.skipped += 1;
      continue;
    }

    const biomeCode = normalizeCode(source?.biomeCode);
    const biomeId = biomeCode ? (biomeByCode.get(biomeCode.toLowerCase()) ?? biomeByCode.get(biomeCode)) : null;

    const sourceType = toNullableString(source?.sourceType) ?? 'unknown';
    const sourceRefType = toNullableString(source?.sourceRefType);
    const sourceRefName = toNullableString(source?.sourceRefName);
    const sourcePage = toNullableString(source?.sourcePage);
    const sortOrder = normalizePositiveSortOrder(source?.sortOrder, 1);

    const [existingRows] = await conn.execute(
      `SELECT id
         FROM item_acquisition_sources
        WHERE item_id = ?
          AND source_type = ?
          AND COALESCE(source_ref_type, '') = ?
          AND COALESCE(source_ref_name, '') = ?
          AND COALESCE(source_page, '') = ?
          AND sort_order = ?
        LIMIT 1`,
      [itemId, sourceType, sourceRefType ?? '', sourceRefName ?? '', sourcePage ?? '', sortOrder]
    );

    const payload = [
      itemId,
      sourceType,
      sourceRefType,
      toNullableInteger(source?.sourceRefId),
      sourceRefName,
      biomeId,
      toNullableInteger(source?.quantityMin),
      toNullableInteger(source?.quantityMax),
      toNullableString(source?.quantityText),
      toNullableDecimal(source?.chanceValue),
      toNullableString(source?.chanceText),
      toNullableString(source?.conditions),
      toNullableString(source?.notes),
      toNullableString(source?.sourceProvider) ?? 'wiki_gg',
      sourcePage,
      toDateTime(source?.sourceRevisionTimestamp),
      sortOrder,
      1,
      0,
    ];

    if (existingRows.length > 0) {
      await conn.execute(
        `UPDATE item_acquisition_sources
            SET item_id = ?,
                source_type = ?,
                source_ref_type = ?,
                source_ref_id = ?,
                source_ref_name = ?,
                biome_id = ?,
                quantity_min = ?,
                quantity_max = ?,
                quantity_text = ?,
                chance_value = ?,
                chance_text = ?,
                conditions = ?,
                notes = ?,
                source_provider = ?,
                source_page = ?,
                source_revision_timestamp = ?,
                sort_order = ?,
                status = ?,
                deleted = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [...payload, Number(existingRows[0].id)]
      );
      stats.updated += 1;
    } else {
      await conn.execute(
        `INSERT INTO item_acquisition_sources
          (item_id, source_type, source_ref_type, source_ref_id, source_ref_name, biome_id, quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        payload
      );
      stats.created += 1;
    }
  }
}

async function importRecipes(conn, recipeRecords, itemLookup, recipeStats, ingredientStats, stationStats) {
  recipeStats.input = Array.isArray(recipeRecords) ? recipeRecords.length : 0;
  if (!Array.isArray(recipeRecords)) return;

  for (const recipe of recipeRecords) {
    const resultItemId = getItemId(itemLookup, recipe?.resultInternalName, recipe?.resultName);
    if (!resultItemId) {
      recipeStats.skipped += 1;
      continue;
    }

    const sourceProvider = toNullableString(recipe?.sourceProvider) ?? 'wiki_gg';
    const sourcePage = toNullableString(recipe?.sourcePage);
    const versionScope = toNullableString(recipe?.versionScope);

    const [existingRows] = await conn.execute(
      `SELECT id
         FROM recipes
        WHERE result_item_id = ?
          AND COALESCE(source_provider, '') = ?
          AND COALESCE(source_page, '') = ?
          AND COALESCE(version_scope, '') = ?
        LIMIT 1`,
      [resultItemId, sourceProvider ?? '', sourcePage ?? '', versionScope ?? '']
    );

    let recipeId;
    if (existingRows.length > 0) {
      recipeId = Number(existingRows[0].id);
      await conn.execute(
        `UPDATE recipes
            SET result_internal_name = ?,
                result_quantity = ?,
                version_scope = ?,
                notes = ?,
                source_provider = ?,
                source_page = ?,
                source_revision_timestamp = ?,
                sort_order = ?,
                status = 1,
                deleted = 0,
                updated_at = NOW()
          WHERE id = ?`,
        [
          toNullableString(recipe?.resultInternalName),
          toNullableInteger(recipe?.resultQuantity) ?? 1,
          versionScope,
          toNullableString(recipe?.notes),
          sourceProvider,
          sourcePage,
          toDateTime(recipe?.sourceRevisionTimestamp),
          normalizePositiveSortOrder(recipe?.sortOrder, recipeStats.updated + recipeStats.created + 1),
          recipeId,
        ]
      );
      recipeStats.updated += 1;
    } else {
      const [insertResult] = await conn.execute(
        `INSERT INTO recipes
          (result_item_id, result_internal_name, result_quantity, version_scope, notes, source_provider, source_page, source_revision_timestamp, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          resultItemId,
          toNullableString(recipe?.resultInternalName),
          toNullableInteger(recipe?.resultQuantity) ?? 1,
          versionScope,
          toNullableString(recipe?.notes),
          sourceProvider,
          sourcePage,
          toDateTime(recipe?.sourceRevisionTimestamp),
          normalizePositiveSortOrder(recipe?.sortOrder, recipeStats.updated + recipeStats.created + 1),
        ]
      );
      recipeId = Number(insertResult.insertId);
      recipeStats.created += 1;
    }

    await conn.execute('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
    await conn.execute('DELETE FROM recipe_stations WHERE recipe_id = ?', [recipeId]);

    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    ingredientStats.input += ingredients.length;
    for (const [index, ingredient] of ingredients.entries()) {
      const ingredientItemId = getItemId(itemLookup, ingredient?.ingredientInternalName, ingredient?.ingredientName);
      const ingredientItem = ingredientItemId ? itemLookup.byId.get(ingredientItemId) : null;
      const ingredientNameRaw = ingredientItem?.nameZh
        ?? toNullableString(ingredient?.ingredientNameRaw ?? ingredient?.ingredientName);
      await conn.execute(
        `INSERT INTO recipe_ingredients
          (recipe_id, ingredient_item_id, ingredient_internal_name, ingredient_name_raw, ingredient_group_type, quantity_min, quantity_max, quantity_text, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          ingredientItemId,
          toNullableString(ingredient?.ingredientInternalName),
          ingredientNameRaw,
          toNullableString(ingredient?.ingredientGroupType) ?? 'item',
          toNullableInteger(ingredient?.quantityMin),
          toNullableInteger(ingredient?.quantityMax),
          toNullableString(ingredient?.quantityText),
          normalizePositiveSortOrder(ingredient?.sortOrder, index + 1),
        ]
      );
      ingredientStats.created += 1;
    }

    const stations = Array.isArray(recipe?.stations) ? recipe.stations : [];
    stationStats.input += stations.length;
    for (const [index, station] of stations.entries()) {
      const stationItemId = getItemId(itemLookup, station?.stationInternalName, station?.stationName);
      const stationItem = stationItemId ? itemLookup.byId.get(stationItemId) : null;
      const stationNameRaw = stationItem?.nameZh
        ?? toNullableString(station?.stationNameRaw ?? station?.stationName);
      await conn.execute(
        `INSERT INTO recipe_stations
          (recipe_id, station_item_id, station_internal_name, station_name_raw, is_alternative, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recipeId,
          stationItemId,
          toNullableString(station?.stationInternalName),
          stationNameRaw,
          toTinyIntBoolean(station?.isAlternative, 0),
          normalizePositiveSortOrder(station?.sortOrder, index + 1),
        ]
      );
      stationStats.created += 1;
    }
  }
}

async function importSnapshots(conn, snapshotRecords, itemLookup, biomeByCode, stats) {
  stats.input = Array.isArray(snapshotRecords) ? snapshotRecords.length : 0;
  if (!Array.isArray(snapshotRecords)) return;

  for (const snapshot of snapshotRecords) {
    const entityType = toNullableString(snapshot?.entityType)?.toLowerCase();
    if (!entityType) {
      stats.skipped += 1;
      continue;
    }

    let entityId = null;
    if (entityType === 'item') {
      entityId = getItemId(itemLookup, snapshot?.itemInternalName, snapshot?.itemName);
    } else if (entityType === 'biome') {
      const biomeCode = normalizeCode(snapshot?.biomeCode ?? snapshot?.itemInternalName ?? snapshot?.itemName);
      entityId = biomeCode ? (biomeByCode.get(biomeCode.toLowerCase()) ?? biomeByCode.get(biomeCode)) : null;
    }

    const provider = toNullableString(snapshot?.provider) ?? 'wiki_gg';
    const sourceKind = toNullableString(snapshot?.sourceKind) ?? 'wiki_page';
    const sourceLocator = toNullableString(snapshot?.sourceLocator ?? snapshot?.sourceFile);
    const sourcePage = toNullableString(snapshot?.sourcePage);
    const payloadJson = toNullableString(snapshot?.payloadJson);
    const fetchedAt = toDateTime(snapshot?.fetchedAt) ?? toDateTime(new Date().toISOString());

    const [existingRows] = await conn.execute(
      `SELECT id
         FROM entity_source_snapshots
        WHERE entity_type = ?
          AND COALESCE(entity_id, 0) = ?
          AND provider = ?
          AND source_kind = ?
          AND COALESCE(source_locator, '') = ?
        LIMIT 1`,
      [entityType, entityId ?? 0, provider, sourceKind, sourceLocator ?? '']
    );

    const payload = [
      entityType,
      entityId,
      provider,
      sourceKind,
      sourceLocator,
      sourcePage,
      toDateTime(snapshot?.sourceRevisionTimestamp),
      payloadJson,
      fetchedAt,
      toTinyIntBoolean(snapshot?.isCurrent, 1),
      toNullableString(snapshot?.parseStatus) ?? 'parsed',
    ];

    if (existingRows.length > 0) {
      await conn.execute(
        `UPDATE entity_source_snapshots
            SET entity_type = ?,
                entity_id = ?,
                provider = ?,
                source_kind = ?,
                source_locator = ?,
                source_page = ?,
                source_revision_timestamp = ?,
                payload_json = ?,
                fetched_at = ?,
                is_current = ?,
                parse_status = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [...payload, Number(existingRows[0].id)]
      );
      stats.updated += 1;
    } else {
      await conn.execute(
        `INSERT INTO entity_source_snapshots
          (entity_type, entity_id, provider, source_kind, source_locator, source_page, source_revision_timestamp, payload_json, fetched_at, is_current, parse_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        payload
      );
      stats.created += 1;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dataDir = path.resolve(
    args['data-dir']
    ?? process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR
    ?? path.join(repoRoot, 'data', 'standardized')
  );
  const jdbcUrl = args['db-url'] ?? process.env.TERRAPEDIA_DB_URL ?? '';
  const database = args.database
    ?? process.env.TERRAPEDIA_DB_NAME
    ?? extractDatabaseNameFromJdbcUrl(jdbcUrl)
    ?? 'terria_v1_local';

  const connectionConfig = {
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database,
    multipleStatements: false,
  };

  assertPrimaryDb(connectionConfig.database, args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true');

  const manifestPath = isStandardizedViewDir(dataDir)
    ? path.join(dataDir, '_index.json')
    : path.join(dataDir, '_manifest.standardized.json');

  const manifest = fs.existsSync(manifestPath) ? loadJson(manifestPath) : null;
  const itemsDataset = loadStandardizedDataset(dataDir, 'items');
  const relationsDataset = loadStandardizedDataset(dataDir, 'item_relations');
  const wikiBiomesFile = path.resolve(
    args['wiki-biomes-file']
    ?? process.env.TERRAPEDIA_WIKI_BIOMES_FILE
    ?? path.join(repoRoot, 'data', 'generated', 'wiki-biomes.importable.latest.json')
  );
  const wikiBiomesDataset = fs.existsSync(wikiBiomesFile)
    ? loadOptionalJson(wikiBiomesFile)
    : null;

  const summary = makeSummary();
  const conn = await mysql.createConnection(connectionConfig);

  try {
    await conn.query('SET NAMES utf8mb4');
    await ensureRelationTextColumns(conn);
    await conn.beginTransaction();

    const categoryByCode = await loadCategoryCodeMap(conn);
    await ensureItemCategories(conn, itemsDataset.records, categoryByCode, summary.categorySync);

    await importItems(conn, itemsDataset.records, categoryByCode, summary.items);
    const itemLookup = await loadItemLookup(conn);

    const relationRecords = relationsDataset.records ?? {};
    const standardizedBiomes = Array.isArray(relationRecords.biomes) ? relationRecords.biomes : [];
    const wikiBiomes = Array.isArray(wikiBiomesDataset?.biomes) ? wikiBiomesDataset.biomes : [];
    const biomes = mergeBiomeRecords(standardizedBiomes, wikiBiomes);
    const itemBiomes = Array.isArray(relationRecords.itemBiomes) ? relationRecords.itemBiomes : [];
    const itemImages = Array.isArray(relationRecords.itemImages) ? relationRecords.itemImages : [];
    const itemSources = Array.isArray(relationRecords.itemSources) ? relationRecords.itemSources : [];
    const recipes = Array.isArray(relationRecords.recipes) ? relationRecords.recipes : [];
    const snapshots = Array.isArray(relationRecords.snapshots) ? relationRecords.snapshots : [];

    const biomeByCode = await importBiomes(conn, biomes, summary.biomes);
    await importBiomeRelationsAndResources(conn, biomes, biomeByCode, itemLookup, summary.biomeRelations, summary.biomeResources);
    await importItemBiomes(conn, itemBiomes, itemLookup, biomeByCode, summary.itemBiomes);
    await importItemImages(conn, itemImages, itemLookup, summary.itemImages);
    await backfillItemsPrimaryImage(conn, summary.itemImageBackfill);
    await importItemSources(conn, itemSources, itemLookup, biomeByCode, summary.itemSources);
    await importRecipes(conn, recipes, itemLookup, summary.recipes, summary.recipeIngredients, summary.recipeStations);
    await importSnapshots(conn, snapshots, itemLookup, biomeByCode, summary.snapshots);
    await normalizeRelationSortOrders(conn, summary.sortNormalization);

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    database: connectionConfig.database,
    dataDir,
    wikiBiomesFile: wikiBiomesDataset ? wikiBiomesFile : null,
    manifestGeneratedAt: manifest?.generatedAt ?? null,
    summary,
  };

  console.log(JSON.stringify(report, null, 2));
}

function mergeBiomeRecords(baseRecords, overrideRecords) {
  const merged = new Map();
  for (const raw of Array.isArray(baseRecords) ? baseRecords : []) {
    const code = normalizeCode(raw?.code ?? raw?.biomeCode);
    if (!code) continue;
    merged.set(code.toLowerCase(), raw);
  }
  for (const raw of Array.isArray(overrideRecords) ? overrideRecords : []) {
    const code = normalizeCode(raw?.code ?? raw?.biomeCode);
    if (!code) continue;
    const key = code.toLowerCase();
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...raw } : raw);
  }
  return [...merged.values()];
}

main().catch((error) => {
  console.error('[import-standardized-to-db] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
