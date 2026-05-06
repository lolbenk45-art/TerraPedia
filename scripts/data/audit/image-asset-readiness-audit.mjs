#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

const DEFAULT_MANAGED_URL_PREFIXES = ['http://localhost:9000/terrapedia-images'];
const DEFAULT_SAMPLE_LIMIT = 20;
const DEFAULT_STALE_AFTER_DAYS = 90;
const DEFAULT_LOCAL_DATABASE = 'terria_v1_local';
const DEFAULT_REPORT_TIME_ZONE = process.env.TERRAPEDIA_REPORT_TIME_ZONE ?? 'Asia/Shanghai';

export function parseArgs(argv = []) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) {
      continue;
    }
    const body = token.slice(2);
    const index = body.indexOf('=');
    raw[toCamelCase(index >= 0 ? body.slice(0, index) : body)] = index >= 0 ? body.slice(index + 1) : 'true';
  }

  return {
    items: raw.items ?? null,
    buffs: raw.buffs ?? null,
    npcs: raw.npcs ?? null,
    managedUrlPrefixes: parseList(raw.managedUrlPrefixes, DEFAULT_MANAGED_URL_PREFIXES),
    sampleLimit: positiveInteger(raw.sampleLimit, DEFAULT_SAMPLE_LIMIT),
    staleAfterDays: positiveInteger(raw.staleAfterDays ?? raw.staleDays, DEFAULT_STALE_AFTER_DAYS),
    source: raw.source ?? 'files',
    output: raw.output ?? null,
    repoRoot: raw.repoRoot ?? null,
    localDatabase: raw.localDatabase ?? DEFAULT_LOCAL_DATABASE,
    generatedAt: raw.generatedAt ?? null,
  };
}

export function buildImageAssetReadinessQueries({ localDatabase = DEFAULT_LOCAL_DATABASE } = {}) {
  const items = qualified(localDatabase, 'items');
  const itemImages = qualified(localDatabase, 'item_images');
  const buffs = qualified(localDatabase, 'buffs');
  const npcs = qualified(localDatabase, 'npcs');
  const cachedUrlUsable = usableImageUrlCondition('ii.`cached_url`');
  const originalUrlUsable = usableImageUrlCondition('ii.`original_url`');

  return {
    items: `
SELECT
  i.\`id\`,
  i.\`internal_name\` AS internalName,
  i.\`name\`,
  i.\`name_zh\` AS nameZh,
  i.\`image\` AS legacyImage,
  ii.\`cached_url\` AS cachedUrl,
  ii.\`original_url\` AS originalUrl,
  ii.\`content_type\` AS contentType,
  ii.\`last_verified_at\` AS lastVerifiedAt
FROM ${items} i
LEFT JOIN (
  SELECT *
  FROM (
    SELECT
      ii.*,
      ROW_NUMBER() OVER (
        PARTITION BY ii.\`item_id\`
        ORDER BY
          CASE WHEN LOCATE('/terrapedia-images/', ii.\`cached_url\`) > 0 AND ${cachedUrlUsable} THEN 0 ELSE 1 END,
          CASE WHEN ${cachedUrlUsable} OR ${originalUrlUsable} THEN 0 ELSE 1 END,
          CASE WHEN ii.\`is_primary\` = 1 THEN 0 ELSE 1 END,
          COALESCE(ii.\`sort_order\`, 0) ASC,
          ii.\`id\` ASC
      ) AS row_number
    FROM ${itemImages} ii
    WHERE ii.\`deleted\` = 0
      AND ii.\`status\` = 1
  ) ranked
  WHERE ranked.row_number = 1
) ii ON ii.\`item_id\` = i.\`id\`
WHERE i.\`deleted\` = 0
ORDER BY i.\`id\` ASC
`.trim(),
    buffs: `
SELECT
  b.\`id\`,
  b.\`internal_name\` AS internalName,
  b.\`english_name\` AS name,
  b.\`name_zh\` AS nameZh,
  b.\`image\`,
  b.\`image_cached_url\` AS imageCachedUrl,
  b.\`image_original_url\` AS imageOriginalUrl,
  b.\`image_content_type\` AS imageContentType,
  b.\`image_last_verified_at\` AS imageLastVerifiedAt
FROM ${buffs} b
WHERE b.\`deleted\` = 0
ORDER BY b.\`id\` ASC
`.trim(),
    npcs: `
SELECT
  n.\`id\`,
  n.\`internal_name\` AS internalName,
  n.\`name\`,
  n.\`name_zh\` AS nameZh,
  n.\`image_url\` AS imageUrl
FROM ${npcs} n
WHERE n.\`deleted\` = 0
ORDER BY n.\`id\` ASC
`.trim(),
  };
}

export function resolveImageAssetReadinessReportPath({
  generatedAt = new Date().toISOString(),
  output = null,
  root = repoRoot,
} = {}) {
  if (output) {
    return path.resolve(root, output);
  }
  return path.resolve(
    root,
    'reports',
    'audit',
    `image-asset-readiness-${toDateTag(generatedAt)}.json`,
  );
}

export function buildImageAssetReadinessAudit({
  generatedAt = new Date().toISOString(),
  reportPath = null,
  managedUrlPrefixes = DEFAULT_MANAGED_URL_PREFIXES,
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  items = [],
  buffs = [],
  npcs = [],
} = {}) {
  const options = {
    managedUrlPrefixes: normalizeManagedUrlPrefixes(managedUrlPrefixes),
    staleThreshold: toStaleThreshold(generatedAt, staleAfterDays),
    sampleLimit: Math.max(0, Math.trunc(Number(sampleLimit) || 0)),
  };
  const entities = {
    items: summarizeRows('items', items, itemAccessors, { ...options, unifiedContractReady: true }),
    buffs: summarizeRows('buffs', buffs, buffAccessors, { ...options, unifiedContractReady: true }),
    npcs: summarizeRows('npcs', npcs, npcAccessors, { ...options, unifiedContractReady: false }),
  };
  const blockingReasons = buildBlockingReasons(entities);
  const warningReasons = buildWarningReasons(entities);
  const entityStatuses = Object.values(entities).map((entity) => entity.status);
  const status = blockingReasons.length > 0
    ? 'blocked'
    : entityStatuses.every((entityStatus) => entityStatus === 'missing')
      ? 'missing'
      : warningReasons.length > 0 || entityStatuses.includes('missing')
        ? 'warning'
        : 'pass';

  return {
    generatedAt,
    reportPath,
    status,
    entities,
    blockingReasons,
    warningReasons,
  };
}

function summarizeRows(entityType, rows, accessors, options) {
  const stats = {
    status: 'pass',
    totalRows: rows.length,
    totalWithImage: 0,
    cachedHitCount: 0,
    wikiFallbackOnlyCount: 0,
    missingImageCount: 0,
    brokenCachedUrlCount: 0,
    brokenCachedUrlSamples: [],
    missingContentTypeCount: 0,
    staleLastVerifiedCount: 0,
    missingOriginalForCachedCount: 0,
    unifiedContractReady: options.unifiedContractReady,
  };

  for (const row of rows) {
    const normalized = normalizeImageRow(entityType, row, accessors, options.managedUrlPrefixes);
    const hasImage = normalized.hasManagedCache || normalized.hasWikiFallback;
    if (hasImage) {
      stats.totalWithImage += 1;
    } else {
      stats.missingImageCount += 1;
    }
    if (normalized.hasManagedCache) {
      stats.cachedHitCount += 1;
    } else if (normalized.hasWikiFallback) {
      stats.wikiFallbackOnlyCount += 1;
    }
    if (normalized.cachedUrl && !normalized.hasManagedCache) {
      stats.brokenCachedUrlCount += 1;
      if (stats.brokenCachedUrlSamples.length < options.sampleLimit) {
        stats.brokenCachedUrlSamples.push({
          entityType,
          id: normalized.id,
          internalName: normalized.internalName,
          name: normalized.name,
          cachedUrl: normalized.cachedUrl,
          reason: classifyBrokenCachedUrl(normalized.cachedUrl, options.managedUrlPrefixes),
        });
      }
    }
    if (normalized.hasManagedCache && !normalized.hasOriginalEvidence) {
      stats.missingOriginalForCachedCount += 1;
    }
    if (hasImage && normalized.hasStructuredImage && !isImageContentType(normalized.contentType)) {
      stats.missingContentTypeCount += 1;
    }
    if (hasImage && normalized.hasStructuredImage && isStale(normalized.lastVerifiedAt, options.staleThreshold)) {
      stats.staleLastVerifiedCount += 1;
    }
  }

  stats.status = deriveEntityStatus(stats);
  return stats;
}

const itemAccessors = {
  id: (row) => row?.id,
  internalName: (row) => firstText(row?.internalName, row?.internal_name),
  name: (row) => firstText(row?.nameZh, row?.name_zh, row?.name),
  cachedUrl: (row) => firstText(row?.cachedUrl, row?.cached_url, row?.imageCachedUrl, row?.image_cached_url),
  originalUrl: (row) => firstText(row?.originalUrl, row?.original_url, row?.imageOriginalUrl, row?.image_original_url),
  legacyUrl: (row) => firstText(row?.legacyImage, row?.legacy_image, row?.imageUrl, row?.image_url, row?.image),
  contentType: (row) => firstText(row?.contentType, row?.content_type, row?.imageContentType, row?.image_content_type),
  lastVerifiedAt: (row) => firstText(row?.lastVerifiedAt, row?.last_verified_at, row?.imageLastVerifiedAt, row?.image_last_verified_at),
};

const buffAccessors = {
  id: (row) => row?.id,
  internalName: (row) => firstText(row?.internalName, row?.internal_name),
  name: (row) => firstText(row?.nameZh, row?.name_zh, row?.englishName, row?.english_name, row?.name),
  cachedUrl: (row) => firstText(row?.imageCachedUrl, row?.image_cached_url, row?.cachedUrl, row?.cached_url),
  originalUrl: (row) => firstText(row?.imageOriginalUrl, row?.image_original_url, row?.originalUrl, row?.original_url),
  legacyUrl: (row) => firstText(row?.imageUrl, row?.image_url, row?.image),
  contentType: (row) => firstText(row?.imageContentType, row?.image_content_type, row?.contentType, row?.content_type),
  lastVerifiedAt: (row) => firstText(row?.imageLastVerifiedAt, row?.image_last_verified_at, row?.lastVerifiedAt, row?.last_verified_at),
};

const npcAccessors = {
  id: (row) => row?.id,
  internalName: (row) => firstText(row?.internalName, row?.internal_name, row?.npcInternalName, row?.npc_internal_name),
  name: (row) => firstText(row?.nameZh, row?.name_zh, row?.npcName, row?.npc_name, row?.name),
  cachedUrl: (row) => firstText(row?.cachedUrl, row?.cached_url, row?.imageCachedUrl, row?.image_cached_url),
  originalUrl: (row) => firstText(row?.originalUrl, row?.original_url, row?.imageOriginalUrl, row?.image_original_url),
  legacyUrl: (row) => firstText(row?.imageUrl, row?.image_url, row?.image),
  contentType: (row) => firstText(row?.contentType, row?.content_type, row?.imageContentType, row?.image_content_type),
  lastVerifiedAt: (row) => firstText(row?.lastVerifiedAt, row?.last_verified_at, row?.imageLastVerifiedAt, row?.image_last_verified_at),
};

function normalizeImageRow(entityType, row, accessors, managedUrlPrefixes) {
  const cachedUrl = accessors.cachedUrl(row);
  const originalUrl = accessors.originalUrl(row);
  const legacyUrl = accessors.legacyUrl(row);
  const managedCacheUrl = [cachedUrl, accessors.legacyCountsAsCache ? legacyUrl : null]
    .find((url) => isManagedUrl(url, managedUrlPrefixes)) ?? null;
  const wikiFallbackUrl = [originalUrl, legacyUrl].find(isWikiUrl) ?? null;
  const legacyDisplayUrl = accessors.legacyCountsAsCache ? null : legacyUrl;

  return {
    entityType,
    id: row?.id ?? accessors.id(row) ?? null,
    internalName: accessors.internalName(row) ?? null,
    name: accessors.name(row) ?? null,
    cachedUrl,
    originalUrl,
    legacyUrl,
    contentType: accessors.contentType(row),
    lastVerifiedAt: accessors.lastVerifiedAt(row),
    hasManagedCache: Boolean(managedCacheUrl),
    hasWikiFallback: Boolean(wikiFallbackUrl || isManagedUrl(legacyDisplayUrl, managedUrlPrefixes)),
    hasOriginalEvidence: [originalUrl, legacyUrl].some((url) => isHttpUrl(url) && !isManagedUrl(url, managedUrlPrefixes)),
    hasStructuredImage: Boolean(cachedUrl || originalUrl),
  };
}

function deriveEntityStatus(stats) {
  if (stats.totalRows === 0) {
    return 'missing';
  }
  if (stats.missingOriginalForCachedCount > 0) {
    return 'blocked';
  }
  if (
    !stats.unifiedContractReady
    || stats.missingImageCount > 0
    || stats.brokenCachedUrlCount > 0
    || stats.missingContentTypeCount > 0
    || stats.staleLastVerifiedCount > 0
  ) {
    return 'warning';
  }
  return 'pass';
}

function buildBlockingReasons(entities) {
  return Object.entries(entities)
    .filter(([, stats]) => stats.missingOriginalForCachedCount > 0)
    .map(([entityType, stats]) => `${entityType} has ${stats.missingOriginalForCachedCount} managed/cache image without source/original fallback`);
}

function buildWarningReasons(entities) {
  const reasons = [];
  for (const [entityType, stats] of Object.entries(entities)) {
    if (stats.totalRows === 0) {
      reasons.push(`${entityType} image rows are missing from the audit input`);
      continue;
    }
    if (!stats.unifiedContractReady) {
      reasons.push(`${entityType} image assets still need a unified source/cache/fallback contract`);
    }
    if (stats.missingImageCount > 0) {
      reasons.push(`${entityType} has ${stats.missingImageCount} rows without a managed cache or wiki fallback image`);
    }
    if (stats.brokenCachedUrlCount > 0) {
      reasons.push(`${entityType} has ${stats.brokenCachedUrlCount} cached URL value(s) outside the managed cache contract`);
    }
    if (stats.missingContentTypeCount > 0) {
      reasons.push(`${entityType} has ${stats.missingContentTypeCount} image row(s) without an image/* content type`);
    }
    if (stats.staleLastVerifiedCount > 0) {
      reasons.push(`${entityType} has ${stats.staleLastVerifiedCount} image row(s) past the last-verified threshold`);
    }
  }
  return reasons;
}

function classifyBrokenCachedUrl(url, managedUrlPrefixes) {
  if (!isHttpUrl(url)) {
    return 'invalid_url';
  }
  if (isWikiUrl(url)) {
    return 'source_url_in_cached_field';
  }
  if (!isManagedUrl(url, managedUrlPrefixes)) {
    return 'outside_managed_prefix';
  }
  return 'unknown';
}

function isManagedUrl(value, managedUrlPrefixes = DEFAULT_MANAGED_URL_PREFIXES) {
  const parsed = parseUrl(value);
  if (!parsed) {
    return false;
  }
  if (pathHasManagedAssetSegment(parsed.pathname)) {
    return true;
  }
  return normalizeManagedUrlPrefixes(managedUrlPrefixes).some((prefix) => {
    const parsedPrefix = parseUrl(prefix);
    if (!parsedPrefix) {
      return false;
    }
    return parsed.protocol.toLowerCase() === parsedPrefix.protocol.toLowerCase()
      && parsed.host.toLowerCase() === parsedPrefix.host.toLowerCase()
      && pathHasPrefixSegment(parsed.pathname, parsedPrefix.pathname);
  });
}

function isWikiUrl(value) {
  const parsed = parseUrl(value);
  return Boolean(parsed && parsed.hostname.toLowerCase() === 'terraria.wiki.gg');
}

function isHttpUrl(value) {
  const parsed = parseUrl(value);
  return Boolean(parsed && ['http:', 'https:'].includes(parsed.protocol.toLowerCase()));
}

function parseUrl(value) {
  const text = firstText(value);
  if (!text) {
    return null;
  }
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol.toLowerCase()) ? parsed : null;
  } catch {
    return null;
  }
}

function isImageContentType(value) {
  const contentType = firstText(value);
  return Boolean(contentType && contentType.toLowerCase().startsWith('image/'));
}

function isStale(value, staleThreshold) {
  if (!staleThreshold) {
    return false;
  }
  const text = firstText(value);
  if (!text) {
    return true;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return true;
  }
  return date.getTime() < staleThreshold.getTime();
}

function toStaleThreshold(generatedAt, staleAfterDays) {
  const now = new Date(generatedAt);
  if (Number.isNaN(now.getTime())) {
    return null;
  }
  return new Date(now.getTime() - Math.max(0, Number(staleAfterDays) || 0) * 24 * 60 * 60 * 1000);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const reportPath = resolveImageAssetReadinessReportPath({
    generatedAt,
    output: args.output,
    root: args.repoRoot ? path.resolve(repoRoot, args.repoRoot) : repoRoot,
  });
  const rows = args.source === 'db'
    ? await loadRowsFromDatabase(args)
    : await loadRowsFromFiles(args);
  const audit = buildImageAssetReadinessAudit({
    ...rows,
    generatedAt,
    reportPath,
    managedUrlPrefixes: args.managedUrlPrefixes,
    staleAfterDays: args.staleAfterDays,
    sampleLimit: args.sampleLimit,
  });
  const output = `${JSON.stringify(audit, null, 2)}\n`;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, output, 'utf8');
  process.stdout.write(output);
}

async function loadRowsFromFiles(args) {
  return {
    items: await readRowsIfProvided(args.items, 'items'),
    buffs: await readRowsIfProvided(args.buffs, 'buffs'),
    npcs: await readRowsIfProvided(args.npcs, 'npcs'),
  };
}

async function readRowsIfProvided(filePath, key) {
  if (!filePath) {
    return [];
  }
  const raw = await fs.readFile(path.resolve(repoRoot, filePath), 'utf8');
  const payload = JSON.parse(raw);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }
  if (Array.isArray(payload?.records)) {
    return payload.records;
  }
  if (Array.isArray(payload?.rows)) {
    return payload.rows;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

async function loadRowsFromDatabase(args) {
  const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  const queries = buildImageAssetReadinessQueries({ localDatabase: args.localDatabase });
  const connection = await mysql.createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.localDatabase,
  });
  try {
    const [items] = await connection.query(queries.items);
    const [buffs] = await connection.query(queries.buffs);
    const [npcs] = await connection.query(queries.npcs);
    return { items, buffs, npcs };
  } finally {
    await connection.end();
  }
}

function qualified(database, tableName) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`;
}

function quoteIdentifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`Invalid identifier: ${text}`);
  }
  return `\`${text}\``;
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function positiveInteger(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : fallback;
}

function toDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDateTag(new Date());
  }
  return formatDateTag(date);
}

function formatDateTag(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseList(value, fallback) {
  if (value == null || value === '') {
    return [...fallback];
  }
  const list = String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
  return list.length > 0 ? list : [...fallback];
}

function normalizeManagedUrlPrefixes(prefixes) {
  const list = Array.isArray(prefixes) && prefixes.length > 0 ? prefixes : DEFAULT_MANAGED_URL_PREFIXES;
  return [...new Set(list.map((prefix) => stripTrailingSlash(firstText(prefix))).filter(Boolean))];
}

function stripTrailingSlash(value) {
  let text = String(value ?? '');
  while (text.length > 1 && text.endsWith('/')) {
    text = text.slice(0, -1);
  }
  return text;
}

function usableImageUrlCondition(expression) {
  return `
(
  ${expression} IS NOT NULL
  AND TRIM(${expression}) <> ''
  AND LOWER(TRIM(${expression})) NOT LIKE '%(demo)%'
  AND LOWER(TRIM(${expression})) NOT LIKE '%28demo%29%'
  AND LOWER(TRIM(${expression})) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
  AND LOWER(TRIM(${expression})) NOT LIKE '%(placed)%'
  AND LOWER(TRIM(${expression})) NOT LIKE '%28placed%29%'
  AND LOWER(TRIM(${expression})) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
)
`.trim();
}

function pathHasManagedAssetSegment(pathname) {
  const normalized = stripTrailingSlash(pathname);
  return normalized === '/terrapedia-images' || normalized.includes('/terrapedia-images/');
}

function pathHasPrefixSegment(pathname, prefixPathname) {
  const actual = stripTrailingSlash(pathname);
  const prefix = stripTrailingSlash(prefixPathname);
  return actual === prefix || actual.startsWith(`${prefix}/`);
}

function toCamelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
