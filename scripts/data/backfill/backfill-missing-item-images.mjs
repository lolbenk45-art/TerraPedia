#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveAdminAuth } from '../../lib/local-runtime-config.mjs';

const packageRequire = createRequire(path.join(process.cwd(), 'data-query-app', 'package.json'));
const mysql = packageRequire('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const apiBase = trimTrailingSlash(args.apiBase || 'http://127.0.0.1:8888/api');
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
});
const limit = Number(args.limit || '0');
const concurrency = Math.max(1, Number(args.concurrency || '8'));
const batchSize = Math.max(concurrency, Number(args.batchSize || String(concurrency * 25)));
const output = args.output || path.join(process.cwd(), 'reports', `items-missing-image-backfill-${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const standardizedItems = loadJson(path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'));
const standardizedItemPages = loadJson(path.join(process.cwd(), 'data', 'standardized', 'item_pages.standardized.json'));
const itemRecords = Array.isArray(standardizedItems.records) ? standardizedItems.records : [];
const itemPageRecords = Array.isArray(standardizedItemPages.records) ? standardizedItemPages.records : [];

const itemByInternalName = new Map(itemRecords.map((record) => [normalizeInternalName(record?.internalName), record]));
const itemById = new Map(itemRecords.map((record) => [Number(record?.id ?? 0), record]));
const itemPageByInternalName = new Map(itemPageRecords.map((record) => [normalizeInternalName(record?.itemInternalName), record]));

const connection = await mysql.createConnection(db);
const authHeader = await loginAndBuildAuthHeader(apiBase, adminUsername, adminPassword);
const uploadCache = new Map();
const wikiPageImageCache = new Map();

try {
  const [rows] = await connection.query(`
    SELECT id, internal_name, name, name_zh, image
    FROM items
    WHERE deleted = 0
      AND (image IS NULL OR TRIM(image) = '')
    ORDER BY id ASC
  `);

  const candidates = limit > 0 ? rows.slice(0, limit) : rows;
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    apiBase,
    db,
    totalMissingBefore: rows.length,
    checked: 0,
    updated: 0,
    unresolved: 0,
    failed: 0,
    reasons: {
      standardized_image_url: 0,
      wiki_page_image: 0,
      missing_source: 0,
      upload_failed: 0,
    },
    samples: [],
  };

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    const results = await mapWithConcurrency(batch, concurrency, async (row) => processCandidateRow(row));
    await applyBatchResults(results, summary, apply);
    summary.lastProcessedIndex = Math.min(start + batch.length, candidates.length);
    persistSummary(output, summary);
    console.log(`[backfill] processed ${summary.lastProcessedIndex}/${candidates.length}, updated=${summary.updated}, unresolved=${summary.unresolved}, failed=${summary.failed}`);
  }

  persistSummary(output, summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  persistSummary(output, {
    generatedAt: new Date().toISOString(),
    apply,
    apiBase,
    db,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  await connection.end();
}

async function applyBatchResults(results, summary, apply) {
  if (!apply) {
    for (const result of results) {
      summarizeResult(result, summary, false);
    }
    return;
  }

  await connection.beginTransaction();
  try {
    for (const result of results) {
      await summarizeResult(result, summary, true);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function summarizeResult(result, summary, applyUpdate) {
  summary.checked += 1;

  if (result.status === 'missing_source') {
    summary.unresolved += 1;
    summary.reasons.missing_source += 1;
    pushSample(summary.samples, result.sample);
    return;
  }

  if (result.status === 'upload_failed') {
    summary.failed += 1;
    summary.reasons.upload_failed += 1;
    pushSample(summary.samples, result.sample);
    return;
  }

  if (applyUpdate) {
    const [dbResult] = await connection.execute('UPDATE items SET image = ?, updated_at = NOW() WHERE id = ?', [result.managedUrl, result.itemId]);
    summary.updated += Number(dbResult.affectedRows || 0);
  } else {
    summary.updated += 1;
  }
  summary.reasons[result.sourceKind] += 1;
  pushSample(summary.samples, result.sample);
}

function persistSummary(output, summary) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
}

async function resolveWikiImageUrl({ itemId, internalName, dbName, standardizedName, pageTitle }) {
  const candidateTitles = [pageTitle, standardizedName, dbName]
    .map(toText)
    .filter(Boolean);

  for (const title of candidateTitles) {
    const cacheKey = `${itemId}:${title}`;
    if (wikiPageImageCache.has(cacheKey)) {
      const cached = wikiPageImageCache.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    const imageUrl = await resolveWikiImageUrlFromTitle(title, {
      itemName: standardizedName || dbName || title,
      internalName,
    });
    wikiPageImageCache.set(cacheKey, imageUrl ?? null);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

async function processCandidateRow(row) {
  const itemId = Number(row.id);
  const internalName = toText(row.internal_name);
  const dbName = toText(row.name);
  const dbNameZh = toText(row.name_zh);

  const standardizedRecord = itemByInternalName.get(normalizeInternalName(internalName)) || itemById.get(itemId) || null;
  const itemPageRecord = itemPageByInternalName.get(normalizeInternalName(internalName)) || null;

  let sourceUrl = toText(standardizedRecord?.imageUrl ?? standardizedRecord?.image ?? standardizedRecord?.image_url);
  let sourceKind = sourceUrl ? 'standardized_image_url' : '';

  if (!sourceUrl) {
    sourceUrl = await resolveWikiImageUrl({
      itemId,
      internalName,
      dbName,
      standardizedName: toText(standardizedRecord?.name),
      pageTitle: toText(itemPageRecord?.pageTitle ?? itemPageRecord?.requestedPageTitle),
    });
    if (sourceUrl) {
      sourceKind = 'wiki_page_image';
    }
  }

  if (!sourceUrl) {
    return {
      status: 'missing_source',
      sample: {
        id: itemId,
        internalName,
        dbName,
        dbNameZh,
        reason: 'missing_source',
        pageTitle: itemPageRecord?.pageTitle ?? null,
      },
    };
  }

  const upload = await uploadFromUrl(sourceUrl, internalName || dbName || `item-${itemId}`, apiBase, authHeader, uploadCache);
  if (!upload?.url) {
    return {
      status: 'upload_failed',
      sample: {
        id: itemId,
        internalName,
        dbName,
        dbNameZh,
        reason: 'upload_failed',
        sourceUrl,
        sourceKind,
      },
    };
  }

  return {
    status: 'updated',
    itemId,
    managedUrl: upload.url,
    sourceKind,
    sample: {
      id: itemId,
      internalName,
      dbName,
      dbNameZh,
      reason: sourceKind,
      sourceUrl,
      managedUrl: upload.url,
      pageTitle: itemPageRecord?.pageTitle ?? null,
    },
  };
}

async function resolveWikiImageUrlFromTitle(pageTitle, { itemName, internalName }) {
  const normalizedPageTitle = toText(pageTitle);
  if (!normalizedPageTitle) return null;

  const canonicalTitle = await resolveCanonicalWikiTitle(normalizedPageTitle);
  const parseUrl = `https://terraria.wiki.gg/api.php?action=parse&page=${encodeURIComponent(canonicalTitle)}&prop=images&format=json`;
  const payload = await fetchWikiJson(parseUrl);
  if (!payload) return null;
  const images = Array.isArray(payload?.parse?.images) ? payload.parse.images : [];
  if (images.length === 0) return null;

  const candidates = rankImageCandidates(images, { itemName, internalName });
  for (const imageTitle of candidates) {
    const queryUrl = `https://terraria.wiki.gg/api.php?action=query&titles=${encodeURIComponent(`File:${imageTitle}`)}&prop=imageinfo&iiprop=url&format=json`;
    const filePayload = await fetchWikiJson(queryUrl);
    if (!filePayload) continue;
    const pages = filePayload?.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const imageUrl = page?.imageinfo?.[0]?.url ? String(page.imageinfo[0].url) : '';
    if (imageUrl) return imageUrl;
  }

  return null;
}

async function resolveCanonicalWikiTitle(pageTitle) {
  const queryUrl = `https://terraria.wiki.gg/api.php?action=query&redirects=1&titles=${encodeURIComponent(pageTitle)}&format=json`;
  const payload = await fetchWikiJson(queryUrl);
  if (!payload) return pageTitle;
  const pages = payload?.query?.pages ?? {};
  const page = Object.values(pages)[0];
  return toText(page?.title) || pageTitle;
}

async function fetchWikiJson(url, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 TerraPedia/1.0' } });
      if (response.status === 429) {
        await sleep(Math.min(12000, 1200 * attempt));
        continue;
      }
      if (!response.ok) return null;
      return await response.json();
    } catch {
      if (attempt === maxAttempts) return null;
      await sleep(Math.min(12000, 800 * attempt));
    }
  }
  return null;
}

function rankImageCandidates(images, { itemName, internalName }) {
  const normalizedItemName = normalizeFileStem(itemName);
  const normalizedInternalName = normalizeFileStem(internalName);
  const filtered = images.filter((entry) => {
    const text = toText(entry);
    if (!text) return false;
    const stem = normalizeFileStem(text.replace(/\.[a-z0-9]+$/i, ''));
    if (!stem) return false;
    return ![
      'desktoponly',
      'consoleonly',
      'mobileonly',
      'oldgenconsoleonly',
      'nintendo3dsonly',
      'autoiicon',
      'autoicon',
      'raritycolor0',
      'raritycolor1',
      'raritycolor2',
      'raritycolor3',
      'raritycolor4',
      'raritycolor5',
      'raritycolor6',
      'raritycolor7',
      'raritycolor8',
      'raritycolor9',
      'stackdigit1',
      'stackdigit2',
      'stackdigit3',
      'stackdigit4',
      'stackdigit5',
      'stackdigit6',
      'stackdigit7',
      'stackdigit8',
      'stackdigit9',
      'pickaxemask',
      'axemask',
      'hammermask',
    ].includes(stem);
  });

  return filtered
    .map((entry) => {
      const text = String(entry);
      const stem = normalizeFileStem(text.replace(/\.[a-z0-9]+$/i, ''));
      let score = 100;
      if (normalizedItemName && stem === normalizedItemName) score = 0;
      else if (normalizedInternalName && stem === normalizedInternalName) score = 1;
      else if (normalizedItemName && stem.includes(normalizedItemName)) score = 2;
      else if (normalizedInternalName && stem.includes(normalizedInternalName)) score = 3;
      else if (/trapped/.test(normalizedItemName) && /trapped/.test(stem)) score = 10;
      return { text, score };
    })
    .sort((left, right) => left.score - right.score || left.text.localeCompare(right.text))
    .map((entry) => entry.text);
}

async function uploadFromUrl(sourceUrl, nameHint, apiBase, authHeader, uploadCache) {
  if (uploadCache.has(sourceUrl)) {
    return uploadCache.get(sourceUrl);
  }

  let upstream;
  try {
    upstream = await fetch(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 TerraPedia/1.0' },
    });
  } catch {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  if (!upstream.ok) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await upstream.arrayBuffer();
  const fileName = buildFileName(sourceUrl, nameHint, contentType);
  const formData = new FormData();
  formData.append('file', new File([arrayBuffer], fileName, { type: contentType }));

  let response;
  try {
    response = await fetch(`${apiBase}/files/images`, {
      method: 'POST',
      headers: authHeader,
      body: formData,
    });
  } catch {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  if (!response.ok) {
    uploadCache.set(sourceUrl, null);
    return null;
  }

  const payload = await response.json();
  const result = payload?.data?.url ? { url: String(payload.data.url) } : null;
  uploadCache.set(sourceUrl, result);
  return result;
}

async function loginAndBuildAuthHeader(apiBase, username, password) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`Failed to login before upload: ${response.status}`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (!token) {
    throw new Error('Login response does not contain token');
  }
  return { Authorization: `Bearer ${token}` };
}

function buildFileName(sourceUrl, nameHint, contentType) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const rawName = pathname.split('/').pop() || `${slugify(nameHint)}${guessExtension(contentType)}`;
    if (rawName.includes('.')) return rawName;
    return `${rawName}${guessExtension(contentType)}`;
  } catch {
    return `${slugify(nameHint)}${guessExtension(contentType)}`;
  }
}

function guessExtension(contentType) {
  const value = String(contentType).split(';')[0].trim().toLowerCase();
  switch (value) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    case 'image/avif': return '.avif';
    default: return '.bin';
  }
}

function normalizeInternalName(value) {
  const text = toText(value);
  return text ? text.toLowerCase() : '';
}

function normalizeFileStem(value) {
  const text = toText(value);
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\.(png|jpg|jpeg|gif|svg|webp|avif)$/i, '')
    .replace(/[_\s\-']/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function slugify(value) {
  const text = toText(value) || 'asset';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
}

function pushSample(samples, sample) {
  if (samples.length < 60) {
    samples.push(sample);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, maxConcurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const runners = Array.from({ length: Math.min(maxConcurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function trimTrailingSlash(value) {
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
