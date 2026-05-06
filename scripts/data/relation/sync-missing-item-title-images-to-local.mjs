#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const DEFAULT_PAGE_RECORDS_PATH = 'data/standardized/item_pages.standardized.json';
const DEFAULT_CATEGORY_IDS = [48, 50];
const WIKI_PROVIDER = 'wiki_gg';
const BACKUP_LABEL = 'title_image_backup';

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumberList(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  return parsed.length ? parsed : fallback;
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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    pageRecordsPath: raw['page-records'] ?? raw.pageRecordsPath ?? DEFAULT_PAGE_RECORDS_PATH,
    categoryIds: booleanOption(raw['all-categories'] ?? raw.allCategories, false)
      ? []
      : parseNumberList(raw['category-ids'] ?? raw.categoryIds, DEFAULT_CATEGORY_IDS),
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    backupSuffix: raw['backup-suffix'] ?? raw.backupSuffix ?? null
  };
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function qualified(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function toBackupSuffix(value = new Date()) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

export function deriveWikiPngUrl(pageTitle) {
  const title = toNullableText(pageTitle);
  if (!title) return null;
  const fileName = `${title.replace(/\s+/g, '_')}.png`;
  const encodedFileName = encodeURIComponent(fileName)
    .replaceAll("'", '%27')
    .replaceAll('%2F', '/');
  return `https://terraria.wiki.gg/images/${encodedFileName}`;
}

function normalizePageRecords(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.records)) return raw.records;
  return [];
}

async function defaultReadPageRecords(pageRecordsPath) {
  const absolutePath = path.isAbsolute(pageRecordsPath)
    ? pageRecordsPath
    : path.join(repoRoot, pageRecordsPath);
  const payload = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  return normalizePageRecords(payload);
}

function buildPageTitleLookup(pageRecords) {
  const lookup = new Map();
  for (const record of normalizePageRecords(pageRecords)) {
    const internalName = toNullableText(record?.itemInternalName ?? record?.internalName ?? record?.internal_name);
    const pageTitle = toNullableText(record?.pageTitle ?? record?.requestedPageTitle ?? record?.itemName ?? record?.name);
    if (internalName && pageTitle && !lookup.has(internalName.toLowerCase())) {
      lookup.set(internalName.toLowerCase(), pageTitle);
    }
  }
  return lookup;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasBlockedItemIconVariantToken(value) {
  return /(^|[/_\s-])(demo|placed)([._?&#/-]|$)/i.test(String(value ?? ''));
}

function isAcceptableItemIconUrl(value) {
  const text = toNullableText(value);
  if (!text) return false;
  const decoded = safeDecodeURIComponent(text).toLowerCase();
  return /^https?:\/\//i.test(decoded)
    && decoded.includes('terraria.wiki.gg')
    && !decoded.includes('/terrapedia-images/')
    && !decoded.includes('(demo)')
    && !decoded.includes('(placed)')
    && !hasBlockedItemIconVariantToken(decoded);
}

function hasAcceptableImage(item) {
  return isAcceptableItemIconUrl(item?.image ?? item?.image_url);
}

export function buildMissingItemTitleImagePlan({ localItems = [], pageRecords = [], categoryIds = DEFAULT_CATEGORY_IDS } = {}) {
  const categorySet = new Set((categoryIds ?? []).map(Number).filter((entry) => Number.isFinite(entry)));
  const pageTitleByInternal = buildPageTitleLookup(pageRecords);
  const updates = [];
  const skippedWithoutPage = [];

  for (const item of localItems) {
    const itemId = Number(item?.id);
    if (!Number.isFinite(itemId)) continue;
    const categoryId = Number(item?.category_id ?? item?.categoryId);
    if (categorySet.size && !categorySet.has(categoryId)) continue;
    if (hasAcceptableImage(item)) continue;
    const internalName = toNullableText(item?.internal_name ?? item?.internalName);
    const pageTitle = internalName ? pageTitleByInternal.get(internalName.toLowerCase()) : null;
    if (!pageTitle) {
      skippedWithoutPage.push({
        itemId,
        internalName,
        name: toNullableText(item?.name),
        categoryId
      });
      continue;
    }
    const imageUrl = deriveWikiPngUrl(pageTitle);
    if (!imageUrl) continue;
    updates.push({
      itemId,
      internalName,
      name: toNullableText(item?.name),
      categoryId,
      pageTitle,
      sourceFileTitle: `${pageTitle}.png`,
      imageUrl
    });
  }

  return {
    summary: {
      localItemCount: localItems.length,
      missingCandidateCount: updates.length + skippedWithoutPage.length,
      plannedUpdateCount: updates.length,
      skippedWithoutPageCount: skippedWithoutPage.length
    },
    updates,
    skippedWithoutPage
  };
}

async function defaultExecuteLocal(localDatabase, dependencies, fn) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const connection = await mysql.createConnection({
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: localDatabase
  });
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function defaultLoadLocalItems(connection, { localDatabase, categoryIds }) {
  const categoryFilter = categoryIds?.length
    ? `AND \`category_id\` IN (${categoryIds.map(() => '?').join(', ')})`
    : '';
  const [rows] = await connection.query(`
    SELECT \`id\`, \`internal_name\`, \`name\`, \`name_zh\`, \`image\`, \`category_id\`
      FROM ${qualified(localDatabase, 'items')}
     WHERE \`deleted\` = 0
       AND \`status\` = 1
       AND (
         \`image\` IS NULL
         OR TRIM(\`image\`) = ''
         OR \`image\` LIKE '%/terrapedia-images/%'
         OR LOWER(TRIM(\`image\`)) NOT LIKE 'http%'
         OR LOWER(TRIM(\`image\`)) NOT LIKE '%terraria.wiki.gg%'
         OR LOWER(TRIM(\`image\`)) LIKE '%(demo)%'
         OR LOWER(TRIM(\`image\`)) LIKE '%28demo%29%'
         OR LOWER(TRIM(\`image\`)) REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
         OR LOWER(TRIM(\`image\`)) LIKE '%(placed)%'
         OR LOWER(TRIM(\`image\`)) LIKE '%28placed%29%'
         OR LOWER(TRIM(\`image\`)) REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
       )
       ${categoryFilter}
     ORDER BY \`id\` ASC
  `, categoryIds ?? []);
  return rows;
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `missing-item-title-images-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function backupTable(connection, localDatabase, tableName, backupSuffix) {
  const backupTableName = `${tableName}_${BACKUP_LABEL}_${backupSuffix}`;
  await connection.query(`CREATE TABLE ${qualified(localDatabase, backupTableName)} LIKE ${qualified(localDatabase, tableName)}`);
  await connection.query(`INSERT INTO ${qualified(localDatabase, backupTableName)} SELECT * FROM ${qualified(localDatabase, tableName)}`);
  return backupTableName;
}

async function applyPlan(connection, localDatabase, plan, backupSuffix) {
  const backups = {};
  backups.items = await backupTable(connection, localDatabase, 'items', backupSuffix);
  backups.itemImages = await backupTable(connection, localDatabase, 'item_images', backupSuffix);

  await connection.query('START TRANSACTION');
  try {
    for (const update of plan.updates) {
      await connection.query(
        `UPDATE ${qualified(localDatabase, 'items')}
            SET \`image\` = ?,
                \`updated_at\` = NOW()
          WHERE \`id\` = ?`,
        [update.imageUrl, update.itemId]
      );
      await connection.query(
        `DELETE FROM ${qualified(localDatabase, 'item_images')}
          WHERE \`item_id\` = ?
            AND \`provider\` = ?
            AND (\`original_url\` = ? OR \`cached_url\` = ?)`,
        [update.itemId, WIKI_PROVIDER, update.imageUrl, update.imageUrl]
      );
      await connection.query(
        `INSERT INTO ${qualified(localDatabase, 'item_images')}
          (\`item_id\`, \`role\`, \`provider\`, \`source_file_title\`, \`source_page\`, \`original_url\`, \`cached_url\`, \`is_primary\`, \`sort_order\`, \`status\`, \`deleted\`, \`created_at\`, \`updated_at\`)
         VALUES (?, 'icon', ?, ?, ?, ?, ?, 1, 0, 1, 0, NOW(), NOW())`,
        [
          update.itemId,
          WIKI_PROVIDER,
          update.sourceFileTitle,
          update.pageTitle,
          update.imageUrl,
          update.imageUrl
        ]
      );
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }

  return backups;
}

export async function runMissingItemTitleImageSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    pageRecordsPath: options.pageRecordsPath ?? DEFAULT_PAGE_RECORDS_PATH,
    categoryIds: options.categoryIds ?? DEFAULT_CATEGORY_IDS,
    dateTag: options.dateTag ?? toDateTag(now),
    backupSuffix: options.backupSuffix ?? toBackupSuffix(now)
  };

  const readPageRecords = dependencies.readPageRecords ?? defaultReadPageRecords;
  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));
  const loadLocalItems = dependencies.loadLocalItems ?? defaultLoadLocalItems;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;

  const pageRecords = await readPageRecords(normalized.pageRecordsPath);
  return executeLocal(async (connection) => {
    const localItems = await loadLocalItems(connection, normalized);
    const plan = buildMissingItemTitleImagePlan({
      localItems,
      pageRecords,
      categoryIds: normalized.categoryIds
    });
    const backups = normalized.apply
      ? await applyPlan(connection, normalized.localDatabase, plan, normalized.backupSuffix)
      : {};
    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      pageRecordsPath: normalized.pageRecordsPath,
      categoryIds: normalized.categoryIds,
      backupSuffix: normalized.backupSuffix,
      backups,
      summary: plan.summary,
      updates: plan.updates.slice(0, 500),
      skippedWithoutPage: plan.skippedWithoutPage.slice(0, 200)
    };
    const reportPath = await writeReport(report);
    return { report, reportPath, plan };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runMissingItemTitleImageSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Local database: ${result.report.localDatabase}`);
  console.log(`Category IDs: ${result.report.categoryIds.join(',')}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Planned updates: ${result.report.summary.plannedUpdateCount}`);
  console.log(`Skipped without page: ${result.report.summary.skippedWithoutPageCount}`);
}
