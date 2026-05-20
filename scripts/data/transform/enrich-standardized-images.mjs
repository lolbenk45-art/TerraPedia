import fs from 'node:fs';
import path from 'node:path';
import { fetchWikiUrlJson } from '../lib/wiki-item-utils.mjs';

const root = path.resolve(process.cwd());
const stdDir = path.join(root, 'data', 'standardized');
const viewScriptPath = path.join(root, 'scripts', 'data', 'split-standardized-view.mjs');

const itemsPath = path.join(stdDir, 'items.standardized.json');
const npcsPath = path.join(stdDir, 'npcs.standardized.json');
const projectilesPath = path.join(stdDir, 'projectiles.standardized.json');
const buffsPath = path.join(stdDir, 'buffs.standardized.json');
const relationsPath = path.join(stdDir, 'item_relations.standardized.json');
const npcIdRowImagesPath = path.join(root, 'data', 'generated', 'npc-id-row-images.json');
const npcIdRowImagesFallbackPath = path.join(root, 'reports', 'npc-id-row-images.json');

const MAX_TITLES_PER_QUERY = 40;
const RETRY_MAX = 6;

const items = readJson(itemsPath);
const npcs = readJson(npcsPath);
const projectiles = readJson(projectilesPath);
const buffs = readJson(buffsPath);
const relations = readJson(relationsPath);
const npcIdRowImages = readOptionalJson(npcIdRowImagesPath) ?? readOptionalJson(npcIdRowImagesFallbackPath);

const itemImageMap = buildItemImageMap(relations);
const npcExactImageMaps = buildNpcExactImageMaps(npcIdRowImages);
const itemPatched = patchItems(items, itemImageMap);
const buffPatched = patchBuffs(buffs);
const projectilePatched = patchProjectiles(projectiles);
const npcPatched = await patchNpcs(npcs, npcExactImageMaps);

writeJson(itemsPath, itemPatched.payload);
writeJson(buffsPath, buffPatched.payload);
writeJson(projectilesPath, projectilePatched.payload);
writeJson(npcsPath, npcPatched.payload);

const report = {
  generatedAt: new Date().toISOString(),
  item: itemPatched.stats,
  buff: buffPatched.stats,
  projectile: projectilePatched.stats,
  npc: npcPatched.stats
};

writeJson(path.join(stdDir, '_image-enrich-report.json'), report);

console.log(JSON.stringify(report, null, 2));
console.log(`Rebuild view with: node ${path.relative(root, viewScriptPath).replaceAll('\\', '/')}`);

function patchItems(payload, imageMap) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  let hit = 0;

  for (const record of records) {
    const key = record?.internalName;
    if (!key || !imageMap.has(key)) {
      continue;
    }
    const image = imageMap.get(key);
    if (!image?.url) {
      continue;
    }
    record.imageFileTitle = image.fileTitle ?? null;
    record.imageUrl = image.url;
    record.imageWidth = image.width ?? null;
    record.imageHeight = image.height ?? null;
    record.imageContentType = image.contentType ?? null;
    hit += 1;
  }

  return {
    payload,
    stats: {
      total: records.length,
      imageAssigned: hit,
      coverage: records.length > 0 ? Number((hit / records.length).toFixed(4)) : 0
    }
  };
}

function patchBuffs(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  let hit = 0;
  for (const record of records) {
    const fileTitle = normalizeFileTitle(record?.image);
    if (!fileTitle) {
      continue;
    }
    record.imageFileTitle = fileTitle;
    record.imageUrl = toWikiImageUrl(fileTitle);
    hit += 1;
  }
  return {
    payload,
    stats: {
      total: records.length,
      imageAssigned: hit,
      coverage: records.length > 0 ? Number((hit / records.length).toFixed(4)) : 0
    }
  };
}

function patchProjectiles(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  let hit = 0;
  for (const record of records) {
    const fromExtras = record?.extras?.image;
    const fileTitle = normalizeFileTitle(fromExtras);
    if (!fileTitle) {
      continue;
    }
    record.imageFileTitle = fileTitle;
    record.imageUrl = toWikiImageUrl(fileTitle);
    hit += 1;
  }
  return {
    payload,
    stats: {
      total: records.length,
      imageAssigned: hit,
      coverage: records.length > 0 ? Number((hit / records.length).toFixed(4)) : 0
    }
  };
}

async function patchNpcs(payload, exactMaps) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  const uniqueNames = [...new Set(records.map((record) => record?.name).filter((name) => typeof name === 'string' && name.trim() !== ''))];
  const map = await fetchNpcImageMap(uniqueNames);

  let exactHit = 0;
  let hit = 0;
  for (const record of records) {
    const exactImage = resolveNpcExactImage(record, exactMaps);
    const image = exactImage ?? map.get(record?.name ?? '');
    if (!image?.url) {
      continue;
    }
    record.imageFileTitle = image.fileTitle ?? null;
    record.imageUrl = image.url;
    record.imageWidth = image.width ?? null;
    record.imageHeight = image.height ?? null;
    record.imageContentType = image.contentType ?? null;
    if (exactImage) {
      exactHit += 1;
    }
    hit += 1;
  }

  return {
    payload,
    stats: {
      total: records.length,
      uniqueNames: uniqueNames.length,
      exactImageAssigned: exactHit,
      exactImageMapEntries: exactMaps.byId.size + exactMaps.byInternalName.size,
      imageAssigned: hit,
      coverage: records.length > 0 ? Number((hit / records.length).toFixed(4)) : 0
    }
  };
}

function buildNpcExactImageMaps(payload) {
  const byId = new Map();
  const byInternalName = new Map();
  const records = Array.isArray(payload?.records)
    ? payload.records
    : Array.isArray(payload)
      ? payload
      : [];

  for (const record of records) {
    const image = normalizeExactNpcImage(record);
    if (!image?.url) {
      continue;
    }
    const id = toFiniteNumber(record?.gameId ?? record?.id ?? record?.sourceId);
    const internalName = toText(record?.internalName);
    if (id != null && !byId.has(id)) {
      byId.set(id, image);
    }
    if (internalName && !byInternalName.has(internalName)) {
      byInternalName.set(internalName, image);
    }
  }

  return { byId, byInternalName };
}

function resolveNpcExactImage(record, exactMaps) {
  const id = toFiniteNumber(record?.id ?? record?.gameId ?? record?.sourceId);
  if (id != null && exactMaps.byId.has(id)) {
    return exactMaps.byId.get(id);
  }
  const internalName = toText(record?.internalName);
  if (internalName && exactMaps.byInternalName.has(internalName)) {
    return exactMaps.byInternalName.get(internalName);
  }
  return null;
}

function normalizeExactNpcImage(record) {
  const fileTitle = normalizeFileTitle(record?.imageFileTitle);
  const imageUrl = toText(record?.imageUrl);
  if (!imageUrl) {
    return null;
  }
  return {
    fileTitle,
    url: imageUrl,
    width: toFiniteNumber(record?.imageWidth),
    height: toFiniteNumber(record?.imageHeight),
    contentType: toText(record?.imageContentType)
  };
}

function buildItemImageMap(relationsPayload) {
  const map = new Map();
  const itemImages = relationsPayload?.records?.itemImages;
  if (!Array.isArray(itemImages)) {
    return map;
  }

  const sorted = [...itemImages].sort((left, right) => {
    const score = (value) => {
      const primary = value?.isPrimary === true ? 0 : 1;
      const icon = value?.role === 'icon' ? 0 : 1;
      const order = Number(value?.sortOrder ?? 999999);
      return [primary, icon, order];
    };
    const a = score(left);
    const b = score(right);
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });

  for (const image of sorted) {
    const key = image?.itemInternalName;
    if (!key || map.has(key)) {
      continue;
    }
    map.set(key, {
      fileTitle: normalizeFileTitle(image?.sourceFileTitle),
      url: image?.cachedUrl ?? image?.originalUrl ?? null,
      width: image?.width ?? null,
      height: image?.height ?? null,
      contentType: image?.contentType ?? null
    });
  }

  return map;
}

async function fetchNpcImageMap(names) {
  const map = new Map();
  const chunks = chunk(names, MAX_TITLES_PER_QUERY);

  for (let i = 0; i < chunks.length; i += 1) {
    const namesChunk = chunks[i];
    const fileTitles = namesChunk.map((name) => `${name}.png`);
    const imageInfoMap = await queryImageInfoBatch(fileTitles);
    for (let j = 0; j < namesChunk.length; j += 1) {
      const name = namesChunk[j];
      const fileTitle = fileTitles[j];
      const imageInfo = imageInfoMap.get(fileTitle);
      if (imageInfo) {
        map.set(name, imageInfo);
      }
    }
  }
  return map;
}

async function queryImageInfoBatch(fileTitles) {
  const url = new URL('https://terraria.wiki.gg/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('titles', fileTitles.map((title) => `File:${title}`).join('|'));

  const payload = await retry(async () => {
    return fetchWikiUrlJson({
      url,
      profile: 'revision',
      sourceKey: `image-enrich:${fileTitles.join('|')}`
    });
  });

  const map = new Map();
  const pages = payload?.query?.pages ?? [];
  for (const page of pages) {
    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
    if (!info?.url) {
      continue;
    }
    const fileTitle = String(page?.title ?? '').replace(/^File:/, '');
    map.set(fileTitle, {
      fileTitle,
      url: info.url,
      width: info.width ?? null,
      height: info.height ?? null,
      contentType: info.mime ?? null
    });
  }
  return map;
}

async function retry(fn) {
  let attempt = 0;
  while (attempt < RETRY_MAX) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRY_MAX) {
        throw error;
      }
      await sleep(Math.min(2000 * attempt, 10000));
    }
  }
  throw new Error('retry exhausted');
}

function normalizeFileTitle(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toWikiImageUrl(fileTitle) {
  const normalized = String(fileTitle).replaceAll(' ', '_');
  return `https://terraria.wiki.gg/images/${encodeURIComponent(normalized)}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

function toFiniteNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
