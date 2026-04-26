#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const mysql = loadMysql();

const WIKI_API_URL = 'https://terraria.wiki.gg/api.php';
const WIKI_PROVIDER = 'wiki_gg';
const BACKUP_LABEL = 'crafting_station_image_backup';
const VARIANT_STATION_KEYS = new Set([
  'table',
  'chair',
  'sink',
  'water fountain'
]);
const NO_ENTITY_STATION_KEYS = new Set([
  'by hand',
  'placed bottle',
  'snow biome',
  'living wood',
  'water',
  'lava',
  'honey',
  'ecto mist',
  'shimmer'
]);

function loadMysql() {
  try {
    return require('mysql2/promise');
  } catch {
    return createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
}

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
    fetchMissingWikiImages: booleanOption(
      raw['fetch-missing-wiki-images'] ?? raw.fetchMissingWikiImages,
      true
    ),
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toBackupSuffix(value = new Date()) {
  return value.toISOString().replace(/\D/g, '').slice(0, 14);
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isWikiImageUrl(value) {
  const text = toNullableText(value);
  return Boolean(
    text
    && /^https?:\/\//i.test(text)
    && /terraria\.wiki\.gg/i.test(text)
    && !/\/terrapedia-images\//i.test(text)
  );
}

function isAcceptableItemIconUrl(value) {
  const text = toNullableText(value);
  if (!isWikiImageUrl(text)) {
    return false;
  }
  const decoded = decodeURIComponent(text).toLowerCase();
  return !decoded.includes('(demo)')
    && !decoded.includes('(placed)')
    && !hasBlockedItemIconVariantToken(decoded);
}

function hasBlockedItemIconVariantToken(value) {
  return /(^|[/_\s-])(demo|placed)([._?&#/-]|$)/i.test(String(value ?? ''));
}

function acceptableWikiItemIconSql(expression) {
  return `
        ${expression} LIKE 'https://terraria.wiki.gg/%'
        AND LOWER(TRIM(${expression})) NOT LIKE '%(demo)%'
        AND LOWER(TRIM(${expression})) NOT LIKE '%28demo%29%'
        AND LOWER(TRIM(${expression})) NOT REGEXP '(^|[/_[:space:]-])demo([._?&#/-]|$)'
        AND LOWER(TRIM(${expression})) NOT LIKE '%(placed)%'
        AND LOWER(TRIM(${expression})) NOT LIKE '%28placed%29%'
        AND LOWER(TRIM(${expression})) NOT REGEXP '(^|[/_[:space:]-])placed([._?&#/-]|$)'
  `.trim();
}

function acceptableWikiItemIconCondition(expression) {
  return `
        ${expression} IS NOT NULL
        AND TRIM(${expression}) <> ''
        AND ${acceptableWikiItemIconSql(expression)}
  `.trim();
}

function normalizeExactKey(value) {
  return toNullableText(value)?.toLowerCase() ?? null;
}

function splitCamelCase(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function normalizeHumanKey(value) {
  const text = toNullableText(value);
  if (!text) return null;
  let normalized = splitCamelCase(text)
    .replace(/[_-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  normalized = normalized
    .replace(/\bbenches\b/g, 'bench')
    .replace(/\bbookcases\b/g, 'bookcase')
    .replace(/\bfountains\b/g, 'fountain')
    .replace(/\bsinks\b/g, 'sink')
    .replace(/\bchairs\b/g, 'chair')
    .replace(/\btables\b/g, 'table');

  return normalized.replace(/\s+/g, ' ').trim() || null;
}

function normalizeItem(raw) {
  return {
    id: Number(raw.id),
    internalName: toNullableText(raw.internal_name ?? raw.internalName),
    name: toNullableText(raw.name),
    nameZh: toNullableText(raw.name_zh ?? raw.nameZh),
    image: isWikiImageUrl(raw.image ?? raw.image_url ?? raw.best_image_url)
      ? toNullableText(raw.image ?? raw.image_url ?? raw.best_image_url)
      : null
  };
}

function normalizeStation(raw) {
  return {
    id: Number(raw.id),
    internalName: toNullableText(raw.internal_name ?? raw.internalName),
    nameEn: toNullableText(raw.name_en ?? raw.nameEn),
    nameZh: toNullableText(raw.name_zh ?? raw.nameZh),
    stationType: toNullableText(raw.station_type ?? raw.stationType) ?? 'crafting_station',
    itemId: raw.item_id ?? raw.itemId ?? null,
    imageUrl: toNullableText(raw.image_url ?? raw.imageUrl),
    sortOrder: Number.isFinite(Number(raw.sort_order ?? raw.sortOrder)) ? Number(raw.sort_order ?? raw.sortOrder) : 0
  };
}

function normalizeRecipeStation(raw) {
  return {
    id: Number(raw.id),
    stationId: raw.station_id ?? raw.stationId ?? null,
    stationItemId: raw.station_item_id ?? raw.stationItemId ?? null,
    stationInternalName: toNullableText(raw.station_internal_name ?? raw.stationInternalName),
    stationNameRaw: toNullableText(raw.station_name_raw ?? raw.stationNameRaw)
  };
}

function buildSingleValueMap(rows, keySelector) {
  const map = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return map;
}

function createItemLookup(items) {
  const sorted = [...items].sort((left, right) => left.id - right.id);
  const byId = new Map(sorted.map((item) => [item.id, item]));
  return {
    items: sorted,
    byId,
    byInternal: buildSingleValueMap(sorted, (item) => normalizeExactKey(item.internalName)),
    byName: buildSingleValueMap(sorted, (item) => normalizeExactKey(item.name)),
    byNameZh: buildSingleValueMap(sorted, (item) => normalizeExactKey(item.nameZh))
  };
}

function isNoEntityStation(station) {
  if (station?.stationType === 'environment') {
    return true;
  }
  return [station?.nameEn, station?.internalName, station?.nameZh]
    .map(normalizeHumanKey)
    .some((key) => key && NO_ENTITY_STATION_KEYS.has(key));
}

function resolveExactStationItem(station, itemLookup) {
  const internalKey = normalizeExactKey(station.internalName);
  if (internalKey && itemLookup.byInternal.has(internalKey)) {
    return { item: itemLookup.byInternal.get(internalKey), matchKind: 'internal_name' };
  }

  const nameKey = normalizeExactKey(station.nameEn);
  if (nameKey && itemLookup.byName.has(nameKey)) {
    return { item: itemLookup.byName.get(nameKey), matchKind: 'name_en' };
  }

  const zhKey = normalizeExactKey(station.nameZh);
  if (zhKey && itemLookup.byNameZh.has(zhKey)) {
    return { item: itemLookup.byNameZh.get(zhKey), matchKind: 'name_zh' };
  }

  return null;
}

function resolveVariantStationItem(station, itemLookup) {
  const stationKey = normalizeHumanKey(station.nameEn ?? station.internalName);
  if (!stationKey || !VARIANT_STATION_KEYS.has(stationKey)) {
    return null;
  }

  const item = itemLookup.items.find((candidate) => {
    const candidateName = normalizeHumanKey(candidate.name);
    return candidateName === stationKey || candidateName?.endsWith(` ${stationKey}`);
  });

  return item ? { item, matchKind: 'first_variant' } : null;
}

function resolveStationItem(station, itemLookup) {
  if (!station || isNoEntityStation(station)) {
    return null;
  }
  return resolveExactStationItem(station, itemLookup) ?? resolveVariantStationItem(station, itemLookup);
}

function needsStationUpdate(station, nextItemId, nextImageUrl) {
  const currentItemId = station.itemId == null ? null : Number(station.itemId);
  const desiredItemId = nextItemId == null ? null : Number(nextItemId);
  const currentImageUrl = toNullableText(station.imageUrl);
  const desiredImageUrl = toNullableText(nextImageUrl);
  return currentItemId !== desiredItemId
    || currentImageUrl !== desiredImageUrl
    || (currentImageUrl != null && !isWikiImageUrl(currentImageUrl));
}

async function resolveItemImage(match, options) {
  if (!match?.item) {
    return { imageUrl: null, fetched: null };
  }
  if (isAcceptableItemIconUrl(match.item.image)) {
    return { imageUrl: match.item.image, fetched: null };
  }
  if (!options.fetchMissingWikiImages) {
    return { imageUrl: null, fetched: null };
  }

  const fetched = await options.fetchWikiImageForItem(match.item);
  if (!isWikiImageUrl(fetched?.imageUrl)) {
    return { imageUrl: null, fetched: null };
  }

  match.item.image = fetched.imageUrl;
  return {
    imageUrl: fetched.imageUrl,
    fetched: {
      itemId: match.item.id,
      itemInternalName: match.item.internalName,
      itemName: match.item.name,
      imageUrl: fetched.imageUrl,
      sourceFileTitle: toNullableText(fetched.sourceFileTitle),
      sourcePage: toNullableText(fetched.sourcePage) ?? match.item.name,
      width: fetched.width ?? null,
      height: fetched.height ?? null,
      contentType: toNullableText(fetched.contentType)
    }
  };
}

function extractComboComponents(station) {
  const raw = station.nameEn ?? station.nameZh ?? station.internalName;
  if (!raw) return [];
  return raw
    .replace(/\bor\b/gi, '/')
    .replace(/\band\b/gi, '+')
    .split(/[+/]/)
    .map((part) => part.replace(/[()]/g, ' ').trim())
    .filter(Boolean)
    .filter((part, index, values) => values.findIndex((value) => normalizeHumanKey(value) === normalizeHumanKey(part)) === index);
}

async function resolveComboImage(station, itemLookup, options) {
  for (const component of extractComboComponents(station)) {
    const match = resolveStationItem({
      id: station.id,
      internalName: null,
      nameEn: component,
      nameZh: null,
      stationType: 'crafting_station'
    }, itemLookup);
    const resolved = await resolveItemImage(match, options);
    if (resolved.imageUrl) {
      return { ...resolved, match };
    }
  }
  return { imageUrl: null, fetched: null, match: null };
}

export async function buildCraftingStationImageRepairPlan({
  localItems = [],
  localCraftingStations = [],
  recipeStations = [],
  fetchMissingWikiImages = true,
  fetchWikiImageForItem = defaultFetchWikiImageForItem
} = {}) {
  const items = localItems.map(normalizeItem).filter((item) => Number.isFinite(item.id));
  const itemLookup = createItemLookup(items);
  const stations = localCraftingStations.map(normalizeStation).filter((station) => Number.isFinite(station.id));
  const itemImageUpdatesByItemId = new Map();
  const stationUpdates = [];
  const unmatchedStations = [];
  const matchedWithoutImage = [];

  const options = { fetchMissingWikiImages, fetchWikiImageForItem };

  for (const station of stations) {
    if (station.stationType === 'crafting_station_combo') {
      const resolved = await resolveComboImage(station, itemLookup, options);
      if (resolved.fetched) {
        itemImageUpdatesByItemId.set(resolved.fetched.itemId, resolved.fetched);
      }
      const nextImageUrl = resolved.imageUrl ?? null;
      if (needsStationUpdate(station, null, nextImageUrl)) {
        stationUpdates.push(toStationUpdate(station, null, nextImageUrl, resolved.match?.matchKind ?? 'combo_first_component'));
      }
      if (!nextImageUrl) {
        unmatchedStations.push({ id: station.id, nameEn: station.nameEn, nameZh: station.nameZh, stationType: station.stationType, reason: 'combo_component_image_not_found' });
      }
      continue;
    }

    const match = resolveStationItem(station, itemLookup);
    if (!match?.item) {
      if (needsStationUpdate(station, null, null)) {
        stationUpdates.push(toStationUpdate(station, null, null, 'no_item_match'));
      }
      unmatchedStations.push({ id: station.id, nameEn: station.nameEn, nameZh: station.nameZh, stationType: station.stationType, reason: 'no_item_match' });
      continue;
    }

    const resolved = await resolveItemImage(match, options);
    if (resolved.fetched) {
      itemImageUpdatesByItemId.set(resolved.fetched.itemId, resolved.fetched);
    }
    if (!resolved.imageUrl) {
      matchedWithoutImage.push({
        stationId: station.id,
        itemId: match.item.id,
        itemInternalName: match.item.internalName,
        itemName: match.item.name,
        reason: 'matched_item_without_wiki_image'
      });
    }
    if (needsStationUpdate(station, match.item.id, resolved.imageUrl)) {
      stationUpdates.push(toStationUpdate(station, match.item.id, resolved.imageUrl, match.matchKind));
    }
  }

  const repairedStations = applyStationUpdates(stations, stationUpdates);
  const recipeStationUpdates = buildRecipeStationUpdates(recipeStations.map(normalizeRecipeStation), repairedStations);

  return {
    summary: {
      stationCount: stations.length,
      stationUpdateCount: stationUpdates.length,
      itemImageUpdateCount: itemImageUpdatesByItemId.size,
      recipeStationUpdateCount: recipeStationUpdates.length,
      unmatchedStationCount: unmatchedStations.length,
      matchedWithoutImageCount: matchedWithoutImage.length
    },
    stationUpdates,
    itemImageUpdates: Array.from(itemImageUpdatesByItemId.values()),
    recipeStationUpdates,
    unmatchedStations,
    matchedWithoutImage
  };
}

function toStationUpdate(station, itemId, imageUrl, reason) {
  return {
    id: station.id,
    reason,
    before: {
      itemId: station.itemId == null ? null : Number(station.itemId),
      imageUrl: station.imageUrl ?? null
    },
    next: {
      itemId: itemId == null ? null : Number(itemId),
      imageUrl: imageUrl ?? null
    },
    station: {
      internalName: station.internalName,
      nameEn: station.nameEn,
      nameZh: station.nameZh,
      stationType: station.stationType
    }
  };
}

function applyStationUpdates(stations, stationUpdates) {
  const updateById = new Map(stationUpdates.map((update) => [update.id, update]));
  return stations.map((station) => {
    const update = updateById.get(station.id);
    if (!update) {
      return station;
    }
    return {
      ...station,
      itemId: update.next.itemId,
      imageUrl: update.next.imageUrl
    };
  });
}

function createStationLookup(stations) {
  const sorted = [...stations].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id - right.id;
  });
  const lookup = {
    byId: new Map(sorted.map((station) => [station.id, station])),
    byItemId: new Map(),
    byInternal: new Map(),
    byExactName: new Map(),
    byHumanName: new Map()
  };

  for (const station of sorted) {
    if (station.itemId != null && !lookup.byItemId.has(Number(station.itemId))) {
      lookup.byItemId.set(Number(station.itemId), station);
    }
    const internalKey = normalizeExactKey(station.internalName);
    if (internalKey && !lookup.byInternal.has(internalKey)) {
      lookup.byInternal.set(internalKey, station);
    }
    for (const value of [station.nameEn, station.nameZh]) {
      const exactKey = normalizeExactKey(value);
      if (exactKey && !lookup.byExactName.has(exactKey)) {
        lookup.byExactName.set(exactKey, station);
      }
      const humanKey = normalizeHumanKey(value);
      if (humanKey && !lookup.byHumanName.has(humanKey)) {
        lookup.byHumanName.set(humanKey, station);
      }
    }
  }
  return lookup;
}

function resolveRecipeStation(row, lookup) {
  if (row.stationId != null && lookup.byId.has(Number(row.stationId))) {
    return lookup.byId.get(Number(row.stationId));
  }
  if (row.stationItemId != null && lookup.byItemId.has(Number(row.stationItemId))) {
    return lookup.byItemId.get(Number(row.stationItemId));
  }
  const internalKey = normalizeExactKey(row.stationInternalName);
  if (internalKey && lookup.byInternal.has(internalKey)) {
    return lookup.byInternal.get(internalKey);
  }
  const exactNameKey = normalizeExactKey(row.stationNameRaw);
  if (exactNameKey && lookup.byExactName.has(exactNameKey)) {
    return lookup.byExactName.get(exactNameKey);
  }
  const humanNameKey = normalizeHumanKey(row.stationNameRaw);
  if (humanNameKey && lookup.byHumanName.has(humanNameKey)) {
    return lookup.byHumanName.get(humanNameKey);
  }
  return null;
}

function buildRecipeStationUpdates(recipeStations, repairedStations) {
  const lookup = createStationLookup(repairedStations);
  const updates = [];
  for (const row of recipeStations) {
    if (!Number.isFinite(row.id)) continue;
    const station = resolveRecipeStation(row, lookup);
    if (!station) continue;

    const next = {
      stationId: station.id,
      stationItemId: station.itemId == null ? null : Number(station.itemId),
      stationInternalName: station.internalName ?? null
    };
    const before = {
      stationId: row.stationId == null ? null : Number(row.stationId),
      stationItemId: row.stationItemId == null ? null : Number(row.stationItemId),
      stationInternalName: row.stationInternalName ?? null
    };
    if (
      before.stationId !== next.stationId
      || before.stationItemId !== next.stationItemId
      || before.stationInternalName !== next.stationInternalName
    ) {
      updates.push({
        id: row.id,
        before,
        next,
        stationNameRaw: row.stationNameRaw
      });
    }
  }
  return updates;
}

async function defaultFetchWikiImageForItem(item) {
  const sourcePage = item.name ?? splitCamelCase(item.internalName);
  if (!sourcePage) return null;

  const directImage = await fetchWikiImageInfoByTitle(`${sourcePage}.png`, sourcePage);
  if (isAcceptableItemIconUrl(directImage?.imageUrl)) {
    return directImage;
  }

  const parseParams = new URLSearchParams({
    action: 'parse',
    format: 'json',
    page: sourcePage,
    prop: 'images',
    redirects: '1'
  });
  const parseJson = await fetchWikiJson(`${WIKI_API_URL}?${parseParams.toString()}`);
  const images = Array.isArray(parseJson?.parse?.images) ? parseJson.parse.images : [];
  const sourceFileTitle = chooseWikiImageTitle(images, item);
  if (!sourceFileTitle) return null;

  return fetchWikiImageInfoByTitle(sourceFileTitle, sourcePage);
}

async function fetchWikiImageInfoByTitle(sourceFileTitle, sourcePage) {
  const imageInfoParams = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: `File:${sourceFileTitle}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|size'
  });
  const imageInfoJson = await fetchWikiJson(`${WIKI_API_URL}?${imageInfoParams.toString()}`);
  const pages = Object.values(imageInfoJson?.query?.pages ?? {});
  const info = pages[0]?.imageinfo?.[0];
  if (!isWikiImageUrl(info?.url)) return null;
  const pageTitle = toNullableText(pages[0]?.title)?.replace(/^File:/, '') ?? sourceFileTitle;

  return {
    imageUrl: info.url,
    sourceFileTitle: pageTitle,
    sourcePage,
    width: info.width ?? null,
    height: info.height ?? null,
    contentType: info.mime ?? null
  };
}

async function fetchWikiJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TerraPedia crafting station image repair (local data sync)'
    }
  });
  if (!response.ok) {
    throw new Error(`Wiki request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function chooseWikiImageTitle(images, item) {
  const labels = [
    item.name,
    splitCamelCase(item.internalName)
  ].map(normalizeHumanKey).filter(Boolean);
  const ranked = images
    .map((title, index) => ({ title, index, score: scoreWikiImageTitle(title, labels) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.index - right.index);
  return ranked[0]?.title ?? null;
}

function scoreWikiImageTitle(title, labels) {
  const text = toNullableText(title);
  if (!text || shouldRejectWikiImageTitle(text)) return Number.POSITIVE_INFINITY;
  const withoutExtension = text.replace(/\.[a-z0-9]+$/i, '');
  const key = normalizeHumanKey(withoutExtension);
  if (!key) return Number.POSITIVE_INFINITY;
  for (const label of labels) {
    if (key === label) return 0;
    if (key.startsWith(`${label} `)) return 1;
    if (key.includes(label)) return 2;
  }
  return Number.POSITIVE_INFINITY;
}

function shouldRejectWikiImageTitle(title) {
  return /^(Desktop|Console|Mobile|Old-gen_console|Auto|Stack_digit|Rarity_color)_/i.test(title)
    || /_only\./i.test(title)
    || /\(demo\)\./i.test(title)
    || /\(placed\)\./i.test(title)
    || /_placed\./i.test(title)
    || /mask\./i.test(title);
}

export function buildLoadLocalItemsSql(localDatabase) {
  const itemImage = 'i.`image`';
  const originalUrl = 'ii.`original_url`';
  const cachedUrl = 'ii.`cached_url`';
  const wikiImage = `
    COALESCE(
      CASE
        WHEN ${acceptableWikiItemIconCondition(itemImage)}
          THEN TRIM(i.\`image\`)
      END,
      (
        SELECT COALESCE(
          CASE
            WHEN ${acceptableWikiItemIconCondition(originalUrl)}
              THEN TRIM(ii.\`original_url\`)
          END,
          CASE
            WHEN ${acceptableWikiItemIconCondition(cachedUrl)}
              THEN TRIM(ii.\`cached_url\`)
          END
        )
        FROM ${qualified(localDatabase, 'item_images')} ii
        WHERE ii.\`item_id\` = i.\`id\`
          AND ii.\`deleted\` = 0
          AND ii.\`status\` = 1
          AND (
            (${acceptableWikiItemIconCondition(originalUrl)})
            OR (${acceptableWikiItemIconCondition(cachedUrl)})
          )
        ORDER BY
          CASE WHEN ${acceptableWikiItemIconCondition(originalUrl)} THEN 0 ELSE 1 END,
          ii.\`is_primary\` DESC,
          COALESCE(ii.\`sort_order\`, 0) ASC,
          ii.\`id\` ASC
        LIMIT 1
      )
    )
  `.trim();
  return `
    SELECT i.\`id\`, i.\`internal_name\`, i.\`name\`, i.\`name_zh\`, ${wikiImage} AS \`image\`
    FROM ${qualified(localDatabase, 'items')} i
    WHERE i.\`deleted\` = 0
    ORDER BY i.\`id\` ASC
  `.trim();
}

async function defaultLoadLocalItems(connection, localDatabase) {
  const [rows] = await connection.query(buildLoadLocalItemsSql(localDatabase));
  return rows;
}

async function defaultLoadLocalCraftingStations(connection, localDatabase) {
  const [rows] = await connection.query(`
    SELECT \`id\`, \`item_id\`, \`internal_name\`, \`name_en\`, \`name_zh\`, \`station_type\`, \`image_url\`, \`sort_order\`, \`status\`, \`deleted\`
    FROM ${qualified(localDatabase, 'crafting_stations')}
    WHERE \`deleted\` = 0 AND \`status\` = 1
    ORDER BY \`sort_order\` ASC, \`id\` ASC
  `);
  return rows;
}

async function defaultLoadRecipeStations(connection, localDatabase) {
  const [rows] = await connection.query(`
    SELECT \`id\`, \`station_id\`, \`station_item_id\`, \`station_internal_name\`, \`station_name_raw\`
    FROM ${qualified(localDatabase, 'recipe_stations')}
    ORDER BY \`id\` ASC
  `);
  return rows;
}

async function defaultCollectStats(connection, localDatabase) {
  const [rows] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM ${qualified(localDatabase, 'crafting_stations')} WHERE \`deleted\` = 0 AND \`status\` = 1) AS activeStations,
      (SELECT COUNT(*) FROM ${qualified(localDatabase, 'crafting_stations')} WHERE \`deleted\` = 0 AND \`status\` = 1 AND \`item_id\` IS NOT NULL) AS itemBoundStations,
      (SELECT COUNT(*) FROM ${qualified(localDatabase, 'crafting_stations')} WHERE \`deleted\` = 0 AND \`status\` = 1 AND \`image_url\` LIKE 'https://terraria.wiki.gg/%') AS stationWikiImages,
      (SELECT COUNT(*) FROM ${qualified(localDatabase, 'crafting_stations')} WHERE \`deleted\` = 0 AND \`status\` = 1 AND \`image_url\` LIKE '%/terrapedia-images/%') AS stationMinioImages,
      (SELECT COUNT(*)
         FROM ${qualified(localDatabase, 'crafting_stations')} cs
         JOIN ${qualified(localDatabase, 'items')} i ON i.\`id\` = cs.\`item_id\`
        WHERE cs.\`deleted\` = 0
          AND cs.\`status\` = 1
          AND i.\`deleted\` = 0
          AND i.\`image\` LIKE 'https://terraria.wiki.gg/%'
          AND (cs.\`image_url\` IS NULL OR TRIM(cs.\`image_url\`) = '')
      ) AS stationMissingImageDespiteItemImage,
      (SELECT COUNT(*) FROM ${qualified(localDatabase, 'recipe_stations')} WHERE \`station_id\` IS NULL) AS recipeStationsWithoutStationId,
      (SELECT COUNT(*)
         FROM ${qualified(localDatabase, 'recipe_stations')} rs
         JOIN ${qualified(localDatabase, 'crafting_stations')} cs ON cs.\`id\` = rs.\`station_id\`
        WHERE NOT (rs.\`station_item_id\` <=> cs.\`item_id\`)
      ) AS recipeStationItemMismatches
  `);
  return rows[0] ?? {};
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `crafting-station-image-repair-${report.dateTag}.json`);
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

async function backupTable(connection, localDatabase, tableName, backupSuffix) {
  const backupTableName = `${tableName}_${BACKUP_LABEL}_${backupSuffix}`;
  await connection.query(`CREATE TABLE ${qualified(localDatabase, backupTableName)} LIKE ${qualified(localDatabase, tableName)}`);
  await connection.query(`INSERT INTO ${qualified(localDatabase, backupTableName)} SELECT * FROM ${qualified(localDatabase, tableName)}`);
  return backupTableName;
}

async function applyPlan(connection, localDatabase, plan, backupSuffix) {
  const backups = {};
  for (const tableName of ['crafting_stations', 'recipe_stations', 'items', 'item_images']) {
    backups[tableName] = await backupTable(connection, localDatabase, tableName, backupSuffix);
  }

  await connection.query('START TRANSACTION');
  try {
    for (const update of plan.itemImageUpdates) {
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
            AND (
              \`original_url\` = ?
              OR \`cached_url\` = ?
            )`,
        [update.itemId, WIKI_PROVIDER, update.imageUrl, update.imageUrl]
      );
      await connection.query(
        `INSERT INTO ${qualified(localDatabase, 'item_images')}
          (\`item_id\`, \`role\`, \`provider\`, \`source_file_title\`, \`source_page\`, \`original_url\`, \`cached_url\`, \`width\`, \`height\`, \`content_type\`, \`is_primary\`, \`sort_order\`, \`status\`, \`deleted\`, \`created_at\`, \`updated_at\`)
         VALUES (?, 'icon', ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 0, NOW(), NOW())`,
        [
          update.itemId,
          WIKI_PROVIDER,
          update.sourceFileTitle,
          update.sourcePage,
          update.imageUrl,
          update.imageUrl,
          update.width,
          update.height,
          update.contentType
        ]
      );
    }

    for (const update of plan.stationUpdates) {
      await connection.query(
        `UPDATE ${qualified(localDatabase, 'crafting_stations')}
            SET \`item_id\` = ?,
                \`image_url\` = ?,
                \`updated_at\` = NOW()
          WHERE \`id\` = ?`,
        [update.next.itemId, update.next.imageUrl, update.id]
      );
    }

    for (const update of plan.recipeStationUpdates) {
      await connection.query(
        `UPDATE ${qualified(localDatabase, 'recipe_stations')}
            SET \`station_id\` = ?,
                \`station_item_id\` = ?,
                \`station_internal_name\` = ?,
                \`updated_at\` = NOW()
          WHERE \`id\` = ?`,
        [
          update.next.stationId,
          update.next.stationItemId,
          update.next.stationInternalName,
          update.id
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

export async function runCraftingStationImageRepair(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    fetchMissingWikiImages: options.fetchMissingWikiImages ?? true,
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    dateTag: options.dateTag ?? toDateTag(now),
    backupSuffix: options.backupSuffix ?? toBackupSuffix(now)
  };

  const executeLocal = dependencies.executeLocal
    ?? ((fn) => defaultExecuteLocal(normalized.localDatabase, dependencies, fn));
  const loadLocalItems = dependencies.loadLocalItems ?? defaultLoadLocalItems;
  const loadLocalCraftingStations = dependencies.loadLocalCraftingStations ?? defaultLoadLocalCraftingStations;
  const loadRecipeStations = dependencies.loadRecipeStations ?? defaultLoadRecipeStations;
  const collectStats = dependencies.collectStats ?? defaultCollectStats;
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const fetchWikiImageForItem = dependencies.fetchWikiImageForItem ?? defaultFetchWikiImageForItem;

  return executeLocal(async (connection) => {
    const before = await collectStats(connection, normalized.localDatabase);
    const [localItems, localCraftingStations, recipeStations] = await Promise.all([
      loadLocalItems(connection, normalized.localDatabase),
      loadLocalCraftingStations(connection, normalized.localDatabase),
      loadRecipeStations(connection, normalized.localDatabase)
    ]);

    const plan = await buildCraftingStationImageRepairPlan({
      localItems,
      localCraftingStations,
      recipeStations,
      fetchMissingWikiImages: normalized.fetchMissingWikiImages,
      fetchWikiImageForItem
    });

    const backups = normalized.apply
      ? await applyPlan(connection, normalized.localDatabase, plan, normalized.backupSuffix)
      : {};
    const after = normalized.apply ? await collectStats(connection, normalized.localDatabase) : before;

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      fetchMissingWikiImages: normalized.fetchMissingWikiImages,
      localDatabase: normalized.localDatabase,
      backupSuffix: normalized.backupSuffix,
      backups,
      before,
      after,
      summary: plan.summary,
      stationUpdates: plan.stationUpdates.slice(0, 200),
      itemImageUpdates: plan.itemImageUpdates.slice(0, 200),
      recipeStationUpdates: plan.recipeStationUpdates.slice(0, 200),
      unmatchedStations: plan.unmatchedStations.slice(0, 200),
      matchedWithoutImage: plan.matchedWithoutImage.slice(0, 200)
    };
    const reportPath = await writeReport(report);
    return { report, reportPath, plan };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runCraftingStationImageRepair(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Local database: ${result.report.localDatabase}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Station updates: ${result.report.summary.stationUpdateCount}`);
  console.log(`Item image updates: ${result.report.summary.itemImageUpdateCount}`);
  console.log(`Recipe station updates: ${result.report.summary.recipeStationUpdateCount}`);
  console.log(`Matched without image: ${result.report.summary.matchedWithoutImageCount}`);
}
