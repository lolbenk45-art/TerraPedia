#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === 'true';
const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
const managedUrlPrefix = trimTrailingSlash(args.managedUrlPrefix || 'http://localhost:9000/terrapedia-images') + '/';
const { username: adminUsername, password: adminPassword } = resolveAdminAuth(args, {
  usernameKey: 'adminUsername',
  passwordKey: 'adminPassword',
});
const limit = Number(args.limit || '0');
const batchSize = Math.max(1, Number(args.batchSize || '100'));
const partitionCount = Math.max(0, Number(args.partitionCount || '0'));
const partitionIndex = Math.max(0, Number(args.partitionIndex || '0'));
const minId = Number.isFinite(Number(args.minId)) ? Number(args.minId) : null;
const maxId = Number.isFinite(Number(args.maxId)) ? Number(args.maxId) : null;
const output = args.output || path.join(process.cwd(), 'reports', `items-image-backfill-${new Date().toISOString().slice(0, 10)}.json`);

const db = {
  host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
  port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
  user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
  password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
  database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
};

const standardizedItems = readRecords(path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'));
const standardizedItemPages = readRecords(path.join(process.cwd(), 'data', 'standardized', 'item_pages.standardized.json'));

const itemByInternal = new Map(standardizedItems.map((item) => [String(item.internalName || '').trim(), item]));
const pageByInternal = new Map(standardizedItemPages.map((item) => [String(item.itemInternalName || '').trim(), item]));
const uploadCache = new Map();
const pageHtmlCache = new Map();
const authHeader = await loginAndBuildAuthHeader();

const conn = await mysql.createConnection(db);

try {
  const [allRows] = await conn.query(`
    SELECT id, internal_name, name, name_zh, image
    FROM items
    WHERE deleted = 0
      AND (image IS NULL OR TRIM(image) = '')
    ORDER BY id ASC
  `);
  const selectedRows = allRows.filter((row) => matchesBatch(row.id));
  const rows = limit > 0 ? selectedRows.slice(0, limit) : selectedRows;

  const summary = {
    apply,
    apiBase,
    managedUrlPrefix,
    totalMissing: allRows.length,
    selectedMissing: selectedRows.length,
    targetCount: rows.length,
    batch: {
      partitionCount,
      partitionIndex,
      minId,
      maxId,
    },
    matchedStandardizedImage: 0,
    matchedWikiPageImage: 0,
    updated: 0,
    skipped: 0,
    unresolved: 0,
    unresolvedReasons: {},
    samples: [],
  };

  let processedInBatch = 0;
  if (apply) {
    await conn.beginTransaction();
  }

  for (const row of rows) {
    const internalName = toText(row.internal_name);
    const standardizedItem = internalName ? itemByInternal.get(internalName) : null;
    const pageEntry = internalName ? pageByInternal.get(internalName) : null;

    let sourceUrl = toText(standardizedItem?.imageUrl);
    let matchedBy = sourceUrl ? 'standardized.imageUrl' : null;

    if (!sourceUrl) {
      sourceUrl = await resolveWikiImageUrl({
        pageTitle: toText(pageEntry?.pageTitle) || toText(pageEntry?.requestedPageTitle) || toText(standardizedItem?.name) || toText(row.name),
        itemName: toText(row.name) || toText(standardizedItem?.name),
        internalName,
      });
      if (sourceUrl) {
        matchedBy = 'wiki.parse';
      }
    }

    if (!sourceUrl) {
      summary.unresolved += 1;
      const reason = classifyUnresolvedReason({ row, standardizedItem, pageEntry });
      summary.unresolvedReasons[reason] = (summary.unresolvedReasons[reason] || 0) + 1;
      pushSample(summary, { id: row.id, internalName, name: row.name, reason, matchedBy: null, sourceUrl: null });
      summary.processed = (summary.processed || 0) + 1;
      processedInBatch += 1;
      if (apply && processedInBatch >= batchSize) {
        await conn.commit();
        await conn.beginTransaction();
        processedInBatch = 0;
      }
      persistSummary(output, summary);
      continue;
    }

    const upload = await uploadFromUrl(sourceUrl, internalName || row.name || `item-${row.id}`);
    if (!upload?.url) {
      summary.unresolved += 1;
      summary.unresolvedReasons.upload_failed = (summary.unresolvedReasons.upload_failed || 0) + 1;
      pushSample(summary, { id: row.id, internalName, name: row.name, reason: 'upload_failed', matchedBy, sourceUrl });
      summary.processed = (summary.processed || 0) + 1;
      processedInBatch += 1;
      if (apply && processedInBatch >= batchSize) {
        await conn.commit();
        await conn.beginTransaction();
        processedInBatch = 0;
      }
      persistSummary(output, summary);
      continue;
    }

    if (matchedBy === 'standardized.imageUrl') {
      summary.matchedStandardizedImage += 1;
    } else if (matchedBy === 'wiki.parse') {
      summary.matchedWikiPageImage += 1;
    }

    if (apply) {
      const [result] = await conn.execute(
        'UPDATE items SET image = ?, updated_at = NOW() WHERE id = ?',
        [upload.url, row.id],
      );
      summary.updated += Number(result.affectedRows || 0);
    } else {
      summary.updated += 1;
    }

    pushSample(summary, { id: row.id, internalName, name: row.name, reason: 'updated', matchedBy, sourceUrl: upload.url });
    summary.processed = (summary.processed || 0) + 1;
    processedInBatch += 1;
    if (apply && processedInBatch >= batchSize) {
      await conn.commit();
      await conn.beginTransaction();
      processedInBatch = 0;
    }
    persistSummary(output, summary);
  }

  if (apply) {
    await conn.commit();
  }

  persistSummary(output, summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  if (apply) {
    await conn.rollback();
  }
  persistSummary(output, {
    apply,
    apiBase,
    managedUrlPrefix,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  await conn.end();
}

function persistSummary(output, summary) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(summary, null, 2), 'utf8');
}

function matchesBatch(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return false;
  if (minId != null && numericId < minId) return false;
  if (maxId != null && numericId > maxId) return false;
  if (partitionCount > 0 && numericId % partitionCount !== partitionIndex) return false;
  return true;
}

function readRecords(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(raw.records) ? raw.records : [];
}

async function resolveWikiImageUrl({ pageTitle, itemName, internalName }) {
  const titleCandidates = [
    toText(itemName),
    toText(pageTitle),
    toDisplayNameFromInternalName(internalName),
  ].filter(Boolean);

  const directUrl = await resolveDirectImageUrl(titleCandidates);
  if (directUrl) return directUrl;

  const title = toText(pageTitle);
  if (!title) return null;

  const html = await fetchParsedHtml(title);
  if (!html) return null;

  const redirectTarget = parseRedirectTarget(html);
  const effectiveHtml = redirectTarget ? await fetchParsedHtml(redirectTarget) : html;
  if (!effectiveHtml) return null;

  const candidates = extractImageCandidates(effectiveHtml);
  if (!candidates.length) return null;

  const targetSlug = slug(itemName || internalName || title);
  const exact = candidates.find((candidate) => slug(candidate).includes(targetSlug));
  if (exact) return exact;

  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, itemName || internalName || title) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.candidate || null;
}

async function resolveDirectImageUrl(titles) {
  const baseNames = [...new Set(
    titles
      .flatMap((title) => buildDirectImageBaseNames(title))
      .filter(Boolean),
  )];

  for (const baseName of baseNames) {
    for (const extension of ['.png', '.gif', '.jpg', '.jpeg', '.webp']) {
      const fileName = `${baseName}${extension}`;
      const url = `https://terraria.wiki.gg/images/${encodeURIComponent(fileName)}`;
      if (await checkRemoteImageExists(url)) {
        return url;
      }
    }
  }

  return null;
}

function buildDirectImageBaseNames(title) {
  const text = toText(title);
  if (!text) return [];

  const normalized = text.replace(/\s+/g, ' ').trim();
  const results = new Set([
    normalized.replace(/ /g, '_'),
  ]);

  if (normalized.includes('&')) {
    results.add(normalized.replace(/&/g, 'and').replace(/ /g, '_'));
  }

  return [...results];
}

async function checkRemoteImageExists(url) {
  if (uploadCache.has(`exists:${url}`)) {
    return uploadCache.get(`exists:${url}`);
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': 'Mozilla/5.0 TerraPedia-items-image-backfill/1.0' },
    });
    const exists = response.ok && String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/');
    uploadCache.set(`exists:${url}`, exists);
    return exists;
  } catch {
    uploadCache.set(`exists:${url}`, false);
    return false;
  }
}

async function fetchParsedHtml(pageTitle) {
  const title = toText(pageTitle);
  if (!title) return null;
  if (pageHtmlCache.has(title)) return pageHtmlCache.get(title);

  const normalizedTitle = title.replace(/#/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_');
  const url = `https://terraria.wiki.gg/wiki/${encodeURIComponent(normalizedTitle)}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 TerraPedia-items-image-backfill/1.0' },
      });
      if (response.status === 429) {
        await sleep(Math.min(12000, attempt * 1500));
        continue;
      }
      if (!response.ok) {
        pageHtmlCache.set(title, null);
        return null;
      }
      const html = toText(await response.text());
      pageHtmlCache.set(title, html);
      return html;
    } catch {
      if (attempt === 5) {
        pageHtmlCache.set(title, null);
        return null;
      }
      await sleep(Math.min(12000, attempt * 1000));
    }
  }
  pageHtmlCache.set(title, null);
  return null;
}

function parseRedirectTarget(html) {
  const text = toText(html);
  if (!text) return null;
  const redirectBlock = text.match(/<div class="redirectMsg"[\s\S]*?<\/div>/i)?.[0];
  if (!redirectBlock) return null;
  const match = redirectBlock.match(/<li><a href="\/wiki\/([^"]+)"/i);
  return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : null;
}

function extractImageCandidates(html) {
  const text = toText(html);
  if (!text) return [];
  const ignored = ['desktop_only', 'console_only', 'mobile_only', 'stack_digit_', 'rarity_', 'journey_mode', 'map_icon'];
  const results = [];
  for (const match of text.matchAll(/<img[^>]+src="([^"]+)"/ig)) {
    const normalized = normalizeWikiAssetUrl(match[1]);
    if (!normalized) continue;
    const candidateSlug = slug(normalized);
    if (ignored.some((keyword) => candidateSlug.includes(keyword))) continue;
    results.push(normalized);
  }
  return [...new Set(results)];
}

function normalizeWikiAssetUrl(value) {
  const text = toText(value);
  if (!text) return null;
  if (text.startsWith('http://') || text.startsWith('https://')) return text;
  if (text.startsWith('//')) return `https:${text}`;
  if (text.startsWith('/')) return `https://terraria.wiki.gg${text}`;
  return null;
}

function scoreCandidate(candidate, itemName) {
  const candidateSlug = normalizeImageStem(candidate);
  const itemSlug = normalizeImageStem(itemName);
  if (!itemSlug) return 0;
  if (candidateSlug === itemSlug) return 1000;
  if (candidateSlug === `${itemSlug}placed`) return 950;
  if (candidateSlug === `${itemSlug}demo`) return 940;

  let score = 0;
  if (candidateSlug.includes(itemSlug)) score += 200;
  if (candidateSlug.startsWith(itemSlug)) score += 60;

  const tokens = itemSlug.match(/[a-z0-9]+/g) || [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (candidateSlug.includes(token)) score += 15;
  }

  if (/(placed|demo|old|icon|map|banner|render|gif)$/.test(candidateSlug)) score -= 25;
  if (/^(any|placed)/.test(candidateSlug)) score -= 40;
  return score;
}

function normalizeImageStem(value) {
  const text = toText(value);
  if (!text) return '';
  let stem = text;
  try {
    stem = new URL(text).pathname.split('/').pop() || text;
  } catch {
    stem = text.split('/').pop() || text;
  }
  stem = decodeURIComponent(stem)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
  return stem;
}

async function uploadFromUrl(sourceUrl, nameHint) {
  if (uploadCache.has(sourceUrl)) {
    return uploadCache.get(sourceUrl);
  }

  let upstream;
  try {
    upstream = await fetch(sourceUrl, {
      headers: { 'user-agent': 'TerraPedia-items-image-backfill/1.0' },
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

  try {
    const response = await fetch(`${apiBase}/files/images`, {
      method: 'POST',
      headers: authHeader,
      body: formData,
    });
    if (!response.ok) {
      uploadCache.set(sourceUrl, null);
      return null;
    }
    const payload = await response.json();
    const result = payload?.data?.url ? { url: String(payload.data.url) } : null;
    uploadCache.set(sourceUrl, result);
    return result;
  } catch {
    uploadCache.set(sourceUrl, null);
    return null;
  }
}

async function loginAndBuildAuthHeader() {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
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

function classifyUnresolvedReason({ row, standardizedItem, pageEntry }) {
  if (!standardizedItem) return 'not_found_in_standardized_items';
  if (!pageEntry) return 'missing_item_page_metadata';
  if (toText(row.name)?.startsWith('[[|]]')) return 'placeholder_item_name';
  return 'no_image_url_in_standardized_or_wiki_match';
}

function buildFileName(sourceUrl, nameHint, contentType) {
  const pathname = new URL(sourceUrl).pathname;
  const rawName = pathname.split('/').pop() || `${slug(nameHint)}${guessExtension(contentType)}`;
  if (rawName.includes('.')) return rawName;
  return `${rawName}${guessExtension(contentType)}`;
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

function slug(value) {
  const text = toText(value) || 'asset';
  return text
    .toLowerCase()
    .replace(/\[\[\|\]\]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function pushSample(summary, sample) {
  if (summary.samples.length < 60) {
    summary.samples.push(sample);
  }
}

function toDisplayNameFromInternalName(value) {
  const text = toText(value);
  if (!text) return null;
  return text
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
