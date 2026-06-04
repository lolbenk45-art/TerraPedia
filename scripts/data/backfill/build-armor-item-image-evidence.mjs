#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWikiImageInfo } from '../lib/wiki-item-utils.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const ACTION_ID = 'armor-item-images';
const DEFAULT_PROGRESS_PATH = 'data/generated/wiki-sync-progress.latest.json';
const DEFAULT_RAW_ITEM_PAGES_DIR = '/home/lolben/data/terraPedia/raw/wiki/item-pages';

const CATEGORY_ROLE_BY_CODE = new Map([
  ['HELMET', 'head'],
  ['HEAD', 'head'],
  ['HAT', 'head'],
  ['MASK', 'head'],
  ['CHESTPLATE', 'body'],
  ['BREASTPLATE', 'body'],
  ['SHIRT', 'body'],
  ['ROBE', 'body'],
  ['LEGGINGS', 'legs'],
  ['GREAVES', 'legs'],
  ['PANTS', 'legs'],
  ['BOOTS', 'legs']
]);

export function buildArmorItemImageProgressPayload({
  status,
  current,
  total,
  phase = 'evidence',
  message,
  progressPath = DEFAULT_PROGRESS_PATH,
  outputPath = null,
  overallCurrent = null,
  overallTotal = null,
  startedAt,
  now = new Date().toISOString()
} = {}) {
  const generatedAt = typeof now === 'string' ? now : now.toISOString();
  const payload = {
    actionId: process.env.TERRAPEDIA_CRAWLER_ACTION_ID || ACTION_ID,
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
    phase,
    message,
    current,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, current / total * 100)) : 0,
    startedAt
  };
  if (overallCurrent != null) payload.overallCurrent = overallCurrent;
  if (overallTotal != null) payload.overallTotal = overallTotal;
  if (outputPath) payload.outputPath = outputPath;
  return payload;
}

export function classifyArmorItem(item = {}) {
  const categoryCode = toText(item.categoryCode ?? item.category_code);
  const byCategory = categoryCode ? CATEGORY_ROLE_BY_CODE.get(categoryCode.toUpperCase()) : null;
  if (byCategory) return byCategory;

  const name = toText(item.internalName ?? item.internal_name ?? item.name);
  if (!name) return null;
  if (/(Helmet|Hat|Hood|Mask|Headgear)$/i.test(name)) return 'head';
  if (/(Breastplate|Chestplate|Chainmail|Scalemail|Shirt|Robe|Dress|Jacket|Coat|Suit|Gown)$/i.test(name)) return 'body';
  if (/(Greaves|Leggings|Pants|Boots|Shoes|Skirt)$/i.test(name)) return 'legs';
  return null;
}

export function extractImageCandidatesFromItemPage(page = {}) {
  const itemName = toText(page.itemName ?? page.name ?? page.requestedPageTitle);
  const pageTitle = toText(page.pageTitle ?? page.requestedPageTitle);
  const wanted = normalizeComparable(itemName);
  if (!wanted) return [];

  const fileTitles = new Set();
  const html = String(page.html ?? '');
  const wikitext = String(page.wikitext ?? '');

  for (const match of html.matchAll(/<img\b[^>]*\balt=["']([^"']+\.(?:png|gif|jpg|jpeg|webp))["'][^>]*>/gi)) {
    fileTitles.add(cleanFileTitle(match[1]));
  }
  for (const match of wikitext.matchAll(/\[\[\s*(?:File|Image):([^|\]]+\.(?:png|gif|jpg|jpeg|webp))/gi)) {
    fileTitles.add(cleanFileTitle(match[1]));
  }

  const candidates = [...fileTitles]
    .filter((fileTitle) => isUsableItemImageTitle(fileTitle))
    .map((fileTitle) => ({
      fileTitle,
      score: scoreFileTitle(fileTitle, { itemName, pageTitle, wanted }),
      sourceUrl: buildWikiImageUrl(fileTitle)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.fileTitle.localeCompare(right.fileTitle));

  return candidates.slice(0, 5);
}

export function buildArmorItemImageEvidence({
  items = [],
  itemPagesByInternalName = new Map(),
  now = new Date().toISOString()
} = {}) {
  const candidates = [];
  const unresolved = [];
  let armorItemCount = 0;

  for (const item of items) {
    const role = classifyArmorItem(item);
    if (!role) continue;
    armorItemCount += 1;
    const internalName = toText(item.internalName ?? item.internal_name);
    const itemName = toText(item.name ?? item.nameEn ?? item.internalName);
    const existingImageUrl = toText(item.imageUrl ?? item.image ?? item.image_url);
    if (existingImageUrl) {
      continue;
    }
    const page = internalName ? itemPagesByInternalName.get(internalName) : null;
    const imageCandidates = extractImageCandidatesFromItemPage({
      ...page,
      itemName: page?.itemName ?? itemName,
      requestedPageTitle: page?.requestedPageTitle ?? itemName
    });
    const best = imageCandidates[0] ?? null;
    if (best) {
      candidates.push({
        id: toNumber(item.id ?? item.sourceId),
        internalName,
        name: itemName,
        role,
        pageTitle: toText(page?.pageTitle ?? page?.requestedPageTitle),
        requestedPageTitle: toText(page?.requestedPageTitle),
        imageFileTitle: best.fileTitle,
        sourceUrl: best.sourceUrl,
        score: best.score,
        alternates: imageCandidates.slice(1)
      });
    } else {
      unresolved.push({
        id: toNumber(item.id ?? item.sourceId),
        internalName,
        name: itemName,
        role,
        pageTitle: toText(page?.pageTitle ?? page?.requestedPageTitle),
        requestedPageTitle: toText(page?.requestedPageTitle),
        reason: page ? 'no_matching_item_image_in_page' : 'missing_item_page'
      });
    }
  }

  return {
    generatedAt: now,
    source: {
      items: 'data/standardized/items.standardized.json',
      rawItemPages: DEFAULT_RAW_ITEM_PAGES_DIR
    },
    summary: {
      totalItems: items.length,
      armorItemCount,
      candidateCount: candidates.length,
      unresolvedCount: unresolved.length
    },
    candidates,
    unresolved
  };
}

export async function probeDirectArmorItemImageCandidates({
  unresolved = [],
  fetchImageInfo = fetchWikiImageInfo,
  onProgress = null
} = {}) {
  const candidates = [];
  const stillUnresolved = [];

  for (let index = 0; index < unresolved.length; index += 1) {
    const row = unresolved[index];
    const fileTitle = `${row.name}.png`;
    const imageInfo = await fetchImageInfo({ fileTitle });
    if (imageInfo?.url) {
      candidates.push({
        id: row.id ?? null,
        internalName: row.internalName ?? null,
        name: row.name ?? null,
        role: row.role ?? null,
        pageTitle: row.pageTitle ?? null,
        requestedPageTitle: row.requestedPageTitle ?? null,
        imageFileTitle: cleanFileTitle(imageInfo.fileTitle ?? fileTitle),
        sourceUrl: imageInfo.url,
        sourceKind: 'direct_file_probe',
        width: toNumber(imageInfo.width),
        height: toNumber(imageInfo.height),
        contentType: toText(imageInfo.mime),
        raw: {
          imageInfo
        }
      });
    } else {
      stillUnresolved.push({
        ...row,
        reason: 'direct_file_probe_missing'
      });
    }
    if (typeof onProgress === 'function') {
      onProgress(index + 1, unresolved.length);
    }
  }

  return {
    candidates,
    unresolved: stillUnresolved
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const progressPath = String(options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH);
  const startedAt = new Date().toISOString();
  const itemsPath = path.resolve(process.cwd(), options.items ?? 'data/standardized/items.standardized.json');
  const rawItemPagesDir = path.resolve(process.cwd(), options['raw-item-pages-dir'] ?? DEFAULT_RAW_ITEM_PAGES_DIR);
  const outputPath = path.resolve(process.cwd(), options.output ?? path.join('reports', `armor-item-image-evidence-${new Date().toISOString().slice(0, 10)}.json`));
  const probeDirect = booleanOption(options['probe-direct'] ?? options.probeDirect, false);

  writeProgress(progressPath, buildArmorItemImageProgressPayload({
    status: 'running',
    current: 0,
    total: 1,
    message: 'loading armor item image evidence inputs',
    progressPath,
    outputPath,
    startedAt
  }));

  const items = readRecords(itemsPath);
  const itemPagesByInternalName = readRawItemPagesByInternalName(rawItemPagesDir);
  const armorTotal = items.filter((item) => classifyArmorItem(item)).length;
  writeProgress(progressPath, buildArmorItemImageProgressPayload({
    status: 'running',
    current: 0,
    total: armorTotal,
    message: `building armor item image evidence 0/${armorTotal}`,
    progressPath,
    outputPath,
    startedAt
  }));

  const evidence = buildArmorItemImageEvidence({
    items,
    itemPagesByInternalName,
    now: new Date().toISOString()
  });
  if (probeDirect && evidence.unresolved.length > 0) {
    const baseCandidateCount = evidence.candidates.length;
    const baseTotal = evidence.summary.armorItemCount + evidence.unresolved.length;
    const probeResult = await probeDirectArmorItemImageCandidates({
      unresolved: evidence.unresolved,
      onProgress: (current, total) => {
        writeProgress(progressPath, buildArmorItemImageProgressPayload({
          status: 'running',
          current,
          total,
          phase: 'direct_file_probe',
          message: `probing direct armor item images ${current}/${total}`,
          progressPath,
          outputPath,
          overallCurrent: evidence.summary.armorItemCount + current,
          overallTotal: baseTotal,
          startedAt
        }));
      }
    });
    evidence.candidates.push(...probeResult.candidates);
    evidence.unresolved = probeResult.unresolved;
    evidence.summary.directProbeCandidateCount = probeResult.candidates.length;
    evidence.summary.pageImageCandidateCount = baseCandidateCount;
    evidence.summary.candidateCount = evidence.candidates.length;
    evidence.summary.unresolvedCount = evidence.unresolved.length;
  }
  evidence.source.items = itemsPath;
  evidence.source.rawItemPages = rawItemPagesDir;
  evidence.source.probeDirect = probeDirect;

  writeJsonFile(outputPath, evidence);
  writeProgress(progressPath, buildArmorItemImageProgressPayload({
    status: 'completed',
    current: evidence.summary.armorItemCount,
    total: evidence.summary.armorItemCount,
    message: `finished armor item image evidence; candidates=${evidence.summary.candidateCount}; unresolved=${evidence.summary.unresolvedCount}`,
    progressPath,
    outputPath,
    startedAt
  }));

  console.log(JSON.stringify(evidence.summary, null, 2));
  console.log(`Output: ${outputPath}`);
}

function readRecords(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload)) return payload;
  return [];
}

function readRawItemPagesByInternalName(rawDir) {
  const result = new Map();
  if (!fs.existsSync(rawDir)) return result;
  for (const entry of fs.readdirSync(rawDir)) {
    if (!entry.endsWith('.latest.json')) continue;
    const filePath = path.join(rawDir, entry);
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const internalName = toText(payload.itemInternalName ?? payload.internalName);
      if (internalName && !result.has(internalName)) result.set(internalName, payload);
    } catch {
      // Ignore malformed rerunnable raw snapshots.
    }
  }
  return result;
}

function buildWikiImageUrl(fileTitle) {
  return `https://terraria.wiki.gg/images/${encodeURIComponent(cleanFileTitle(fileTitle).replace(/ /g, '_'))}`;
}

function cleanFileTitle(value) {
  return decodeHtmlEntities(String(value ?? '').trim().replace(/^File:/i, '').replace(/^Image:/i, ''));
}

function isUsableItemImageTitle(fileTitle) {
  const text = cleanFileTitle(fileTitle).toLowerCase();
  if (!text) return false;
  if (!/\.png$/i.test(text)) return false;
  return !/(^|[\s_(-])(demo|placed|old|legacy|console|mobile|3ds|animation|pre|equipped|female)([\s_).,-]|$)/i.test(text);
}

function scoreFileTitle(fileTitle, { itemName, pageTitle, wanted }) {
  const stem = normalizeComparable(cleanFileTitle(fileTitle).replace(/\.[a-z0-9]+$/i, ''));
  const itemComparable = wanted;
  if (!stem) return 0;
  if (stem === itemComparable) return 100;
  if (/[\s_(-](?:\d+(?:\.\d+)*|pre[-\s]?\d)/i.test(cleanFileTitle(fileTitle))) return 0;
  if (stem.replace(/set/g, '') === itemComparable) return 70;
  return 0;
}

function normalizeComparable(value) {
  return String(value ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}

function writeProgress(progressPath, payload) {
  writeJsonFile(path.resolve(process.cwd(), progressPath), payload);
}

if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  await main();
}
