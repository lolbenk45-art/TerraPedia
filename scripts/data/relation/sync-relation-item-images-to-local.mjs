#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
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

function toDateTag(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toBackupSuffix(value = new Date()) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

function acceptableWikiUrlSql(expression) {
  return `
        ${expression} NOT LIKE '%/terrapedia-images/%'
        AND LOWER(${expression}) NOT LIKE '%(demo)%'
        AND LOWER(${expression}) NOT LIKE '%28demo%29%'
        AND LOWER(${expression}) NOT LIKE '%_demo%'
        AND LOWER(${expression}) NOT LIKE '%(placed)%'
        AND LOWER(${expression}) NOT LIKE '%28placed%29%'
        AND LOWER(${expression}) NOT LIKE '%_placed%'
        AND LOWER(${expression}) NOT LIKE '%/placed_%'
  `.trim();
}

function acceptableWikiUrlCondition(alias, column) {
  const expression = `${alias}.\`${column}\``;
  return `
        ${expression} IS NOT NULL
        AND TRIM(${expression}) <> ''
        AND ${acceptableWikiUrlSql(expression)}
  `.trim();
}

function acceptableSourceTitleCondition(alias) {
  const expression = `${alias}.\`source_file_title\``;
  return `
        (
          ${expression} IS NULL
          OR TRIM(${expression}) = ''
          OR (
            LOWER(${expression}) NOT LIKE '%(demo)%'
            AND LOWER(${expression}) NOT LIKE '%_demo%'
            AND LOWER(${expression}) NOT LIKE '%(placed)%'
            AND LOWER(${expression}) NOT LIKE '%_placed%'
          )
        )
  `.trim();
}

function wikiUrlExpression(alias) {
  return `
    CASE
      WHEN ${acceptableWikiUrlCondition(alias, 'original_url')}
        THEN TRIM(${alias}.\`original_url\`)
      WHEN ${acceptableWikiUrlCondition(alias, 'cached_url')}
        THEN TRIM(${alias}.\`cached_url\`)
      ELSE NULL
    END
  `.trim();
}

function rankedRelationImagesSubquery(relationDatabase) {
  return `
    SELECT *
    FROM (
      SELECT
        rii.*,
        ROW_NUMBER() OVER (
          PARTITION BY
            rii.\`item_internal_name\`,
            COALESCE(NULLIF(TRIM(rii.\`role\`), ''), 'icon'),
            COALESCE(NULLIF(TRIM(rii.\`source_file_title\`), ''), ''),
            COALESCE(NULLIF(TRIM(rii.\`original_url\`), ''), NULLIF(TRIM(rii.\`cached_url\`), ''))
          ORDER BY
            CASE
              WHEN ${acceptableWikiUrlCondition('rii', 'original_url')}
                THEN 0
              ELSE 1
            END,
            CASE WHEN rii.\`is_primary\` = 1 THEN 0 ELSE 1 END,
            COALESCE(rii.\`sort_order\`, 0) ASC,
            rii.\`id\` ASC
        ) AS relation_row_number
      FROM ${qualified(relationDatabase, 'relation_item_images')} rii
      WHERE rii.\`deleted\` = 0
        AND rii.\`status\` = 1
        AND rii.\`item_internal_name\` IS NOT NULL
        AND TRIM(rii.\`item_internal_name\`) <> ''
        AND ${acceptableSourceTitleCondition('rii')}
        AND (
          (${acceptableWikiUrlCondition('rii', 'original_url')})
          OR (${acceptableWikiUrlCondition('rii', 'cached_url')})
        )
    ) ranked
    WHERE ranked.relation_row_number = 1
  `.trim();
}

export function buildInsertLocalItemImagesSql({ localDatabase, relationDatabase }) {
  const wikiUrl = wikiUrlExpression('ranked');
  return `
INSERT INTO ${qualified(localDatabase, 'item_images')}
  (\`item_id\`, \`role\`, \`provider\`, \`source_file_title\`, \`source_page\`, \`source_revision_timestamp\`, \`original_url\`, \`cached_url\`, \`width\`, \`height\`, \`content_type\`, \`is_primary\`, \`sort_order\`, \`status\`, \`deleted\`)
SELECT
  i.\`id\` AS \`item_id\`,
  COALESCE(NULLIF(TRIM(ranked.\`role\`), ''), 'icon') AS \`role\`,
  COALESCE(NULLIF(TRIM(ranked.\`source_provider\`), ''), 'wiki_gg') AS \`provider\`,
  ranked.\`source_file_title\`,
  ranked.\`source_page\`,
  ranked.\`source_revision_timestamp\`,
  CASE
    WHEN ${acceptableWikiUrlCondition('ranked', 'original_url')}
      THEN TRIM(ranked.\`original_url\`)
    ELSE ${wikiUrl}
  END AS \`original_url\`,
  ${wikiUrl} AS \`cached_url\`,
  ranked.\`width\`,
  ranked.\`height\`,
  ranked.\`content_type\`,
  ranked.\`is_primary\`,
  COALESCE(ranked.\`sort_order\`, 0) AS \`sort_order\`,
  1 AS \`status\`,
  0 AS \`deleted\`
FROM (${rankedRelationImagesSubquery(relationDatabase)}) ranked
JOIN ${qualified(localDatabase, 'items')} i
  ON i.\`internal_name\` COLLATE utf8mb4_unicode_ci = ranked.\`item_internal_name\` COLLATE utf8mb4_unicode_ci
WHERE i.\`deleted\` = 0
  AND ${wikiUrl} IS NOT NULL
ORDER BY i.\`id\` ASC, ranked.\`is_primary\` DESC, COALESCE(ranked.\`sort_order\`, 0) ASC, ranked.\`id\` ASC
`.trim();
}

export function buildUpdateLocalItemsImageSql({ localDatabase, relationDatabase }) {
  const wikiUrl = wikiUrlExpression('ranked');
  return `
UPDATE ${qualified(localDatabase, 'items')} i
JOIN (
  SELECT *
  FROM (
    SELECT
      ranked.\`item_internal_name\`,
      ${wikiUrl} AS \`wiki_url\`,
      ROW_NUMBER() OVER (
        PARTITION BY ranked.\`item_internal_name\`
        ORDER BY
          CASE WHEN ranked.\`is_primary\` = 1 THEN 0 ELSE 1 END,
          COALESCE(ranked.\`sort_order\`, 0) ASC,
          ranked.\`id\` ASC
      ) AS preferred_row_number
    FROM (${rankedRelationImagesSubquery(relationDatabase)}) ranked
  ) preferred
  WHERE preferred.preferred_row_number = 1
) best
  ON best.\`item_internal_name\` COLLATE utf8mb4_unicode_ci = i.\`internal_name\` COLLATE utf8mb4_unicode_ci
SET i.\`image\` = best.\`wiki_url\`,
    i.\`updated_at\` = NOW()
WHERE i.\`deleted\` = 0
  AND best.\`wiki_url\` IS NOT NULL
  AND best.\`wiki_url\` NOT LIKE '%/terrapedia-images/%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%(demo)%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%28demo%29%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%_demo%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%(placed)%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%28placed%29%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%_placed%'
  AND LOWER(best.\`wiki_url\`) NOT LIKE '%/placed_%'
  AND (
    i.\`image\` IS NULL
    OR TRIM(i.\`image\`) = ''
    OR i.\`image\` LIKE '%/terrapedia-images/%'
    OR i.\`image\` COLLATE utf8mb4_unicode_ci <> best.\`wiki_url\` COLLATE utf8mb4_unicode_ci
  )
`.trim();
}

export function buildClearLocalMinioItemImagesSql({ localDatabase }) {
  return `
UPDATE ${qualified(localDatabase, 'items')}
SET \`image\` = NULL,
    \`updated_at\` = NOW()
WHERE \`deleted\` = 0
  AND \`image\` IS NOT NULL
  AND TRIM(\`image\`) <> ''
  AND \`image\` LIKE '%/terrapedia-images/%'
`.trim();
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `relation-item-images-to-local-sync-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
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

async function querySingleNumber(connection, sql) {
  const [rows] = await connection.query(sql);
  return Number(rows[0]?.total ?? 0);
}

async function defaultCollectStats(connection, { localDatabase, relationDatabase }) {
  const wikiImageJoin = `
    FROM ${qualified(relationDatabase, 'relation_item_images')} rii
    JOIN ${qualified(localDatabase, 'items')} i
      ON i.\`internal_name\` COLLATE utf8mb4_unicode_ci = rii.\`item_internal_name\` COLLATE utf8mb4_unicode_ci
    WHERE rii.\`deleted\` = 0
      AND rii.\`status\` = 1
      AND i.\`deleted\` = 0
      AND ${acceptableSourceTitleCondition('rii')}
      AND (
        (${acceptableWikiUrlCondition('rii', 'original_url')})
        OR (${acceptableWikiUrlCondition('rii', 'cached_url')})
      )
  `;

  const [
    localItems,
    localItemImages,
    relationItemImages,
    relationImagesMatchedToLocalItems,
    localItemsWithWikiImage,
    localItemsWithMinioImage
  ] = await Promise.all([
    querySingleNumber(connection, `SELECT COUNT(*) AS total FROM ${qualified(localDatabase, 'items')} WHERE \`deleted\` = 0`),
    querySingleNumber(connection, `SELECT COUNT(*) AS total FROM ${qualified(localDatabase, 'item_images')} WHERE \`deleted\` = 0 AND \`status\` = 1`),
    querySingleNumber(connection, `SELECT COUNT(*) AS total FROM ${qualified(relationDatabase, 'relation_item_images')} WHERE \`deleted\` = 0 AND \`status\` = 1`),
    querySingleNumber(connection, `SELECT COUNT(DISTINCT rii.\`record_key\`) AS total ${wikiImageJoin}`),
    querySingleNumber(connection, `SELECT COUNT(*) AS total FROM ${qualified(localDatabase, 'items')} WHERE \`deleted\` = 0 AND \`image\` LIKE 'https://terraria.wiki.gg/%'`),
    querySingleNumber(connection, `SELECT COUNT(*) AS total FROM ${qualified(localDatabase, 'items')} WHERE \`deleted\` = 0 AND \`image\` LIKE '%/terrapedia-images/%'`)
  ]);

  return {
    localItems,
    localItemImages,
    relationItemImages,
    relationImagesMatchedToLocalItems,
    localItemsWithWikiImage,
    localItemsWithMinioImage
  };
}

async function backupTable(connection, { localDatabase, tableName, backupSuffix }) {
  const backupTable = `${tableName}_relation_backup_${backupSuffix}`;
  await connection.query(`CREATE TABLE ${qualified(localDatabase, backupTable)} LIKE ${qualified(localDatabase, tableName)}`);
  await connection.query(`INSERT INTO ${qualified(localDatabase, backupTable)} SELECT * FROM ${qualified(localDatabase, tableName)}`);
  return backupTable;
}

async function applySync(connection, options) {
  const itemImagesBackupTable = await backupTable(connection, {
    localDatabase: options.localDatabase,
    tableName: 'item_images',
    backupSuffix: options.backupSuffix
  });
  const itemsBackupTable = await backupTable(connection, {
    localDatabase: options.localDatabase,
    tableName: 'items',
    backupSuffix: options.backupSuffix
  });

  await connection.query('START TRANSACTION');
  try {
    await connection.query(`DELETE FROM ${qualified(options.localDatabase, 'item_images')}`);
    await connection.query(buildInsertLocalItemImagesSql(options));
    await connection.query(buildUpdateLocalItemsImageSql(options));
    await connection.query(buildClearLocalMinioItemImagesSql(options));
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  }

  return { itemImagesBackupTable, itemsBackupTable };
}

export async function runRelationItemImagesToLocalSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    dateTag: options.dateTag ?? toDateTag(now),
    backupSuffix: options.backupSuffix ?? toBackupSuffix(now)
  };

  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));
  const collectStats = dependencies.collectStats ?? defaultCollectStats;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;

  return executeLocal(async (connection) => {
    const before = await collectStats(connection, normalized);
    const applyResult = normalized.apply ? await applySync(connection, normalized) : {};
    const after = normalized.apply ? await collectStats(connection, normalized) : before;

    const summary = {
      localItems: before.localItems,
      localItemImagesBefore: before.localItemImages ?? before.localItemImagesBefore ?? 0,
      localItemImagesAfter: after.localItemImages ?? after.localItemImagesAfter ?? before.localItemImages ?? 0,
      relationItemImages: before.relationItemImages,
      relationImagesMatchedToLocalItems: before.relationImagesMatchedToLocalItems,
      localItemsWithWikiImageBefore: before.localItemsWithWikiImage ?? before.localItemsWithWikiImageBefore ?? 0,
      localItemsWithWikiImageAfter: after.localItemsWithWikiImage ?? after.localItemsWithWikiImageAfter ?? before.localItemsWithWikiImage ?? 0,
      localItemsWithMinioImageBefore: before.localItemsWithMinioImage ?? before.localItemsWithMinioImageBefore ?? 0,
      localItemsWithMinioImageAfter: after.localItemsWithMinioImage ?? after.localItemsWithMinioImageAfter ?? before.localItemsWithMinioImage ?? 0
    };

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      backupSuffix: normalized.backupSuffix,
      backups: applyResult,
      summary
    };
    const reportPath = await writeReport(report);
    return { report, reportPath };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runRelationItemImagesToLocalSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Local database: ${result.report.localDatabase}`);
  console.log(`Relation database: ${result.report.relationDatabase}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Local item_images: ${result.report.summary.localItemImagesBefore} -> ${result.report.summary.localItemImagesAfter}`);
  console.log(`Local items wiki images: ${result.report.summary.localItemsWithWikiImageBefore} -> ${result.report.summary.localItemsWithWikiImageAfter}`);
  console.log(`Local items MinIO images: ${result.report.summary.localItemsWithMinioImageBefore} -> ${result.report.summary.localItemsWithMinioImageAfter}`);
}
