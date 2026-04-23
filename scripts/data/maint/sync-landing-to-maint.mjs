#!/usr/bin/env node

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { buildMaintSchemaSql } from './maint-schema.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const SCOPE_TO_DATASETS = {
  items: ['items_raw'],
  npcs: ['npcs_raw'],
  projectiles: ['projectiles_raw'],
  buffs: ['buffs_raw'],
  item_pages: ['item_pages_raw'],
  item_images: ['item_relations_bundle_raw'],
  recipe_pages: ['recipes_raw'],
  item_recipes: ['item_relations_bundle_raw'],
};

const SCOPE_TO_TABLE = {
  items: 'maint_items',
  npcs: 'maint_npcs',
  projectiles: 'maint_projectiles',
  buffs: 'maint_buffs',
  item_pages: 'maint_item_pages',
  item_images: 'maint_item_images',
  recipe_pages: 'maint_recipe_pages',
  item_recipes: 'maint_item_recipes',
};

export function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) args[body.slice(0, index)] = body.slice(index + 1);
    else args[body] = 'true';
  }
  return args;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveScopes(rawScopes) {
  const scopes = String(rawScopes ?? 'items,npcs,projectiles,buffs,item_pages,item_images,recipe_pages,item_recipes')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => Object.hasOwn(SCOPE_TO_DATASETS, entry));
  return [...new Set(scopes)];
}

function normalizeLandingPayload(row) {
  return typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
}

function createRecordKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildBaseMaintRow(scope, landingRow, rawRecord, extra = {}) {
  return {
    scope,
    tableName: SCOPE_TO_TABLE[scope],
    sourceId: Number(rawRecord.id),
    internalName: normalizeText(rawRecord.internalName),
    englishName: normalizeText(rawRecord.name ?? rawRecord.englishName),
    nameZh: normalizeText(rawRecord.localized?.zh?.name),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    moduleGeneratedAt: extra.moduleGeneratedAt ?? null,
    terrariaVersion: extra.terrariaVersion ?? null,
    majorValue: extra.majorValue ?? null,
    combatValue: extra.combatValue ?? null,
    defenseValue: extra.defenseValue ?? null,
    useTime: extra.useTime ?? null,
    stackSize: extra.stackSize ?? null,
    width: extra.width ?? null,
    height: extra.height ?? null,
    flagsJson: extra.flagsJson ?? null,
    rawJson: JSON.stringify(rawRecord),
  };
}

function extractItemsMaintRows(landingRow, payload) {
  const parsed = parseIteminfoModulePayload(payload.moduleContent);
  const moduleGeneratedAt = normalizeText(parsed._generated);
  const terrariaVersion = normalizeText(parsed._terrariaversion);

  return Object.entries(parsed)
    .filter(([key, value]) => /^\d+$/.test(key) && Number(key) > 0 && value && typeof value === 'object')
    .map(([key, value]) => buildBaseMaintRow('items', landingRow, { id: Number(key), ...value }, {
      moduleGeneratedAt,
      terrariaVersion,
      majorValue: Number(value.value ?? 0) || null,
      combatValue: Number(value.damage ?? 0) || null,
      defenseValue: Number(value.defense ?? 0) || null,
      useTime: Number(value.useTime ?? 0) || null,
      stackSize: Number(value.maxStack ?? 0) || null,
      width: Number(value.width ?? 0) || null,
      height: Number(value.height ?? 0) || null,
    }));
}

function extractNpcsMaintRows(landingRow, payload) {
  return (Array.isArray(payload.npcs) ? payload.npcs : []).map((record) => buildBaseMaintRow('npcs', landingRow, record, {
    moduleGeneratedAt: normalizeText(payload.moduleGeneratedAt),
    terrariaVersion: normalizeText(payload.wikiVersion),
    majorValue: Number(record.value ?? 0) || null,
    combatValue: Number(record.damage ?? 0) || null,
    defenseValue: Number(record.defense ?? 0) || null,
    width: Number(record.width ?? 0) || null,
    height: Number(record.height ?? 0) || null,
    flagsJson: JSON.stringify({
      friendly: Boolean(record.friendly),
      townNpc: Boolean(record.townNPC),
      boss: Boolean(record.boss),
    }),
  }));
}

function extractProjectilesMaintRows(landingRow, payload) {
  return (Array.isArray(payload.projectiles) ? payload.projectiles : []).map((record) => buildBaseMaintRow('projectiles', landingRow, record, {
    moduleGeneratedAt: normalizeText(payload.moduleGeneratedAt),
    terrariaVersion: normalizeText(payload.moduleGeneratedFrom),
    combatValue: Number(record.damage ?? 0) || null,
    useTime: Number(record.timeLeft ?? 0) || null,
    width: Number(record.width ?? 0) || null,
    height: Number(record.height ?? 0) || null,
    flagsJson: JSON.stringify({
      friendly: Boolean(record.friendly),
      hostile: Boolean(record.hostile),
      tileCollide: record.tileCollide == null ? true : Boolean(record.tileCollide),
    }),
  }));
}

function extractBuffsMaintRows(landingRow, payload) {
  return (Array.isArray(payload.buffs) ? payload.buffs : []).map((record) => buildBaseMaintRow('buffs', landingRow, record, {
    moduleGeneratedAt: null,
    terrariaVersion: null,
    majorValue: Number(record.sourceItemCount ?? 0) || null,
    combatValue: Number(record.immuneNpcCount ?? 0) || null,
    flagsJson: JSON.stringify({
      buffType: normalizeText(record.type),
    }),
  }));
}

function extractItemPageMaintRows(landingRow, payload) {
  const row = {
    scope: 'item_pages',
    tableName: 'maint_item_pages',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      pageTitle: payload.pageTitle,
      itemInternalName: payload.itemInternalName,
      contentHash: landingRow.content_hash,
    }),
    itemInternalName: normalizeText(payload.itemInternalName),
    itemName: normalizeText(payload.itemName),
    entityType: normalizeText(payload.entityType),
    requestedPageTitle: normalizeText(payload.requestedPageTitle),
    pageTitle: normalizeText(payload.pageTitle),
    pageId: Number(payload.pageId ?? 0) || null,
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    wikitext: payload.wikitext ?? null,
    html: payload.html ?? null,
    recipesMarkup: payload.recipesMarkup ?? null,
    rawJson: JSON.stringify(payload),
  };
  return [row];
}

function extractRecipePageMaintRows(landingRow, payload) {
  const row = {
    scope: 'recipe_pages',
    tableName: 'maint_recipe_pages',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      pageTitle: payload.pageTitle,
      contentHash: landingRow.content_hash,
    }),
    requestedPageTitle: normalizeText(payload.requestedPageTitle),
    pageTitle: normalizeText(payload.pageTitle),
    crawlDepth: Number(payload.crawlDepth ?? 0) || 0,
    requested: Boolean(payload.requested),
    discoveredFrom: normalizeText(payload.discoveredFrom),
    pageId: Number(payload.pageId ?? 0) || null,
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceUrl: normalizeText(payload.sourceUrl),
    sourceRevisionTimestamp: landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    introParagraphsJson: JSON.stringify(payload.introParagraphs ?? []),
    sectionsJson: JSON.stringify(payload.sections ?? []),
    childPagesJson: JSON.stringify(payload.childPages ?? []),
    childPageCount: Number(payload.childPageCount ?? 0) || 0,
    recipeTableCount: Number(payload.recipeTableCount ?? 0) || 0,
    recipeRowCount: Number(payload.recipeRowCount ?? 0) || 0,
    recipeTablesJson: JSON.stringify(payload.recipeTables ?? []),
    rawJson: JSON.stringify(payload),
  };
  return [row];
}

function extractItemImageMaintRows(landingRow, payload) {
  return (Array.isArray(payload.itemImages) ? payload.itemImages : []).map((record) => ({
    scope: 'item_images',
    tableName: 'maint_item_images',
    recordKey: createRecordKey(record),
    itemInternalName: normalizeText(record.itemInternalName),
    itemName: normalizeText(record.itemName),
    role: normalizeText(record.role),
    sourceProvider: normalizeText(record.provider) ?? landingRow.provider,
    sourceFileTitle: normalizeText(record.sourceFileTitle),
    sourcePage: normalizeText(record.sourcePage) ?? landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    originalUrl: normalizeText(record.originalUrl),
    cachedUrl: normalizeText(record.cachedUrl),
    width: Number(record.width ?? 0) || null,
    height: Number(record.height ?? 0) || null,
    contentType: normalizeText(record.contentType),
    isPrimary: Boolean(record.isPrimary),
    sortOrder: Number(record.sortOrder ?? 0) || 0,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
}

function extractItemRecipeMaintRows(landingRow, payload) {
  return (Array.isArray(payload.recipes) ? payload.recipes : []).map((record) => ({
    scope: 'item_recipes',
    tableName: 'maint_item_recipes',
    recordKey: createRecordKey(record),
    resultInternalName: normalizeText(record.resultInternalName),
    resultName: normalizeText(record.resultName),
    resultQuantity: Number(record.resultQuantity ?? 0) || null,
    versionScope: normalizeText(record.versionScope),
    notes: normalizeText(record.notes),
    sourceProvider: normalizeText(record.sourceProvider) ?? landingRow.provider,
    sourcePage: normalizeText(record.sourcePage) ?? landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    sourceContextPage: normalizeText(record.sourceContextPage),
    sourceContextPageSlug: normalizeText(record.sourceContextPageSlug),
    sourceContextDisplayName: normalizeText(record.sourceContextDisplayName),
    sourceContextUrl: normalizeText(record.sourceContextUrl),
    sourceContextRevisionId: Number(record.sourceContextRevisionId ?? 0) || null,
    sourceFetchedAt: record.sourceFetchedAt ?? null,
    ingredientsJson: JSON.stringify(record.ingredients ?? []),
    stationsJson: JSON.stringify(record.stations ?? []),
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
}

export async function extractMaintEntitiesFromLandingRow(landingRow) {
  const payload = normalizeLandingPayload(landingRow);
  const datasetType = landingRow.dataset_type;
  if (datasetType === 'items_raw') {
    const rows = extractItemsMaintRows(landingRow, payload);
    return { scope: 'items', rows };
  }
  if (datasetType === 'npcs_raw') {
    const rows = extractNpcsMaintRows(landingRow, payload);
    return { scope: 'npcs', rows };
  }
  if (datasetType === 'projectiles_raw') {
    const rows = extractProjectilesMaintRows(landingRow, payload);
    return { scope: 'projectiles', rows };
  }
  if (datasetType === 'buffs_raw') {
    const rows = extractBuffsMaintRows(landingRow, payload);
    return { scope: 'buffs', rows };
  }
  if (datasetType === 'item_pages_raw') {
    const rows = extractItemPageMaintRows(landingRow, payload);
    return { scope: 'item_pages', rows };
  }
  if (datasetType === 'recipes_raw') {
    const rows = extractRecipePageMaintRows(landingRow, payload);
    return { scope: 'recipe_pages', rows };
  }
  if (datasetType === 'item_relations_bundle_raw') {
    const rows = [
      ...extractItemImageMaintRows(landingRow, payload),
      ...extractItemRecipeMaintRows(landingRow, payload),
    ];
    return { scope: 'bundle_relations', rows };
  }
  return { scope: null, rows: [] };
}

export function buildMaintSyncSummary(options, entityRows) {
  const byScope = {};
  for (const row of entityRows) {
    byScope[row.scope] = (byScope[row.scope] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    apply: Boolean(options.apply),
    scopes: Array.isArray(options.scopes) ? [...options.scopes] : [],
    rows: {
      total: entityRows.length,
      byScope,
    },
    writes: {
      inserted: 0,
      updated: 0,
    },
  };
}

function createEmptyStreamSummary(options) {
  return {
    generatedAt: new Date().toISOString(),
    apply: Boolean(options.apply),
    scopes: Array.isArray(options.scopes) ? [...options.scopes] : [],
    rows: {
      total: 0,
      byScope: {},
    },
    writes: {
      inserted: 0,
      updated: 0,
    },
  };
}

function addRowsToStreamSummary(summary, rows) {
  for (const row of rows) {
    summary.rows.total += 1;
    summary.rows.byScope[row.scope] = (summary.rows.byScope[row.scope] ?? 0) + 1;
  }
}

function dedupeEntityRows(rows, seenRecordKeys) {
  const deduped = [];
  for (const row of rows) {
    if (row.recordKey) {
      if (seenRecordKeys.has(row.recordKey)) {
        continue;
      }
      seenRecordKeys.add(row.recordKey);
    }
    deduped.push(row);
  }
  return deduped;
}

async function defaultLoadLandingRows(scopes, connection) {
  const datasetTypes = [...new Set(scopes.flatMap((scope) => SCOPE_TO_DATASETS[scope] ?? []))];
  if (datasetTypes.length === 0) return [];
  const placeholders = datasetTypes.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id, dataset_type, provider, source_key, source_page, source_revision_timestamp, content_hash, payload_json, fetched_at, parsed_at
     FROM source_dataset_landings
     WHERE is_current = 1 AND dataset_type IN (${placeholders})
     ORDER BY dataset_type`,
    datasetTypes,
  );
  return rows;
}

async function* defaultIterateLandingRows(scopes, connection, batchSize = 25) {
  const datasetTypes = [...new Set(scopes.flatMap((scope) => SCOPE_TO_DATASETS[scope] ?? []))];
  if (datasetTypes.length === 0) {
    return;
  }
  const placeholders = datasetTypes.map(() => '?').join(', ');
  let lastId = 0;
  while (true) {
    const [rows] = await connection.query(
      `SELECT id, dataset_type, provider, source_key, source_page, source_revision_timestamp, content_hash, payload_json, fetched_at, parsed_at
       FROM source_dataset_landings
       WHERE is_current = 1 AND dataset_type IN (${placeholders}) AND id > ?
       ORDER BY id
       LIMIT ?`,
      [...datasetTypes, lastId, batchSize],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }
    for (const row of rows) {
      yield row;
      lastId = Math.max(lastId, Number(row.id));
    }
  }
}

function isAsyncIterable(value) {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

async function collectRowsFromAsyncIterable(iterable) {
  const rows = [];
  for await (const row of iterable) {
    rows.push(row);
  }
  return rows;
}

async function defaultWriteReport(reportPath, summary) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf8');
}

async function upsertRecordKeyRow(connection, row) {
  if (row.tableName === 'maint_item_pages') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET item_internal_name = ?, item_name = ?, entity_type = ?, requested_page_title = ?, page_title = ?, page_id = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, wikitext = ?, html = ?, recipes_markup = ?, raw_json = ?,
             status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.wikitext, row.html, row.recipesMarkup, row.rawJson,
          Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`entity_type\`, \`requested_page_title\`, \`page_title\`, \`page_id\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`wikitext\`, \`html\`, \`recipes_markup\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.wikitext, row.html, row.recipesMarkup, row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_images') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET item_internal_name = ?, item_name = ?, role = ?, source_provider = ?, source_file_title = ?, source_page = ?, source_revision_timestamp = ?,
             original_url = ?, cached_url = ?, width = ?, height = ?, content_type = ?, is_primary = ?, sort_order = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.role, row.sourceProvider, row.sourceFileTitle, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.originalUrl, row.cachedUrl, row.width, row.height, row.contentType, row.isPrimary ? 1 : 0, row.sortOrder,
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`role\`, \`source_provider\`, \`source_file_title\`, \`source_page\`, \`source_revision_timestamp\`,
        \`original_url\`, \`cached_url\`, \`width\`, \`height\`, \`content_type\`, \`is_primary\`, \`sort_order\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.role, row.sourceProvider, row.sourceFileTitle, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.originalUrl, row.cachedUrl, row.width, row.height, row.contentType, row.isPrimary ? 1 : 0, row.sortOrder,
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_recipe_pages') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET requested_page_title = ?, page_title = ?, crawl_depth = ?, requested = ?, discovered_from = ?, page_id = ?,
             source_provider = ?, source_page = ?, source_url = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, intro_paragraphs_json = ?, sections_json = ?, child_pages_json = ?,
             child_page_count = ?, recipe_table_count = ?, recipe_row_count = ?, recipe_tables_json = ?, raw_json = ?,
             status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.requestedPageTitle, row.pageTitle, row.crawlDepth, row.requested ? 1 : 0, row.discoveredFrom, row.pageId,
          row.sourceProvider, row.sourcePage, row.sourceUrl, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.introParagraphsJson, row.sectionsJson, row.childPagesJson,
          row.childPageCount, row.recipeTableCount, row.recipeRowCount, row.recipeTablesJson, row.rawJson,
          Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`requested_page_title\`, \`page_title\`, \`crawl_depth\`, \`requested\`, \`discovered_from\`, \`page_id\`,
        \`source_provider\`, \`source_page\`, \`source_url\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`intro_paragraphs_json\`, \`sections_json\`, \`child_pages_json\`,
        \`child_page_count\`, \`recipe_table_count\`, \`recipe_row_count\`, \`recipe_tables_json\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.requestedPageTitle, row.pageTitle, row.crawlDepth, row.requested ? 1 : 0, row.discoveredFrom, row.pageId,
        row.sourceProvider, row.sourcePage, row.sourceUrl, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.introParagraphsJson, row.sectionsJson, row.childPagesJson,
        row.childPageCount, row.recipeTableCount, row.recipeRowCount, row.recipeTablesJson, row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_recipes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET result_internal_name = ?, result_name = ?, result_quantity = ?, version_scope = ?, notes = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             source_context_page = ?, source_context_page_slug = ?, source_context_display_name = ?, source_context_url = ?, source_context_revision_id = ?, source_fetched_at = ?,
             ingredients_json = ?, stations_json = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?,
             landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope, row.notes, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.sourceContextUrl, row.sourceContextRevisionId, toMysqlDateTime(row.sourceFetchedAt),
          row.ingredientsJson, row.stationsJson, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash,
          toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`result_internal_name\`, \`result_name\`, \`result_quantity\`, \`version_scope\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`source_context_page\`, \`source_context_page_slug\`, \`source_context_display_name\`, \`source_context_url\`, \`source_context_revision_id\`, \`source_fetched_at\`,
        \`ingredients_json\`, \`stations_json\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope, row.notes, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.sourceContextUrl, row.sourceContextRevisionId, toMysqlDateTime(row.sourceFetchedAt),
        row.ingredientsJson, row.stationsJson, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  throw new Error(`Unsupported record_key upsert table: ${row.tableName}`);
}

async function upsertMaintRow(connection, row) {
  if (row.recordKey) {
    return upsertRecordKeyRow(connection, row);
  }
  const nowFields = [
    'source_id',
    'internal_name',
    'english_name',
    'name_zh',
    'source_provider',
    'source_page',
    'source_revision_timestamp',
    'landing_source_id',
    'landing_source_key',
    'landing_source_page',
    'landing_content_hash',
    'landing_fetched_at',
    'landing_parsed_at',
    'module_generated_at',
    'terraria_version',
    'major_value',
    'combat_value',
    'defense_value',
    'use_time',
    'stack_size',
    'width',
    'height',
    'flags_json',
    'raw_json',
    'status',
    'deleted',
  ];
  const values = [
    row.sourceId,
    row.internalName,
    row.englishName,
    row.nameZh,
    row.sourceProvider,
    row.sourcePage,
    toMysqlDateTime(row.sourceRevisionTimestamp),
    row.landingSourceId,
    row.landingSourceKey,
    row.landingSourcePage,
    row.landingContentHash,
    toMysqlDateTime(row.landingFetchedAt),
    toMysqlDateTime(row.landingParsedAt),
    row.moduleGeneratedAt,
    row.terrariaVersion,
    row.majorValue,
    row.combatValue,
    row.defenseValue,
    row.useTime,
    row.stackSize,
    row.width,
    row.height,
    row.flagsJson,
    row.rawJson,
    1,
    0,
  ];

  const [existingRows] = await connection.execute(
    `SELECT id FROM \`${row.tableName}\` WHERE source_id = ? LIMIT 1`,
    [row.sourceId],
  );
  const existing = existingRows[0] ?? null;
  if (existing) {
    await connection.execute(
      `UPDATE \`${row.tableName}\`
       SET internal_name = ?, english_name = ?, name_zh = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
           landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
           module_generated_at = ?, terraria_version = ?, major_value = ?, combat_value = ?, defense_value = ?, use_time = ?, stack_size = ?,
           width = ?, height = ?, flags_json = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        ...values.slice(1, 24),
        Number(existing.id),
      ],
    );
    return 'updated';
  }

  await connection.execute(
    `INSERT INTO \`${row.tableName}\` (
      ${nowFields.map((field) => `\`${field}\``).join(', ')}
    ) VALUES (${nowFields.map(() => '?').join(', ')})`,
    values,
  );
  return 'inserted';
}

export async function runMaintSync(options, dependencies = {}) {
  const mysqlModule = dependencies.mysqlModule ?? mysql;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const scopes = Array.isArray(options.scopes) ? options.scopes : resolveScopes(options.scopes);
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local',
    multipleStatements: true,
  };

  const loaded = dependencies.loadLandingRows
    ? await dependencies.loadLandingRows(scopes)
    : null;

  const canUseArrayMode = Array.isArray(loaded);
  if (canUseArrayMode) {
    const extracted = [];
    const seenRecordKeys = new Set();
    for (const landingRow of loaded) {
      const result = await extractMaintEntitiesFromLandingRow(landingRow);
      extracted.push(...dedupeEntityRows(result.rows, seenRecordKeys));
    }

    const summary = buildMaintSyncSummary({ apply: options.apply, scopes }, extracted);

    if (options.apply) {
      const connection = await mysqlModule.createConnection(connectionConfig);
      try {
        await connection.beginTransaction();
        await connection.query(buildMaintSchemaSql());
        for (const row of extracted) {
          const action = await upsertMaintRow(connection, row);
          summary.writes[action] += 1;
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        await connection.end();
      }
    }

    if (options.reportPath) {
      await writeReport(options.reportPath, summary);
    }

    return summary;
  }

  const summary = createEmptyStreamSummary({ apply: options.apply, scopes });
  const writeConnection = options.apply ? await mysqlModule.createConnection(connectionConfig) : null;
  const seenRecordKeys = new Set();
  let readConnection = null;
  try {
    if (writeConnection) {
      await writeConnection.beginTransaction();
      await writeConnection.query(buildMaintSchemaSql());
    }

    const landingIterable = isAsyncIterable(loaded)
      ? loaded
      : dependencies.iterateLandingRows
        ? dependencies.iterateLandingRows(scopes)
        : null;

    let source = landingIterable;
    if (!source) {
      readConnection = await mysqlModule.createConnection(connectionConfig);
      source = defaultIterateLandingRows(scopes, readConnection);
    }

    for await (const landingRow of source) {
      const result = await extractMaintEntitiesFromLandingRow(landingRow);
      const dedupedRows = dedupeEntityRows(result.rows, seenRecordKeys);
      addRowsToStreamSummary(summary, dedupedRows);
      if (writeConnection) {
        for (const row of dedupedRows) {
          const action = await upsertMaintRow(writeConnection, row);
          summary.writes[action] += 1;
        }
      }
    }

    if (writeConnection) {
      await writeConnection.commit();
    }

    if (options.reportPath) {
      await writeReport(options.reportPath, summary);
    }

    return summary;
  } catch (error) {
    if (writeConnection) {
      await writeConnection.rollback();
    }
    throw error;
  } finally {
    if (readConnection) {
      await readConnection.end();
    }
    if (writeConnection) {
      await writeConnection.end();
    }
  }
}

async function main() {
  const rawArgs = parseArgs(process.argv.slice(2));
  const apply = booleanOption(rawArgs.apply, false);
  const reportPath = path.resolve(
    repoRoot,
    rawArgs.output ?? path.join('reports', `maint-sync-${formatDateTag(new Date())}.json`),
  );
  const summary = await runMaintSync({
    apply,
    scopes: resolveScopes(rawArgs.scopes),
    reportPath,
    host: rawArgs.host,
    port: rawArgs.port,
    user: rawArgs.user,
    password: rawArgs.password,
    database: rawArgs.database,
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
