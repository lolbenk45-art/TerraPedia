#!/usr/bin/env node

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { buildMaintSchemaSql } from './maint-schema.mjs';
import { extractCategoryItemRecords } from './category-item-structured-parser.mjs';
import { extractItemPageRecipeRecords, extractRecipePageRecipeRecords } from './page-recipe-structured-parser.mjs';
import { extractShimmerStructuredRecords } from './shimmer-structured-parser.mjs';
import { extractItemSellStat } from './item-page-statistics-parser.mjs';
import { loadZhSourceIndexes } from './zh-source-index.mjs';

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
  item_sources: ['item_relations_bundle_raw'],
  item_biomes: ['item_relations_bundle_raw'],
  source_snapshots: ['item_relations_bundle_raw'],
  bosses: ['bosses_raw'],
  biomes: ['biomes_raw'],
  armor_sets: ['armor_sets_raw'],
  categories: ['categories_raw'],
  shimmer: ['shimmer_raw'],
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
  item_sources: 'maint_item_sources',
  item_biomes: 'maint_item_biomes',
  source_snapshots: 'maint_source_snapshots',
  bosses: 'maint_bosses',
  biomes: 'maint_biomes',
  armor_sets: 'maint_armor_sets',
  categories: 'maint_categories',
  shimmer: 'maint_shimmer_pages',
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

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeKey(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveScopes(rawScopes) {
  const scopes = String(rawScopes ?? 'items,npcs,projectiles,buffs,item_pages,item_images,recipe_pages,item_recipes,item_sources,item_biomes,source_snapshots,bosses,biomes,armor_sets,categories,shimmer')
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
    nameZh: extra.nameZh === undefined ? normalizeText(rawRecord.localized?.zh?.name) : normalizeText(extra.nameZh),
    subNameZh: extra.subNameZh === undefined ? normalizeText(rawRecord.localized?.zh?.namesub) : normalizeText(extra.subNameZh),
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

function extractItemsMaintRows(landingRow, payload, zhSourceIndexes = null) {
  const parsed = parseIteminfoModulePayload(payload.moduleContent);
  const moduleGeneratedAt = normalizeText(parsed._generated);
  const terrariaVersion = normalizeText(parsed._terrariaversion);

  return Object.entries(parsed)
    .filter(([key, value]) => /^\d+$/.test(key) && Number(key) > 0 && value && typeof value === 'object')
    .map(([key, value]) => buildBaseMaintRow('items', landingRow, { id: Number(key), ...value }, {
      nameZh: zhSourceIndexes?.itemsByInternalName?.get(normalizeKey(value.internalName))?.nameZh,
      moduleGeneratedAt,
      terrariaVersion,
      majorValue: toNullableNumber(value.value),
      combatValue: toNullableNumber(value.damage),
      defenseValue: toNullableNumber(value.defense),
      useTime: toNullableNumber(value.useTime),
      stackSize: toNullableNumber(value.maxStack),
      width: toNullableNumber(value.width),
      height: toNullableNumber(value.height),
    }));
}

function extractNpcsMaintRows(landingRow, payload, zhSourceIndexes = null) {
  return (Array.isArray(payload.npcs) ? payload.npcs : []).map((record) => buildBaseMaintRow('npcs', landingRow, record, {
    nameZh: zhSourceIndexes?.npcsByInternalName?.get(normalizeKey(record.internalName))?.nameZh,
    subNameZh: zhSourceIndexes?.npcsByInternalName?.get(normalizeKey(record.internalName))?.subNameZh,
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

function extractProjectilesMaintRows(landingRow, payload, zhSourceIndexes = null) {
  return (Array.isArray(payload.projectiles) ? payload.projectiles : []).map((record) => buildBaseMaintRow('projectiles', landingRow, record, {
    nameZh: zhSourceIndexes?.projectilesByInternalName?.get(normalizeKey(record.internalName))?.nameZh,
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
  const sellStat = extractItemSellStat(payload.html ?? null);
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
    sellText: sellStat.sellText,
    sellValue: sellStat.sellValue,
    rawJson: JSON.stringify(payload),
  };
  const recipeRows = extractItemPageRecipeRecords(payload).map((record) => ({
    scope: 'item_pages',
    tableName: 'maint_item_page_recipes',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      pageTitle: record.pageTitle,
      recipeIndex: record.recipeIndex,
      contentHash: landingRow.content_hash,
    }),
    pageTitle: record.pageTitle,
    itemInternalName: record.itemInternalName,
    itemName: record.itemName,
    resultInternalName: record.resultInternalName,
    resultName: record.resultName,
    resultQuantity: record.resultQuantity,
    versionScope: record.versionScope,
    sourceContextPage: record.sourceContextPage,
    sourceContextPageSlug: record.sourceContextPageSlug,
    sourceContextDisplayName: record.sourceContextDisplayName,
    ingredientsJson: JSON.stringify(record.ingredients ?? []),
    stationsJson: JSON.stringify(record.stations ?? []),
    sortOrder: Number(record.recipeIndex ?? 0),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.revisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
  return [row, ...recipeRows];
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
  const recipeRows = extractRecipePageRecipeRecords(payload).map((record, index) => ({
    scope: 'recipe_pages',
    tableName: 'maint_recipe_page_recipes',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      pageTitle: record.pageTitle,
      tableCaption: record.tableCaption,
      sortOrder: Number(index),
      contentHash: landingRow.content_hash,
    }),
    pageTitle: record.pageTitle,
    pageSlug: record.pageSlug,
    tableCaption: record.tableCaption,
    resultInternalName: record.resultInternalName,
    resultName: record.resultName,
    resultQuantity: record.resultQuantity,
    versionScope: record.versionScope,
    sourceContextPage: record.sourceContextPage,
    sourceContextPageSlug: record.sourceContextPageSlug,
    sourceContextDisplayName: record.sourceContextDisplayName,
    sourceContextUrl: record.sourceContextUrl,
    ingredientsJson: JSON.stringify(record.ingredients ?? []),
    stationsJson: JSON.stringify(record.stations ?? []),
    sortOrder: Number(index),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.revisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
  return [row, ...recipeRows];
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

function extractItemSourceMaintRows(landingRow, payload) {
  return (Array.isArray(payload.itemSources) ? payload.itemSources : []).map((record) => ({
    scope: 'item_sources',
    tableName: 'maint_item_sources',
    recordKey: createRecordKey(record),
    itemInternalName: normalizeText(record.itemInternalName),
    itemName: normalizeText(record.itemName),
    sourceType: normalizeText(record.sourceType),
    sourceRefType: normalizeText(record.sourceRefType),
    sourceRefName: normalizeText(record.sourceRefName),
    sortOrder: Number(record.sortOrder ?? 0) || 0,
    biomeCode: normalizeText(record.biomeCode),
    sourceProvider: normalizeText(record.sourceProvider) ?? landingRow.provider,
    sourcePage: normalizeText(record.sourcePage) ?? landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
}

function extractItemBiomeMaintRows(landingRow, payload) {
  return (Array.isArray(payload.itemBiomes) ? payload.itemBiomes : []).map((record) => ({
    scope: 'item_biomes',
    tableName: 'maint_item_biomes',
    recordKey: createRecordKey(record),
    itemInternalName: normalizeText(record.itemInternalName),
    itemName: normalizeText(record.itemName),
    biomeCode: normalizeText(record.biomeCode),
    relationType: normalizeText(record.relationType),
    notes: normalizeText(record.notes),
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

function extractSnapshotMaintRows(landingRow, payload) {
  return (Array.isArray(payload.snapshots) ? payload.snapshots : []).map((record) => ({
    scope: 'source_snapshots',
    tableName: 'maint_source_snapshots',
    recordKey: createRecordKey(record),
    entityType: normalizeText(record.entityType),
    itemInternalName: normalizeText(record.itemInternalName),
    itemName: normalizeText(record.itemName),
    sourceProvider: normalizeText(record.provider) ?? landingRow.provider,
    sourceKind: normalizeText(record.sourceKind),
    sourceLocator: normalizeText(record.sourceLocator),
    sourcePage: normalizeText(record.sourcePage) ?? landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    snapshotPayloadJson: normalizeText(record.payloadJson),
    snapshotFetchedAt: record.fetchedAt ?? null,
    isCurrent: record.isCurrent == null ? true : Boolean(record.isCurrent),
    parseStatus: normalizeText(record.parseStatus),
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
}

function extractBossMaintRows(landingRow, payload) {
  return [{
    scope: 'bosses',
    tableName: 'maint_bosses',
    recordKey: createRecordKey(payload),
    progressionOrder: Number(payload.progressionOrder ?? 0) || null,
    orderWithinGroup: Number(payload.orderWithinGroup ?? 0) || null,
    groupNameEn: normalizeText(payload.groupNameEn),
    groupNameZh: normalizeText(payload.groupNameZh),
    groupType: normalizeText(payload.groupType),
    titleEn: normalizeText(payload.titleEn),
    titleZh: normalizeText(payload.titleZh),
    pageTitleEn: normalizeText(payload.pageTitleEn),
    pageTitleZh: normalizeText(payload.pageTitleZh),
    pageId: Number(payload.pageId ?? 0) || null,
    revisionId: Number(payload.revisionId ?? 0) || null,
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceUrl: normalizeText(payload.sourceUrl),
    sourceUrlZh: normalizeText(payload.sourceUrlZh),
    sourceRevisionTimestamp: payload.revisionTimestamp ?? landingRow.source_revision_timestamp,
    imageUrl: normalizeText(payload.imageUrl),
    notes: normalizeText(payload.notes),
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(payload),
  }];
}

function extractBiomeMaintRows(landingRow, payload) {
  return [{
    scope: 'biomes',
    tableName: 'maint_biomes',
    recordKey: createRecordKey(payload),
    biomeCode: normalizeText(payload.biomeCode),
    entityType: normalizeText(payload.entityType),
    requestedPageTitle: normalizeText(payload.requestedPageTitle),
    pageTitle: normalizeText(payload.pageTitle),
    pageId: Number(payload.pageId ?? 0) || null,
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.revisionTimestamp ?? landingRow.source_revision_timestamp,
    wikitext: payload.wikitext ?? null,
    html: payload.html ?? null,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(payload),
  }];
}

function extractArmorSetMaintRows(landingRow, payload) {
  return (Array.isArray(payload.armorSets) ? payload.armorSets : []).map((record) => ({
    scope: 'armor_sets',
    tableName: 'maint_armor_sets',
    recordKey: createRecordKey(record),
    textKey: normalizeText(record.textKey),
    benefitExpression: normalizeText(record.benefitExpression),
    primaryPart: Number(record.primaryPart ?? 0) || null,
    setCount: Number(record.setCount ?? 0) || null,
    uniqueItemCount: Array.isArray(record.uniqueItemIds) ? record.uniqueItemIds.length : 0,
    setsJson: JSON.stringify(record.sets ?? []),
    uniqueItemIdsJson: JSON.stringify(record.uniqueItemIds ?? []),
    terrariaVersion: normalizeText(payload.terrariaVersion),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
}

function extractCategoryMaintRows(landingRow, payload) {
  const categoryRow = {
    scope: 'categories',
    tableName: 'maint_categories',
    recordKey: createRecordKey(payload),
    topLevel: normalizeText(payload.topLevel),
    templateTitle: normalizeText(payload.templateTitle),
    sourcePageId: Number(payload.sourcePageId ?? 0) || null,
    sourceRevisionId: Number(payload.sourceRevisionId ?? 0) || null,
    sourceRevisionTimestamp: payload.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    renderedHtmlLength: Number(payload.renderedHtmlLength ?? 0) || null,
    sectionCount: Number(payload.sectionCount ?? 0) || null,
    itemCount: Number(payload.itemCount ?? 0) || null,
    sectionsJson: JSON.stringify(payload.sections ?? []),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(payload),
  };
  const itemRecords = extractCategoryItemRecords(payload);
  const itemRows = itemRecords.map((record, index) => ({
    scope: 'categories',
    tableName: 'maint_item_categories',
    recordKey: createRecordKey({
      datasetType: landingRow.dataset_type,
      templateTitle: record.templateTitle,
      sectionTitle: record.sectionTitle,
      groupName: record.groupName,
      itemName: record.itemName,
      parentItemName: record.parentItemName,
      depth: record.depth,
      index,
      contentHash: landingRow.content_hash,
    }),
    topLevel: record.topLevel,
    templateTitle: record.templateTitle,
    sectionTitle: record.sectionTitle,
    groupName: record.groupName,
    itemInternalName: record.itemInternalName,
    itemEnglishName: record.itemEnglishName,
    itemName: record.itemName,
    itemHref: record.itemHref,
    itemCount: record.itemCount,
    parentItemName: record.parentItemName,
    depth: record.depth,
    isGroupNode: Boolean(record.isGroupNode),
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
  }));
  const categoryRuleResult = extractCategoryRuleMaintRows(landingRow, categoryRow, itemRows, itemRecords);
  return {
    rows: [categoryRow, ...itemRows, ...categoryRuleResult.rows],
    categoryRules: categoryRuleResult.summary,
  };
}

function extractCategoryRuleMaintRows(landingRow, categoryRow, itemRows, itemRecords) {
  const nodeMap = new Map();
  const assignmentCandidates = new Map();
  const summary = {
    nodeRows: 0,
    assignmentRows: 0,
    unmatchedItems: 0,
    primaryAssignments: 0,
    secondaryAssignments: 0,
  };

  for (let index = 0; index < itemRows.length; index += 1) {
    const itemRow = itemRows[index];
    const itemRecord = itemRecords[index] ?? {};
    const displaySegments = buildCategoryDisplaySegments(itemRecord);
    if (displaySegments.length === 0) {
      continue;
    }

    for (let segmentIndex = 0; segmentIndex < displaySegments.length; segmentIndex += 1) {
      const currentSegments = displaySegments.slice(0, segmentIndex + 1);
      const pathText = currentSegments.join(' > ');
      const nodeKey = buildCategoryNodeKey(currentSegments);
      const parentSegments = currentSegments.slice(0, -1);
      const parentNodeKey = parentSegments.length ? buildCategoryNodeKey(parentSegments) : null;
      const isLeafNode = segmentIndex === displaySegments.length - 1;
      const nodeRow = {
        scope: 'categories',
        tableName: 'maint_category_nodes',
        recordKey: createRecordKey({
          tableName: 'maint_category_nodes',
          nodeKey,
        }),
        nodeKey,
        parentNodeKey,
        topLevel: itemRow.topLevel,
        sectionTitle: itemRow.sectionTitle,
        groupName: itemRow.groupName,
        nodeName: currentSegments[currentSegments.length - 1],
        pathText,
        depth: segmentIndex,
        isGroupNode: isLeafNode ? Boolean(itemRow.isGroupNode) : false,
        sourceTemplateTitle: itemRow.templateTitle,
        sourceMaintCategoryRecordKey: categoryRow.recordKey,
        sourceMaintItemCategoryRecordKey: itemRow.recordKey,
        sourceProvider: itemRow.sourceProvider,
        sourcePage: itemRow.sourcePage,
        sourceRevisionTimestamp: itemRow.sourceRevisionTimestamp,
        landingSourceId: itemRow.landingSourceId,
        landingSourceKey: itemRow.landingSourceKey,
        landingSourcePage: itemRow.landingSourcePage,
        landingContentHash: itemRow.landingContentHash,
        landingFetchedAt: itemRow.landingFetchedAt,
        landingParsedAt: itemRow.landingParsedAt,
        rawJson: JSON.stringify({
          templateTitle: itemRow.templateTitle,
          pathSegments: currentSegments,
          sourceItemName: itemRow.itemName,
          sourceItemRecordKey: itemRow.recordKey,
        }),
      };
      if (!nodeMap.has(nodeKey)) {
        nodeMap.set(nodeKey, nodeRow);
      }
    }

    if (!itemRow.itemInternalName) {
      summary.unmatchedItems += 1;
      continue;
    }

    const leafNodeKey = buildCategoryNodeKey(displaySegments);
    const categoryPathText = displaySegments.join(' > ');
    const pairKey = `${itemRow.itemInternalName}::${leafNodeKey}`;
    const candidate = {
      itemInternalName: itemRow.itemInternalName,
      itemName: itemRow.itemEnglishName ?? itemRow.itemName,
      categoryNodeKey: leafNodeKey,
      categoryPathText,
      sourceTemplateTitle: itemRow.templateTitle,
      sourceItemName: itemRow.itemName,
      sourceParentItemName: itemRow.parentItemName,
      sourceMaintCategoryRecordKey: categoryRow.recordKey,
      sourceMaintItemCategoryRecordKey: itemRow.recordKey,
      sourceProvider: itemRow.sourceProvider,
      sourcePage: itemRow.sourcePage,
      sourceRevisionTimestamp: itemRow.sourceRevisionTimestamp,
      landingSourceId: itemRow.landingSourceId,
      landingSourceKey: itemRow.landingSourceKey,
      landingSourcePage: itemRow.landingSourcePage,
      landingContentHash: itemRow.landingContentHash,
      landingFetchedAt: itemRow.landingFetchedAt,
      landingParsedAt: itemRow.landingParsedAt,
      isGroupNode: Boolean(itemRow.isGroupNode),
      categoryDepth: displaySegments.length - 1,
      rawJson: JSON.stringify({
        templateTitle: itemRow.templateTitle,
        itemInternalName: itemRow.itemInternalName,
        itemName: itemRow.itemName,
        categoryPathText,
        sourceMaintItemCategoryRecordKey: itemRow.recordKey,
      }),
    };
    const current = assignmentCandidates.get(pairKey);
    if (!current || compareCategoryAssignmentCandidates(candidate, current) < 0) {
      assignmentCandidates.set(pairKey, candidate);
    }
  }

  const groupedAssignments = new Map();
  for (const candidate of assignmentCandidates.values()) {
    const list = groupedAssignments.get(candidate.itemInternalName) ?? [];
    list.push(candidate);
    groupedAssignments.set(candidate.itemInternalName, list);
  }

  const assignmentRows = [];
  for (const candidates of groupedAssignments.values()) {
    candidates.sort(compareCategoryAssignmentCandidates);
    candidates.forEach((candidate, index) => {
      const isPrimary = index === 0;
      assignmentRows.push({
        scope: 'categories',
        tableName: 'maint_item_category_assignments',
        recordKey: createRecordKey({
          tableName: 'maint_item_category_assignments',
          itemInternalName: candidate.itemInternalName,
          categoryNodeKey: candidate.categoryNodeKey,
        }),
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        categoryNodeKey: candidate.categoryNodeKey,
        categoryPathText: candidate.categoryPathText,
        isPrimary,
        assignmentReason: isPrimary ? 'priority:non_group_deepest_path' : 'priority:secondary_non_group_deepest_path',
        sourceTemplateTitle: candidate.sourceTemplateTitle,
        sourceItemName: candidate.sourceItemName,
        sourceParentItemName: candidate.sourceParentItemName,
        sourceMaintCategoryRecordKey: candidate.sourceMaintCategoryRecordKey,
        sourceMaintItemCategoryRecordKey: candidate.sourceMaintItemCategoryRecordKey,
        sourceProvider: candidate.sourceProvider,
        sourcePage: candidate.sourcePage,
        sourceRevisionTimestamp: candidate.sourceRevisionTimestamp,
        landingSourceId: candidate.landingSourceId,
        landingSourceKey: candidate.landingSourceKey,
        landingSourcePage: candidate.landingSourcePage,
        landingContentHash: candidate.landingContentHash,
        landingFetchedAt: candidate.landingFetchedAt,
        landingParsedAt: candidate.landingParsedAt,
        rawJson: candidate.rawJson,
      });
      if (isPrimary) summary.primaryAssignments += 1;
      else summary.secondaryAssignments += 1;
    });
  }

  summary.nodeRows = nodeMap.size;
  summary.assignmentRows = assignmentRows.length;

  return {
    rows: [...nodeMap.values(), ...assignmentRows],
    summary,
  };
}

function buildCategoryDisplaySegments(record) {
  const segments = [];
  pushCategorySegment(segments, record.topLevel);
  pushCategorySegment(segments, record.sectionTitle);
  pushCategorySegment(segments, record.groupName);
  for (const pathName of Array.isArray(record.pathNames) ? record.pathNames : []) {
    pushCategorySegment(segments, pathName);
  }
  if (segments.length === 0) {
    pushCategorySegment(segments, record.itemName);
  }
  return segments;
}

function pushCategorySegment(target, value) {
  const text = normalizeText(value);
  if (text) {
    target.push(text);
  }
}

function buildCategoryNodeKey(segments) {
  return segments
    .map((segment) => normalizeCategoryKeySegment(segment))
    .filter(Boolean)
    .join('::');
}

function normalizeCategoryKeySegment(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function compareCategoryAssignmentCandidates(left, right) {
  if (left.isGroupNode !== right.isGroupNode) {
    return left.isGroupNode ? 1 : -1;
  }
  if (left.categoryDepth !== right.categoryDepth) {
    return right.categoryDepth - left.categoryDepth;
  }
  const pathCompare = String(left.categoryPathText).localeCompare(String(right.categoryPathText));
  if (pathCompare !== 0) {
    return pathCompare;
  }
  return String(left.sourceMaintItemCategoryRecordKey).localeCompare(String(right.sourceMaintItemCategoryRecordKey));
}

function buildShimmerBaseMaintRow(landingRow, record, extra = {}) {
  return {
    scope: 'shimmer',
    recordKey: createRecordKey({
      tableName: extra.tableName,
      sourcePage: payloadPageTitleOrSource(record, landingRow),
      code: record.code,
    }),
    code: normalizeText(record.code),
    sourceSection: normalizeText(record.sourceSection),
    sourceProvider: landingRow.provider,
    sourcePage: normalizeText(record.sourcePage) ?? landingRow.source_page,
    sourceRevisionTimestamp: record.sourceRevisionTimestamp ?? landingRow.source_revision_timestamp,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(record),
    ...extra,
  };
}

function payloadPageTitleOrSource(record, landingRow) {
  return normalizeText(record?.sourcePage) ?? normalizeText(landingRow.source_page);
}

function extractShimmerItemTransformMaintRows(landingRow, records) {
  return records.map((record, index) => ({
    ...buildShimmerBaseMaintRow(landingRow, record, {
      tableName: 'maint_shimmer_item_transforms',
    }),
    inputKind: normalizeText(record.inputKind) ?? 'item',
    inputNameZh: normalizeText(record.inputNameZh),
    inputNameEn: normalizeText(record.inputNameEn),
    inputInternalName: normalizeText(record.inputInternalName),
    outputKind: normalizeText(record.outputKind) ?? 'item',
    outputNameZh: normalizeText(record.outputNameZh),
    outputNameEn: normalizeText(record.outputNameEn),
    outputInternalName: normalizeText(record.outputInternalName),
    conditionsJson: JSON.stringify(record.conditions ?? []),
    notes: normalizeText(record.notes),
    sortOrder: Number(index + 1),
  }));
}

function extractShimmerDecraftRuleMaintRows(landingRow, records) {
  return records.map((record, index) => ({
    ...buildShimmerBaseMaintRow(landingRow, record, {
      tableName: 'maint_shimmer_decraft_rules',
    }),
    ruleType: normalizeText(record.ruleType),
    groupLabel: normalizeText(record.groupLabel),
    inputKind: normalizeText(record.input?.kind) ?? 'item',
    inputNameZh: normalizeText(record.input?.nameZh),
    inputNameEn: normalizeText(record.input?.nameEn),
    inputInternalName: normalizeText(record.input?.internalName),
    outputsJson: JSON.stringify(record.outputs ?? []),
    conditionsJson: JSON.stringify(record.conditions ?? []),
    notes: normalizeText(record.notes),
    sortOrder: Number(index + 1),
  }));
}

function extractShimmerEntityTransformMaintRows(landingRow, records) {
  return records.map((record, index) => ({
    ...buildShimmerBaseMaintRow(landingRow, record, {
      tableName: 'maint_shimmer_entity_transforms',
    }),
    transformGroup: normalizeText(record.transformGroup),
    inputEntityType: normalizeText(record.input?.kind),
    inputNameZh: normalizeText(record.input?.nameZh),
    inputNameEn: normalizeText(record.input?.nameEn),
    inputInternalName: normalizeText(record.input?.internalName),
    outputEntityType: normalizeText(record.output?.kind),
    outputNameZh: normalizeText(record.output?.nameZh),
    outputNameEn: normalizeText(record.output?.nameEn),
    outputInternalName: normalizeText(record.output?.internalName),
    sortOrder: Number(index + 1),
  }));
}

function extractShimmerNpcTransformMaintRows(landingRow, records) {
  return records.map((record, index) => ({
    ...buildShimmerBaseMaintRow(landingRow, record, {
      tableName: 'maint_shimmer_npc_transforms',
    }),
    npcNameZh: normalizeText(record.npc?.nameZh),
    npcNameEn: normalizeText(record.npc?.nameEn),
    npcInternalName: normalizeText(record.npc?.internalName),
    appearanceVariant: normalizeText(record.appearanceVariant),
    effectType: normalizeText(record.effectType),
    variantImageUrl: normalizeText(record.variantImageUrl),
    variantImageAlt: normalizeText(record.variantImageAlt),
    notes: normalizeText(record.notes),
    sortOrder: Number(index + 1),
  }));
}

function extractShimmerMaintRows(landingRow, payload) {
  const pageRow = {
    scope: 'shimmer',
    tableName: 'maint_shimmer_pages',
    recordKey: createRecordKey(payload),
    entity: normalizeText(payload.entity),
    generatedAt: payload.generatedAt ?? null,
    requestedPageTitle: normalizeText(payload.requestedPageTitle),
    pageTitle: normalizeText(payload.pageTitle),
    pageId: Number(payload.pageId ?? 0) || null,
    revisionId: Number(payload.revisionId ?? 0) || null,
    sourceProvider: landingRow.provider,
    sourcePage: landingRow.source_page,
    sourceRevisionTimestamp: payload.revisionTimestamp ?? landingRow.source_revision_timestamp,
    fetchedAt: payload.fetchedAt ?? null,
    sectionsJson: JSON.stringify(payload.sections ?? []),
    wikitext: payload.wikitext ?? null,
    html: payload.html ?? null,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: landingRow.source_key,
    landingSourcePage: landingRow.source_page,
    landingContentHash: landingRow.content_hash,
    landingFetchedAt: landingRow.fetched_at,
    landingParsedAt: landingRow.parsed_at,
    rawJson: JSON.stringify(payload),
  };
  const structured = extractShimmerStructuredRecords(payload);
  return [
    pageRow,
    ...extractShimmerItemTransformMaintRows(landingRow, structured.itemTransforms),
    ...extractShimmerDecraftRuleMaintRows(landingRow, structured.decraftRules),
    ...extractShimmerEntityTransformMaintRows(landingRow, structured.entityTransforms),
    ...extractShimmerNpcTransformMaintRows(landingRow, structured.npcTransforms),
  ];
}

export async function extractMaintEntitiesFromLandingRow(landingRow, options = {}) {
  const payload = normalizeLandingPayload(landingRow);
  const datasetType = landingRow.dataset_type;
  const zhSourceIndexes = options.zhSourceIndexes ?? null;
  if (datasetType === 'items_raw') {
    const rows = extractItemsMaintRows(landingRow, payload, zhSourceIndexes);
    return { scope: 'items', rows };
  }
  if (datasetType === 'npcs_raw') {
    const rows = extractNpcsMaintRows(landingRow, payload, zhSourceIndexes);
    return { scope: 'npcs', rows };
  }
  if (datasetType === 'projectiles_raw') {
    const rows = extractProjectilesMaintRows(landingRow, payload, zhSourceIndexes);
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
      ...extractItemSourceMaintRows(landingRow, payload),
      ...extractItemBiomeMaintRows(landingRow, payload),
      ...extractSnapshotMaintRows(landingRow, payload),
    ];
    return { scope: 'bundle_relations', rows };
  }
  if (datasetType === 'bosses_raw') {
    const rows = extractBossMaintRows(landingRow, payload);
    return { scope: 'bosses', rows };
  }
  if (datasetType === 'biomes_raw') {
    const rows = extractBiomeMaintRows(landingRow, payload);
    return { scope: 'biomes', rows };
  }
  if (datasetType === 'armor_sets_raw') {
    const rows = extractArmorSetMaintRows(landingRow, payload);
    return { scope: 'armor_sets', rows };
  }
  if (datasetType === 'categories_raw') {
    const categoryResult = extractCategoryMaintRows(landingRow, payload);
    return { scope: 'categories', rows: categoryResult.rows, categoryRules: categoryResult.categoryRules };
  }
  if (datasetType === 'shimmer_raw') {
    const rows = extractShimmerMaintRows(landingRow, payload);
    return { scope: 'shimmer', rows };
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
    categoryRules: null,
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
    categoryRules: null,
  };
}

function mergeCategoryRuleSummary(summary, categoryRules) {
  if (!categoryRules) {
    return;
  }
  if (!summary.categoryRules) {
    summary.categoryRules = {
      nodeRows: 0,
      assignmentRows: 0,
      unmatchedItems: 0,
      primaryAssignments: 0,
      secondaryAssignments: 0,
    };
  }
  summary.categoryRules.nodeRows += Number(categoryRules.nodeRows ?? 0);
  summary.categoryRules.assignmentRows += Number(categoryRules.assignmentRows ?? 0);
  summary.categoryRules.unmatchedItems += Number(categoryRules.unmatchedItems ?? 0);
  summary.categoryRules.primaryAssignments += Number(categoryRules.primaryAssignments ?? 0);
  summary.categoryRules.secondaryAssignments += Number(categoryRules.secondaryAssignments ?? 0);
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

function filterRowsByScopes(rows, scopes) {
  const scopeSet = new Set(scopes);
  return rows.filter((row) => scopeSet.has(row.scope));
}

function shouldInvalidateCurrentCategoryRuleTables(scopes) {
  return Array.isArray(scopes) && scopes.includes('categories');
}

async function invalidateCurrentCategoryRuleTables(connection) {
  await connection.execute('UPDATE `maint_category_nodes` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE deleted = 0');
  await connection.execute('UPDATE `maint_item_category_assignments` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE deleted = 0');
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
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, wikitext = ?, html = ?, recipes_markup = ?, sell_text = ?, sell_value = ?, raw_json = ?,
             status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.wikitext, row.html, row.recipesMarkup, row.sellText, row.sellValue, row.rawJson,
          Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`entity_type\`, \`requested_page_title\`, \`page_title\`, \`page_id\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`wikitext\`, \`html\`, \`recipes_markup\`, \`sell_text\`, \`sell_value\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.wikitext, row.html, row.recipesMarkup, row.sellText, row.sellValue, row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_page_recipes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET page_title = ?, item_internal_name = ?, item_name = ?, result_internal_name = ?, result_name = ?, result_quantity = ?, version_scope = ?,
             source_context_page = ?, source_context_page_slug = ?, source_context_display_name = ?, ingredients_json = ?, stations_json = ?, sort_order = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.pageTitle, row.itemInternalName, row.itemName, row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope,
          row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.ingredientsJson, row.stationsJson, row.sortOrder,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`page_title\`, \`item_internal_name\`, \`item_name\`, \`result_internal_name\`, \`result_name\`, \`result_quantity\`, \`version_scope\`,
        \`source_context_page\`, \`source_context_page_slug\`, \`source_context_display_name\`, \`ingredients_json\`, \`stations_json\`, \`sort_order\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.pageTitle, row.itemInternalName, row.itemName, row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope,
        row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.ingredientsJson, row.stationsJson, row.sortOrder,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
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

  if (row.tableName === 'maint_recipe_page_recipes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET page_title = ?, page_slug = ?, table_caption = ?, result_internal_name = ?, result_name = ?, result_quantity = ?, version_scope = ?,
             source_context_page = ?, source_context_page_slug = ?, source_context_display_name = ?, source_context_url = ?, ingredients_json = ?, stations_json = ?, sort_order = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.pageTitle, row.pageSlug, row.tableCaption, row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope,
          row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.sourceContextUrl, row.ingredientsJson, row.stationsJson, row.sortOrder,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`page_title\`, \`page_slug\`, \`table_caption\`, \`result_internal_name\`, \`result_name\`, \`result_quantity\`, \`version_scope\`,
        \`source_context_page\`, \`source_context_page_slug\`, \`source_context_display_name\`, \`source_context_url\`, \`ingredients_json\`, \`stations_json\`, \`sort_order\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.pageTitle, row.pageSlug, row.tableCaption, row.resultInternalName, row.resultName, row.resultQuantity, row.versionScope,
        row.sourceContextPage, row.sourceContextPageSlug, row.sourceContextDisplayName, row.sourceContextUrl, row.ingredientsJson, row.stationsJson, row.sortOrder,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
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

  if (row.tableName === 'maint_item_sources') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET item_internal_name = ?, item_name = ?, source_type = ?, source_ref_type = ?, source_ref_name = ?, sort_order = ?, biome_code = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.sourceType, row.sourceRefType, row.sourceRefName, row.sortOrder, row.biomeCode,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
          Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`source_type\`, \`source_ref_type\`, \`source_ref_name\`, \`sort_order\`, \`biome_code\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.sourceType, row.sourceRefType, row.sourceRefName, row.sortOrder, row.biomeCode,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_biomes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET item_internal_name = ?, item_name = ?, biome_code = ?, relation_type = ?, notes = ?, sort_order = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.biomeCode, row.relationType, row.notes, row.sortOrder,
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`biome_code\`, \`relation_type\`, \`notes\`, \`sort_order\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.biomeCode, row.relationType, row.notes, row.sortOrder,
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_source_snapshots') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET entity_type = ?, item_internal_name = ?, item_name = ?, source_provider = ?, source_kind = ?, source_locator = ?, source_page = ?, source_revision_timestamp = ?,
             snapshot_payload_json = ?, snapshot_fetched_at = ?, is_current = ?, parse_status = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.entityType, row.itemInternalName, row.itemName, row.sourceProvider, row.sourceKind, row.sourceLocator, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.snapshotPayloadJson, toMysqlDateTime(row.snapshotFetchedAt), row.isCurrent ? 1 : 0, row.parseStatus,
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`entity_type\`, \`item_internal_name\`, \`item_name\`, \`source_provider\`, \`source_kind\`, \`source_locator\`, \`source_page\`, \`source_revision_timestamp\`,
        \`snapshot_payload_json\`, \`snapshot_fetched_at\`, \`is_current\`, \`parse_status\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.entityType, row.itemInternalName, row.itemName, row.sourceProvider, row.sourceKind, row.sourceLocator, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.snapshotPayloadJson, toMysqlDateTime(row.snapshotFetchedAt), row.isCurrent ? 1 : 0, row.parseStatus,
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_bosses') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET progression_order = ?, order_within_group = ?, group_name_en = ?, group_name_zh = ?, group_type = ?, title_en = ?, title_zh = ?, page_title_en = ?, page_title_zh = ?,
             page_id = ?, revision_id = ?, source_provider = ?, source_page = ?, source_url = ?, source_url_zh = ?, source_revision_timestamp = ?, image_url = ?, notes = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?,
             status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.progressionOrder, row.orderWithinGroup, row.groupNameEn, row.groupNameZh, row.groupType, row.titleEn, row.titleZh, row.pageTitleEn, row.pageTitleZh,
          row.pageId, row.revisionId, row.sourceProvider, row.sourcePage, row.sourceUrl, row.sourceUrlZh, toMysqlDateTime(row.sourceRevisionTimestamp), row.imageUrl, row.notes,
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
          Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`progression_order\`, \`order_within_group\`, \`group_name_en\`, \`group_name_zh\`, \`group_type\`, \`title_en\`, \`title_zh\`, \`page_title_en\`, \`page_title_zh\`,
        \`page_id\`, \`revision_id\`, \`source_provider\`, \`source_page\`, \`source_url\`, \`source_url_zh\`, \`source_revision_timestamp\`, \`image_url\`, \`notes\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.progressionOrder, row.orderWithinGroup, row.groupNameEn, row.groupNameZh, row.groupType, row.titleEn, row.titleZh, row.pageTitleEn, row.pageTitleZh,
        row.pageId, row.revisionId, row.sourceProvider, row.sourcePage, row.sourceUrl, row.sourceUrlZh, toMysqlDateTime(row.sourceRevisionTimestamp), row.imageUrl, row.notes,
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_biomes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET biome_code = ?, entity_type = ?, requested_page_title = ?, page_title = ?, page_id = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             wikitext = ?, html = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.biomeCode, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.wikitext, row.html, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`biome_code\`, \`entity_type\`, \`requested_page_title\`, \`page_title\`, \`page_id\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`wikitext\`, \`html\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.biomeCode, row.entityType, row.requestedPageTitle, row.pageTitle, row.pageId, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.wikitext, row.html, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_armor_sets') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET text_key = ?, benefit_expression = ?, primary_part = ?, set_count = ?, unique_item_count = ?, sets_json = ?, unique_item_ids_json = ?, terraria_version = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?,
             landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.textKey, row.benefitExpression, row.primaryPart, row.setCount, row.uniqueItemCount, row.setsJson, row.uniqueItemIdsJson, row.terrariaVersion,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash,
          toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`text_key\`, \`benefit_expression\`, \`primary_part\`, \`set_count\`, \`unique_item_count\`, \`sets_json\`, \`unique_item_ids_json\`, \`terraria_version\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`,
        \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.textKey, row.benefitExpression, row.primaryPart, row.setCount, row.uniqueItemCount, row.setsJson, row.uniqueItemIdsJson, row.terrariaVersion,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash,
        toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_categories') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET top_level = ?, template_title = ?, source_page_id = ?, source_revision_id = ?, source_revision_timestamp = ?, rendered_html_length = ?, section_count = ?, item_count = ?,
             sections_json = ?, source_provider = ?, source_page = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.topLevel, row.templateTitle, row.sourcePageId, row.sourceRevisionId, toMysqlDateTime(row.sourceRevisionTimestamp), row.renderedHtmlLength, row.sectionCount, row.itemCount,
          row.sectionsJson, row.sourceProvider, row.sourcePage, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`top_level\`, \`template_title\`, \`source_page_id\`, \`source_revision_id\`, \`source_revision_timestamp\`, \`rendered_html_length\`, \`section_count\`, \`item_count\`,
        \`sections_json\`, \`source_provider\`, \`source_page\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.topLevel, row.templateTitle, row.sourcePageId, row.sourceRevisionId, toMysqlDateTime(row.sourceRevisionTimestamp), row.renderedHtmlLength, row.sectionCount, row.itemCount,
        row.sectionsJson, row.sourceProvider, row.sourcePage, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_categories') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET top_level = ?, template_title = ?, section_title = ?, group_name = ?, item_internal_name = ?, item_english_name = ?, item_name = ?, item_href = ?,
             item_count = ?, parent_item_name = ?, depth = ?, is_group_node = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.topLevel, row.templateTitle, row.sectionTitle, row.groupName, row.itemInternalName, row.itemEnglishName, row.itemName, row.itemHref,
          row.itemCount, row.parentItemName, row.depth, row.isGroupNode ? 1 : 0, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`top_level\`, \`template_title\`, \`section_title\`, \`group_name\`, \`item_internal_name\`, \`item_english_name\`, \`item_name\`, \`item_href\`,
        \`item_count\`, \`parent_item_name\`, \`depth\`, \`is_group_node\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.topLevel, row.templateTitle, row.sectionTitle, row.groupName, row.itemInternalName, row.itemEnglishName, row.itemName, row.itemHref,
        row.itemCount, row.parentItemName, row.depth, row.isGroupNode ? 1 : 0, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_category_nodes') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET node_key = ?, parent_node_key = ?, top_level = ?, section_title = ?, group_name = ?, node_name = ?, path_text = ?, depth = ?, is_group_node = ?,
             source_template_title = ?, source_maint_category_record_key = ?, source_maint_item_category_record_key = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.nodeKey, row.parentNodeKey, row.topLevel, row.sectionTitle, row.groupName, row.nodeName, row.pathText, row.depth, row.isGroupNode ? 1 : 0,
          row.sourceTemplateTitle, row.sourceMaintCategoryRecordKey, row.sourceMaintItemCategoryRecordKey,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`node_key\`, \`parent_node_key\`, \`top_level\`, \`section_title\`, \`group_name\`, \`node_name\`, \`path_text\`, \`depth\`, \`is_group_node\`,
        \`source_template_title\`, \`source_maint_category_record_key\`, \`source_maint_item_category_record_key\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.nodeKey, row.parentNodeKey, row.topLevel, row.sectionTitle, row.groupName, row.nodeName, row.pathText, row.depth, row.isGroupNode ? 1 : 0,
        row.sourceTemplateTitle, row.sourceMaintCategoryRecordKey, row.sourceMaintItemCategoryRecordKey,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_item_category_assignments') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET item_internal_name = ?, item_name = ?, category_node_key = ?, category_path_text = ?, is_primary = ?, assignment_reason = ?,
             source_template_title = ?, source_item_name = ?, source_parent_item_name = ?, source_maint_category_record_key = ?, source_maint_item_category_record_key = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.itemInternalName, row.itemName, row.categoryNodeKey, row.categoryPathText, row.isPrimary ? 1 : 0, row.assignmentReason,
          row.sourceTemplateTitle, row.sourceItemName, row.sourceParentItemName, row.sourceMaintCategoryRecordKey, row.sourceMaintItemCategoryRecordKey,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`item_internal_name\`, \`item_name\`, \`category_node_key\`, \`category_path_text\`, \`is_primary\`, \`assignment_reason\`,
        \`source_template_title\`, \`source_item_name\`, \`source_parent_item_name\`, \`source_maint_category_record_key\`, \`source_maint_item_category_record_key\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.itemInternalName, row.itemName, row.categoryNodeKey, row.categoryPathText, row.isPrimary ? 1 : 0, row.assignmentReason,
        row.sourceTemplateTitle, row.sourceItemName, row.sourceParentItemName, row.sourceMaintCategoryRecordKey, row.sourceMaintItemCategoryRecordKey,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_shimmer_pages') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET entity = ?, generated_at = ?, requested_page_title = ?, page_title = ?, page_id = ?, revision_id = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             fetched_at = ?, sections_json = ?, wikitext = ?, html = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.entity, toMysqlDateTime(row.generatedAt), row.requestedPageTitle, row.pageTitle, row.pageId, row.revisionId, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          toMysqlDateTime(row.fetchedAt), row.sectionsJson, row.wikitext, row.html, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`entity\`, \`generated_at\`, \`requested_page_title\`, \`page_title\`, \`page_id\`, \`revision_id\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`fetched_at\`, \`sections_json\`, \`wikitext\`, \`html\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.entity, toMysqlDateTime(row.generatedAt), row.requestedPageTitle, row.pageTitle, row.pageId, row.revisionId, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        toMysqlDateTime(row.fetchedAt), row.sectionsJson, row.wikitext, row.html, row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_shimmer_item_transforms') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET code = ?, source_section = ?, input_kind = ?, input_name_zh = ?, input_name_en = ?, input_internal_name = ?,
             output_kind = ?, output_name_zh = ?, output_name_en = ?, output_internal_name = ?, conditions_json = ?, notes = ?, sort_order = ?,
             source_provider = ?, source_page = ?, source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?,
             landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.code, row.sourceSection, row.inputKind, row.inputNameZh, row.inputNameEn, row.inputInternalName,
          row.outputKind, row.outputNameZh, row.outputNameEn, row.outputInternalName, row.conditionsJson, row.notes, row.sortOrder,
          row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
          row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`code\`, \`source_section\`, \`input_kind\`, \`input_name_zh\`, \`input_name_en\`, \`input_internal_name\`,
        \`output_kind\`, \`output_name_zh\`, \`output_name_en\`, \`output_internal_name\`, \`conditions_json\`, \`notes\`, \`sort_order\`,
        \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`,
        \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.code, row.sourceSection, row.inputKind, row.inputNameZh, row.inputNameEn, row.inputInternalName,
        row.outputKind, row.outputNameZh, row.outputNameEn, row.outputInternalName, row.conditionsJson, row.notes, row.sortOrder,
        row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage,
        row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_shimmer_decraft_rules') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET code = ?, rule_type = ?, group_label = ?, source_section = ?, input_kind = ?, input_name_zh = ?, input_name_en = ?, input_internal_name = ?,
             outputs_json = ?, conditions_json = ?, notes = ?, sort_order = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.code, row.ruleType, row.groupLabel, row.sourceSection, row.inputKind, row.inputNameZh, row.inputNameEn, row.inputInternalName,
          row.outputsJson, row.conditionsJson, row.notes, row.sortOrder, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`code\`, \`rule_type\`, \`group_label\`, \`source_section\`, \`input_kind\`, \`input_name_zh\`, \`input_name_en\`, \`input_internal_name\`,
        \`outputs_json\`, \`conditions_json\`, \`notes\`, \`sort_order\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.code, row.ruleType, row.groupLabel, row.sourceSection, row.inputKind, row.inputNameZh, row.inputNameEn, row.inputInternalName,
        row.outputsJson, row.conditionsJson, row.notes, row.sortOrder, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
        row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_shimmer_entity_transforms') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET code = ?, transform_group = ?, source_section = ?, input_entity_type = ?, input_name_zh = ?, input_name_en = ?, input_internal_name = ?,
             output_entity_type = ?, output_name_zh = ?, output_name_en = ?, output_internal_name = ?, sort_order = ?, source_provider = ?, source_page = ?,
             source_revision_timestamp = ?, landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?,
             landing_parsed_at = ?, raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.code, row.transformGroup, row.sourceSection, row.inputEntityType, row.inputNameZh, row.inputNameEn, row.inputInternalName,
          row.outputEntityType, row.outputNameZh, row.outputNameEn, row.outputInternalName, row.sortOrder, row.sourceProvider, row.sourcePage,
          toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt),
          toMysqlDateTime(row.landingParsedAt), row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`code\`, \`transform_group\`, \`source_section\`, \`input_entity_type\`, \`input_name_zh\`, \`input_name_en\`, \`input_internal_name\`,
        \`output_entity_type\`, \`output_name_zh\`, \`output_name_en\`, \`output_internal_name\`, \`sort_order\`, \`source_provider\`, \`source_page\`,
        \`source_revision_timestamp\`, \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`,
        \`landing_parsed_at\`, \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.code, row.transformGroup, row.sourceSection, row.inputEntityType, row.inputNameZh, row.inputNameEn, row.inputInternalName,
        row.outputEntityType, row.outputNameZh, row.outputNameEn, row.outputInternalName, row.sortOrder, row.sourceProvider, row.sourcePage,
        toMysqlDateTime(row.sourceRevisionTimestamp), row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt),
        toMysqlDateTime(row.landingParsedAt), row.rawJson,
      ],
    );
    return 'inserted';
  }

  if (row.tableName === 'maint_shimmer_npc_transforms') {
    const [existingRows] = await connection.execute(`SELECT id FROM \`${row.tableName}\` WHERE record_key = ? LIMIT 1`, [row.recordKey]);
    const existing = existingRows[0] ?? null;
    if (existing) {
      await connection.execute(
        `UPDATE \`${row.tableName}\`
         SET code = ?, source_section = ?, npc_name_zh = ?, npc_name_en = ?, npc_internal_name = ?, appearance_variant = ?, effect_type = ?,
             variant_image_url = ?, variant_image_alt = ?, notes = ?, sort_order = ?, source_provider = ?, source_page = ?, source_revision_timestamp = ?,
             landing_source_id = ?, landing_source_key = ?, landing_source_page = ?, landing_content_hash = ?, landing_fetched_at = ?, landing_parsed_at = ?,
             raw_json = ?, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          row.code, row.sourceSection, row.npcNameZh, row.npcNameEn, row.npcInternalName, row.appearanceVariant, row.effectType,
          row.variantImageUrl, row.variantImageAlt, row.notes, row.sortOrder, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
          row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
          row.rawJson, Number(existing.id),
        ],
      );
      return 'updated';
    }
    await connection.execute(
      `INSERT INTO \`${row.tableName}\`
       (\`record_key\`, \`code\`, \`source_section\`, \`npc_name_zh\`, \`npc_name_en\`, \`npc_internal_name\`, \`appearance_variant\`, \`effect_type\`,
        \`variant_image_url\`, \`variant_image_alt\`, \`notes\`, \`sort_order\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`,
        \`landing_source_id\`, \`landing_source_key\`, \`landing_source_page\`, \`landing_content_hash\`, \`landing_fetched_at\`, \`landing_parsed_at\`,
        \`raw_json\`, \`status\`, \`deleted\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.recordKey, row.code, row.sourceSection, row.npcNameZh, row.npcNameEn, row.npcInternalName, row.appearanceVariant, row.effectType,
        row.variantImageUrl, row.variantImageAlt, row.notes, row.sortOrder, row.sourceProvider, row.sourcePage, toMysqlDateTime(row.sourceRevisionTimestamp),
        row.landingSourceId, row.landingSourceKey, row.landingSourcePage, row.landingContentHash, toMysqlDateTime(row.landingFetchedAt), toMysqlDateTime(row.landingParsedAt),
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
  if (row.tableName === 'maint_npcs') {
    nowFields.splice(4, 0, 'sub_name_zh');
    values.splice(4, 0, row.subNameZh ?? null);
  }

  const [existingRows] = await connection.execute(
    `SELECT id FROM \`${row.tableName}\` WHERE source_id = ? LIMIT 1`,
    [row.sourceId],
  );
  const existing = existingRows[0] ?? null;
  if (existing) {
    await connection.execute(
      `UPDATE \`${row.tableName}\`
       SET ${nowFields
         .filter((field) => field !== 'source_id' && field !== 'status' && field !== 'deleted')
         .map((field) => `\`${field}\` = ?`)
         .join(', ')}, status = 1, deleted = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        ...values.slice(1, values.length - 2),
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

async function getTableColumns(connection, tableName) {
  const result = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  const rows = Array.isArray(result) ? result[0] : [];
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function ensureMaintMigrations(connection) {
  const migrations = [
    {
      tableName: 'maint_npcs',
      columns: [
        ['sub_name_zh', 'VARCHAR(255) DEFAULT NULL AFTER `name_zh`']
      ]
    },
    {
      tableName: 'maint_item_pages',
      columns: [
        ['sell_text', 'VARCHAR(255) DEFAULT NULL AFTER `recipes_markup`'],
        ['sell_value', 'INT DEFAULT NULL AFTER `sell_text`']
      ]
    },
    {
      tableName: 'maint_item_text_overrides',
      columns: [
        ['description_zh', 'TEXT AFTER `tooltip_zh`']
      ]
    }
  ];

  for (const migration of migrations) {
    const existingColumns = await getTableColumns(connection, migration.tableName);
    for (const [columnName, definition] of migration.columns) {
      if (existingColumns.has(columnName)) {
        continue;
      }
      await connection.query(`ALTER TABLE \`${migration.tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
      existingColumns.add(columnName);
    }
  }
}

export async function runMaintSync(options, dependencies = {}) {
  const mysqlModule = dependencies.mysqlModule ?? mysql;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const scopes = Array.isArray(options.scopes) ? options.scopes : resolveScopes(options.scopes);
  const zhSourceIndexes = dependencies.zhSourceIndexes
    ?? (dependencies.loadZhSourceIndexes ? await dependencies.loadZhSourceIndexes() : loadZhSourceIndexes({ repoRoot }));
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
    const categoryRuleSummary = {
      nodeRows: 0,
      assignmentRows: 0,
      unmatchedItems: 0,
      primaryAssignments: 0,
      secondaryAssignments: 0,
    };
    let hasCategoryRuleSummary = false;
    const seenRecordKeys = new Set();
    for (const landingRow of loaded) {
      const result = await extractMaintEntitiesFromLandingRow(landingRow, { zhSourceIndexes });
      if (result.categoryRules) {
        mergeCategoryRuleSummary({ categoryRules: categoryRuleSummary }, result.categoryRules);
        hasCategoryRuleSummary = true;
      }
      extracted.push(...filterRowsByScopes(dedupeEntityRows(result.rows, seenRecordKeys), scopes));
    }

    const summary = buildMaintSyncSummary({ apply: options.apply, scopes }, extracted);
    if (hasCategoryRuleSummary) {
      summary.categoryRules = categoryRuleSummary;
    }

    if (options.apply) {
      const connection = await mysqlModule.createConnection(connectionConfig);
      try {
        await connection.beginTransaction();
        await connection.query(buildMaintSchemaSql());
        await ensureMaintMigrations(connection);
        if (shouldInvalidateCurrentCategoryRuleTables(scopes)) {
          await invalidateCurrentCategoryRuleTables(connection);
        }
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
      await ensureMaintMigrations(writeConnection);
      if (shouldInvalidateCurrentCategoryRuleTables(scopes)) {
        await invalidateCurrentCategoryRuleTables(writeConnection);
      }
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
      const result = await extractMaintEntitiesFromLandingRow(landingRow, { zhSourceIndexes });
      mergeCategoryRuleSummary(summary, result.categoryRules);
      const dedupedRows = filterRowsByScopes(dedupeEntityRows(result.rows, seenRecordKeys), scopes);
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
