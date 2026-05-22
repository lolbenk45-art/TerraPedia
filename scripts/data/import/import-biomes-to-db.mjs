#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadStandardizedDataset } from '../lib/load-standardized-dataset.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const moduleRequire = createRequire(import.meta.url);
const repoRoot = getProjectRoot();

export function parseArgs(argv) {
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

export function buildBiomeImportPlan({
  standardizedBiomes = [],
  wikiBiomes = [],
  itemBiomes = [],
  sourceFiles = {},
} = {}) {
  const biomes = mergeBiomeRecords(standardizedBiomes, wikiBiomes);
  return {
    generatedAt: new Date().toISOString(),
    sourceFiles,
    biomes,
    itemBiomes: Array.isArray(itemBiomes) ? itemBiomes : [],
    summary: buildInitialSummary({
      biomes,
      itemBiomes,
    }),
  };
}

export function mergeBiomeRecords(baseRecords, overrideRecords) {
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
    merged.set(key, previous ? mergeBiomeRecord(previous, raw) : raw);
  }
  return [...merged.values()];
}

function mergeBiomeRecord(previous, next) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next ?? {})) {
    if (key === 'iconUrl') {
      merged.iconUrl = mergeIconUrl(previous?.iconUrl, value, next);
      continue;
    }
    if (isEmptyOverrideValue(value) && !isEmptyOverrideValue(previous?.[key])) {
      continue;
    }
    merged[key] = value;
  }
  merged.resources = mergeArrayByKey(
    previous?.resources,
    next?.resources,
    (resource) => [
      resource?.resourceNameRaw ?? resource?.itemName ?? '',
      resource?.itemInternalName ?? '',
      resource?.resourceType ?? 'feature',
      resource?.sortOrder ?? '',
    ].join('|')
  );
  merged.relations = mergeArrayByKey(
    previous?.relations,
    next?.relations,
    (relation) => [
      relation?.relatedBiomeCode ?? '',
      relation?.relationType ?? '',
    ].join('|')
  );
  return merged;
}

function mergeIconUrl(previousValue, nextValue, nextRecord = null) {
  const previousIcon = toNullableString(previousValue);
  const nextIcon = toNullableString(nextValue);
  if (previousIcon && isManagedBiomeIconUrl(previousIcon) && nextIcon && isExternalWikiIconUrl(nextIcon)) {
    const previousInvalid = isInvalidBiomeIconUrl(previousIcon) || isKnownStaleManagedBiomeIcon(previousIcon, nextRecord);
    const nextInvalid = isInvalidBiomeIconUrl(nextIcon);
    if (!previousInvalid) {
      return previousIcon;
    }
    if (!nextInvalid) {
      return nextIcon;
    }
  }
  if (nextIcon) {
    return isInvalidBiomeIconUrl(nextIcon) ? null : nextIcon;
  }
  if (!previousIcon || isInvalidBiomeIconUrl(previousIcon)) {
    return null;
  }
  return previousIcon;
}

function isManagedBiomeIconUrl(value) {
  const text = toNullableString(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      && parsed.pathname.startsWith('/terrapedia-images/');
  } catch {
    return text.startsWith('/terrapedia-images/');
  }
}

function isExternalWikiIconUrl(value) {
  const text = toNullableString(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return /^https?:$/i.test(parsed.protocol) && parsed.hostname.toLowerCase() === 'terraria.wiki.gg';
  } catch {
    return false;
  }
}

function isInvalidBiomeIconUrl(value) {
  return /(?:Desktop_only|Console_only|Mobile_only|Old-gen_console_version|Nintendo_Switch_version|tModLoader|Journey_Mode|Classic_Mode|Expert_Mode|Master_Mode|Info_icon|Notice|Question|Achievement|Map_Icon|Bestiary|Icon_|Paint_Roller|(?:^|[-_/])Meteorite\.png(?:[?#]|$))/i.test(String(value ?? ''));
}

function isKnownStaleManagedBiomeIcon(previousIcon, nextRecord) {
  const code = normalizeCode(nextRecord?.code ?? nextRecord?.biomeCode);
  const sourcePage = toNullableString(nextRecord?.sourcePage ?? nextRecord?.pageTitle ?? nextRecord?.nameEn);
  if (code === 'UNDERGROUND_CABIN' && sourcePage === 'Underground Cabin') {
    return /\/items\/2026\/05\/22\/3c29b387d34e420c8920a5f39606ad07\.png(?:[?#]|$)/i.test(previousIcon);
  }
  return false;
}

function isEmptyOverrideValue(value) {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function mergeArrayByKey(previousValues, nextValues, keyBuilder) {
  const merged = new Map();
  for (const value of Array.isArray(previousValues) ? previousValues : []) {
    merged.set(keyBuilder(value), value);
  }
  for (const value of Array.isArray(nextValues) ? nextValues : []) {
    merged.set(keyBuilder(value), value);
  }
  return [...merged.values()];
}

export async function importBiomeDataset(conn, plan) {
  const summary = buildInitialSummary(plan);
  const itemLookup = await loadItemLookup(conn);
  const biomeByCode = await importBiomes(conn, plan.biomes, summary.biomes);
  await importBiomeRelationsAndResources(conn, plan.biomes, biomeByCode, itemLookup, summary.biomeRelations, summary.biomeResources);
  await importItemBiomes(conn, plan.itemBiomes, itemLookup, biomeByCode, summary.itemBiomes);
  await softDeleteStaleWikiBiomes(conn, plan.biomes, summary.staleBiomes);
  await normalizeBiomeSortOrders(conn, summary.sortNormalization);
  return summary;
}

export function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

function buildInitialSummary({ biomes = [], itemBiomes = [] } = {}) {
  return {
    biomes: makeStatsSection(Array.isArray(biomes) ? biomes.length : 0),
    biomeRelations: makeStatsSection(countNested(biomes, 'relations')),
    biomeResources: makeStatsSection(countNested(biomes, 'resources')),
    itemBiomes: makeStatsSection(Array.isArray(itemBiomes) ? itemBiomes.length : 0),
    staleBiomes: makeStatsSection(0),
    sortNormalization: {
      item_biomes: 0,
      biome_resources: 0,
    },
  };
}

function makeStatsSection(input = 0) {
  return { input, created: 0, updated: 0, skipped: 0, errors: [] };
}

function countNested(records, key) {
  return (Array.isArray(records) ? records : []).reduce((total, record) => {
    return total + (Array.isArray(record?.[key]) ? record[key].length : 0);
  }, 0);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return loadJson(filePath);
}

function loadBiomeRelationParts(partsDir) {
  if (!partsDir || !fs.existsSync(partsDir)) {
    return [];
  }
  return fs.readdirSync(partsDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .flatMap((entry) => {
      const payload = loadJson(path.join(partsDir, entry));
      return Array.isArray(payload) ? payload : [];
    });
}

export function loadStandardizedBiomeRecords({ dataDir, biomesFile, relationBiomesDir }) {
  const records = [];
  if (biomesFile && fs.existsSync(biomesFile)) {
    const payload = loadJson(biomesFile);
    records.push(...(Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload) ? payload : [])));
  }
  const relationBiomes = loadBiomeRelationParts(relationBiomesDir);
  if (relationBiomes.length > 0) {
    return mergeBiomeRecords(records, relationBiomes);
  }
  if (records.length > 0) {
    return records;
  }
  const payload = loadStandardizedDataset(dataDir, 'biomes');
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function loadItemLookup(conn) {
  const [rows] = await conn.query(
    'SELECT id, internal_name, name, name_zh FROM items WHERE deleted = 0'
  );
  const byInternal = new Map();
  const byName = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const internalName = normalizeInternalName(row.internal_name);
    const name = toNullableString(row.name);
    const nameZh = toNullableString(row.name_zh);
    if (internalName) byInternal.set(internalName, id);
    if (name) byName.set(name.toLowerCase(), id);
    if (nameZh) byName.set(nameZh.toLowerCase(), id);
  }
  return { byInternal, byName };
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

async function loadExistingBiomeIconMap(conn) {
  const [rows] = await conn.query('SELECT code, icon_url FROM biomes WHERE deleted = 0');
  const map = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    if (!code) continue;
    map.set(code, toNullableString(row.icon_url));
  }
  return map;
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

async function importBiomes(conn, biomeRecords, stats) {
  if (!Array.isArray(biomeRecords) || biomeRecords.length === 0) return new Map();

  const existingIconByCode = await loadExistingBiomeIconMap(conn);

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
        mergeIconUrl(existingIconByCode.get(code), raw?.iconUrl, raw),
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

  for (const raw of biomeRecords) {
    const biomeCode = normalizeCode(raw?.code ?? raw?.biomeCode);
    const biomeId = biomeCode ? resolveBiomeId(biomeByCode, biomeCode) : null;
    if (!biomeId) continue;

    const relations = Array.isArray(raw?.relations) ? raw.relations : [];
    for (const relation of relations) {
      const relatedCode = normalizeCode(relation?.relatedBiomeCode);
      const relatedId = relatedCode ? resolveBiomeId(biomeByCode, relatedCode) : null;
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
  if (!Array.isArray(itemBiomeRecords)) return;

  for (const relation of itemBiomeRecords) {
    const itemId = getItemId(itemLookup, relation?.itemInternalName, relation?.itemName);
    const biomeCode = normalizeCode(relation?.biomeCode);
    const biomeId = biomeCode ? resolveBiomeId(biomeByCode, biomeCode) : null;
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

async function softDeleteStaleWikiBiomes(conn, biomeRecords, stats) {
  const activeCodes = [...new Set((Array.isArray(biomeRecords) ? biomeRecords : [])
    .map(record => normalizeCode(record?.code ?? record?.biomeCode)?.toLowerCase())
    .filter(Boolean))].sort();
  if (activeCodes.length > 0) {
    const placeholders = activeCodes.map(() => '?').join(', ');
    const [result] = await conn.execute(
      `UPDATE biomes
          SET deleted = 1,
              status = 0,
              updated_at = NOW()
        WHERE deleted = 0
          AND source_provider = 'wiki_gg'
          AND LOWER(code) NOT IN (${placeholders})`,
      activeCodes
    );
    stats.updated += Number(result?.affectedRows ?? 0);
    return;
  }

  const [result] = await conn.execute(
    `UPDATE biomes
        SET deleted = 1,
            status = 0,
            updated_at = NOW()
      WHERE deleted = 0
        AND code = 'biomes'
        AND name_en = 'Biomes'
        AND source_provider = 'wiki_gg'
        AND source_page = 'Biomes'`
  );
  stats.updated += Number(result?.affectedRows ?? 0);
}

async function normalizeBiomeSortOrders(conn, stats) {
  const [itemBiomeResult] = await conn.query(`
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
    WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`
  );
  stats.item_biomes = Number(itemBiomeResult?.affectedRows ?? 0);

  const [resourceResult] = await conn.query(`
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
    WHERE target.sort_order IS NULL OR target.sort_order <> ranked.normalized_sort`
  );
  stats.biome_resources = Number(resourceResult?.affectedRows ?? 0);
}

function resolveBiomeId(biomeByCode, code) {
  return biomeByCode.get(code) ?? biomeByCode.get(String(code).toLowerCase()) ?? null;
}

function pushError(sectionStats, message) {
  sectionStats.errors.push(message);
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

function toDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
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

function normalizePositiveSortOrder(value, fallback) {
  const explicitSortOrder = toNullableInteger(value);
  if (explicitSortOrder != null && explicitSortOrder > 0) return explicitSortOrder;
  return fallback;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function extractDatabaseNameFromJdbcUrl(jdbcUrl) {
  if (!jdbcUrl) return null;
  const match = String(jdbcUrl).match(/jdbc:mysql:\/\/[^/]+\/([^?]+)/i);
  return match?.[1] ?? null;
}

export function resolveMysqlRequireCandidates(root = repoRoot) {
  const candidates = [
    import.meta.url,
    path.join(root, 'data-query-app', 'package.json'),
  ];
  const primaryRoot = resolvePrimaryWorktreeRoot(root);
  if (primaryRoot) {
    candidates.push(path.join(primaryRoot, 'data-query-app', 'package.json'));
  }
  return [...new Set(candidates)];
}

function loadMysqlModule() {
  let lastModuleNotFound = null;
  for (const candidate of resolveMysqlRequireCandidates()) {
    try {
      return createRequire(candidate)('mysql2/promise');
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      lastModuleNotFound = error;
    }
  }
  try {
    return moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    throw lastModuleNotFound ?? error;
  }
}

function resolvePrimaryWorktreeRoot(root) {
  const gitFilePath = path.join(path.resolve(root), '.git');
  if (!fs.existsSync(gitFilePath) || fs.statSync(gitFilePath).isDirectory()) {
    return null;
  }
  const content = fs.readFileSync(gitFilePath, 'utf8').trim();
  const match = content.match(/^gitdir:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const gitDir = path.resolve(root, match[1].trim());
  const segments = gitDir.split(path.sep);
  const worktreesIndex = segments.lastIndexOf('worktrees');
  if (worktreesIndex <= 0) {
    return null;
  }
  const commonGitDir = segments.slice(0, worktreesIndex).join(path.sep) || path.sep;
  const primaryRoot = path.dirname(commonGitDir);
  return fs.existsSync(path.join(primaryRoot, '.git')) ? primaryRoot : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = booleanOption(args.apply, false);
  const dateTag = new Date().toISOString().slice(0, 10);
  const dataDir = path.resolve(
    args['data-dir']
    ?? process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR
    ?? path.join(repoRoot, 'data', 'standardized')
  );
  const relationViewDir = path.resolve(
    args['relation-view-dir']
    ?? path.join(repoRoot, 'data', 'standardized-view', 'item_relations')
  );
  const standardizedBiomesFile = path.resolve(
    args['standardized-biomes-file']
    ?? path.join(dataDir, 'biomes.standardized.json')
  );
  const relationBiomesDir = path.resolve(
    args['relation-biomes-dir']
    ?? path.join(relationViewDir, 'biomes')
  );
  const itemBiomesDir = path.resolve(
    args['item-biomes-dir']
    ?? path.join(relationViewDir, 'itemBiomes')
  );
  const wikiBiomesFile = path.resolve(
    args['wiki-biomes-file']
    ?? process.env.TERRAPEDIA_WIKI_BIOMES_FILE
    ?? path.join(repoRoot, 'data', 'generated', 'wiki-biomes.importable.latest.json')
  );
  const reportPath = path.resolve(
    args['report-json']
    ?? path.join(repoRoot, 'reports', `biome-db-import-${dateTag}.json`)
  );
  const jdbcUrl = args['db-url'] ?? process.env.TERRAPEDIA_DB_URL ?? '';
  const database = args.database
    ?? process.env.TERRAPEDIA_DB_NAME
    ?? extractDatabaseNameFromJdbcUrl(jdbcUrl)
    ?? 'terria_v1_local';
  const allowNonPrimaryDb = booleanOption(
    args['allow-non-primary-db'] ?? args.allowNonPrimaryDb ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
    false
  );

  if (apply) {
    assertPrimaryDb(database, allowNonPrimaryDb);
  }

  const standardizedBiomes = loadStandardizedBiomeRecords({
    dataDir,
    biomesFile: standardizedBiomesFile,
    relationBiomesDir,
  });
  const wikiBiomesDataset = loadOptionalJson(wikiBiomesFile);
  const wikiBiomes = Array.isArray(wikiBiomesDataset?.biomes) ? wikiBiomesDataset.biomes : [];
  const itemBiomes = loadBiomeRelationParts(itemBiomesDir);
  const plan = buildBiomeImportPlan({
    standardizedBiomes,
    wikiBiomes,
    itemBiomes,
    sourceFiles: {
      dataDir,
      standardizedBiomesFile: fs.existsSync(standardizedBiomesFile) ? standardizedBiomesFile : null,
      relationBiomesDir: fs.existsSync(relationBiomesDir) ? relationBiomesDir : null,
      itemBiomesDir: fs.existsSync(itemBiomesDir) ? itemBiomesDir : null,
      wikiBiomesFile: wikiBiomesDataset ? wikiBiomesFile : null,
    },
  });

  let summary = plan.summary;
  if (apply) {
    const mysql = loadMysqlModule();
    const conn = await mysql.createConnection({
      host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
      user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database,
      multipleStatements: false,
    });
    try {
      await conn.query('SET NAMES utf8mb4');
      await conn.beginTransaction();
      summary = await importBiomeDataset(conn, plan);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.end();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    database,
    reportPath,
    sourceFiles: plan.sourceFiles,
    summary,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('[import-biomes-to-db] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
