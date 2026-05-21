#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../lib/project-root.mjs';
import { sharedDataPath } from '../lib/wiki-item-utils.mjs';

const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets';
const DEFAULT_INPUT = sharedDataPath('raw', 'wiki', 'armor_set_images.parsed.latest.json');
const DEFAULT_WIKI_ARMOR_SETS_INPUT = path.join(getProjectRoot(), 'data', 'generated', 'wiki-armor-sets.latest.json');
const DEFAULT_MINIO_ROOT = '/home/lolben/.local/share/terrapedia/minio/data/terrapedia-images/items/wiki/armor-sets';

export function normalizeArmorImageKey(value) {
  return String(value ?? '')
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-png$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeArmorImageRole(value) {
  const text = normalizeArmorImageKey(value);
  if (text === 'special') return 'demo';
  if (['male', 'female', 'demo', 'part', 'other'].includes(text)) return text;
  return text || null;
}

function isManagedArmorSetUrl(value) {
  return String(value ?? '').trim().startsWith(DEFAULT_PUBLIC_BASE_URL);
}

function toText(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeWikiImageFileTitle(value) {
  const text = toText(value);
  return text
    ? text.replace(/^File:/i, '').replace(/ /g, '_')
    : null;
}

function normalizeOriginalUrlKey(value) {
  const text = toText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    url.search = '';
    url.hash = '';
    return url.toString().toLowerCase();
  } catch {
    return text.replace(/[?#].*$/, '').toLowerCase();
  }
}

function wikiArmorSetTextKey(pageTitle) {
  const text = toText(pageTitle);
  return text ? `WikiArmorSet.${text}` : null;
}

function stripObjectHash(fileName) {
  return String(fileName ?? '').replace(/^(?:hash|[a-f0-9]{8,64})-/i, '');
}

function derivePageRoleKeyFromFileName(fileName) {
  const key = normalizeArmorImageKey(stripObjectHash(fileName));
  if (!key) return null;
  for (const suffix of [' female', ' demo', ' special', ' male']) {
    if (key.endsWith(suffix)) {
      const role = suffix.trim() === 'special' ? 'demo' : suffix.trim();
      return `${key.slice(0, -suffix.length)} armor|${role}`;
    }
  }
  return `${key}|male`;
}

export function buildArmorSetManagedImageIndex({ managedUrls = [] } = {}) {
  const byFileTitle = new Map();
  const byPageRole = new Map();
  for (const url of managedUrls) {
    const text = String(url ?? '').trim();
    if (!text) continue;
    const fileName = decodeURIComponent(text.split('/').pop() ?? '');
    const withoutHash = stripObjectHash(fileName);
    const key = normalizeArmorImageKey(withoutHash);
    if (key && !byFileTitle.has(key)) {
      byFileTitle.set(key, text);
    }
    const pageRoleKey = derivePageRoleKeyFromFileName(fileName);
    if (pageRoleKey && !byPageRole.has(pageRoleKey)) {
      byPageRole.set(pageRoleKey, text);
    }
  }
  return { byFileTitle, byPageRole };
}

export function applyManagedArmorSetImageUrls(payload, index) {
  const rows = Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [];
  const unmatched = [];
  let updated = 0;
  for (const row of rows) {
    const existing = String(row.cachedUrl ?? '').trim();
    if (isManagedArmorSetUrl(existing)) continue;
    const fileKey = normalizeArmorImageKey(row.sourceFileTitle);
    const pageRoleKey = `${normalizeArmorImageKey(row.pageTitle)}|${normalizeArmorImageRole(row.imageRole)}`;
    const managedUrl = index.byFileTitle.get(fileKey)
      ?? index.byPageRole?.get(pageRoleKey)
      ?? null;
    if (managedUrl) {
      row.cachedUrl = managedUrl;
      updated += 1;
    } else {
      unmatched.push({
        pageTitle: row.pageTitle ?? null,
        imageRole: row.imageRole ?? null,
        sourceFileTitle: row.sourceFileTitle ?? null
      });
    }
  }
  return { total: rows.length, updated, unmatched };
}

export function mergeWikiArmorSetSourceImages(payload, wikiArmorSets = [], index = buildArmorSetManagedImageIndex()) {
  const rows = Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [];
  const existingKeys = new Set();
  const existingUrlKeys = new Set();
  for (const row of rows) {
    const key = [
      normalizeArmorImageKey(row.pageTitle),
      normalizeArmorImageRole(row.imageRole),
      normalizeArmorImageKey(row.sourceFileTitle)
    ].join('|');
    existingKeys.add(key);
    const originalUrlKey = normalizeOriginalUrlKey(row.originalUrl);
    if (originalUrlKey) {
      existingUrlKeys.add(originalUrlKey);
    }
  }

  let added = 0;
  let existing = 0;
  let skipped = 0;
  const unmatched = [];
  for (const armorSet of Array.isArray(wikiArmorSets) ? wikiArmorSets : []) {
    const pageTitle = toText(armorSet?.pageTitle);
    const images = Array.isArray(armorSet?.images) ? armorSet.images : [];
    if (!pageTitle || images.length === 0) {
      continue;
    }
    for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      const image = images[imageIndex];
      const role = normalizeArmorImageRole(image?.role);
      if (!['male', 'female', 'demo'].includes(role)) {
        skipped += 1;
        continue;
      }
      const sourceFileTitle = normalizeWikiImageFileTitle(image?.fileTitle);
      const rowKey = [
        normalizeArmorImageKey(pageTitle),
        role,
        normalizeArmorImageKey(sourceFileTitle)
      ].join('|');
      const originalUrl = toText(image?.url);
      const originalUrlKey = normalizeOriginalUrlKey(originalUrl);
      if (existingKeys.has(rowKey) || (originalUrlKey && existingUrlKeys.has(originalUrlKey))) {
        existing += 1;
        continue;
      }
      const fileKey = normalizeArmorImageKey(sourceFileTitle);
      const pageRoleKey = `${normalizeArmorImageKey(pageTitle)}|${role}`;
      const managedUrl = index.byFileTitle?.get(fileKey)
        ?? index.byPageRole?.get(pageRoleKey)
        ?? null;
      if (!managedUrl) {
        unmatched.push({
          pageTitle,
          imageRole: role,
          sourceFileTitle
        });
      }
      rows.push({
        textKey: wikiArmorSetTextKey(pageTitle),
        pageTitle,
        imageRole: role,
        sourceFileTitle,
        originalUrl,
        cachedUrl: managedUrl,
        width: toPositiveNumber(image?.width),
        height: toPositiveNumber(image?.height),
        contentType: toText(image?.contentType),
        isPrimary: role === 'male' && !rows.some((row) => row.textKey === wikiArmorSetTextKey(pageTitle) && normalizeArmorImageRole(row.imageRole) === 'male'),
        sortOrder: rows.length,
        sourceRevisionTimestamp: armorSet?.sourceRevisionTimestamp ?? null,
        raw: { source: 'wiki-armor-sets', image }
      });
      existingKeys.add(rowKey);
      if (originalUrlKey) {
        existingUrlKeys.add(originalUrlKey);
      }
      added += 1;
    }
  }
  return { added, existing, skipped, unmatched };
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
    input: raw.input ?? DEFAULT_INPUT,
    minioRoot: raw['minio-root'] ?? raw.minioRoot ?? DEFAULT_MINIO_ROOT,
    publicBaseUrl: raw['public-base-url'] ?? raw.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL,
    wikiArmorSetsInput: raw['wiki-armor-sets-input'] ?? raw.wikiArmorSetsInput ?? DEFAULT_WIKI_ARMOR_SETS_INPUT
  };
}

function resolveWikiArmorSetsInputPath(inputPath) {
  if (!inputPath) {
    return null;
  }
  const resolved = path.resolve(process.cwd(), inputPath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }
  const dirname = path.dirname(resolved);
  const basename = path.basename(resolved);
  if (basename !== 'wiki-armor-sets.latest.json' || !fs.existsSync(dirname)) {
    return null;
  }
  const snapshots = fs.readdirSync(dirname)
    .filter((entry) => /^wiki-armor-sets\.\d{4}-\d{2}-\d{2}T.+\.json$/.test(entry))
    .sort((left, right) => right.localeCompare(left));
  return snapshots.length > 0 ? path.join(dirname, snapshots[0]) : null;
}

function readWikiArmorSets(inputPath) {
  const resolved = resolveWikiArmorSetsInputPath(inputPath);
  if (!resolved) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.armorSets)) return payload.armorSets;
  if (Array.isArray(payload)) return payload;
  return [];
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const pending = [rootDir];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files.sort();
}

export function listManagedArmorSetUrls(minioRoot, publicBaseUrl = DEFAULT_PUBLIC_BASE_URL) {
  const resolvedRoot = path.resolve(process.cwd(), minioRoot);
  return walkFiles(resolvedRoot).map((filePath) => {
    const objectPath = path.basename(filePath) === 'xl.meta' ? path.dirname(filePath) : filePath;
    const relativePath = path.relative(resolvedRoot, objectPath).split(path.sep).map(encodeURIComponent).join('/');
    return `${publicBaseUrl.replace(/\/+$/, '')}/${relativePath}`;
  }).filter((url, index, urls) => urls.indexOf(url) === index);
}

export function runArmorSetManagedImageIndex(options = {}) {
  const inputPath = path.resolve(process.cwd(), options.input ?? DEFAULT_INPUT);
  const minioRoot = options.minioRoot ?? DEFAULT_MINIO_ROOT;
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const managedUrls = listManagedArmorSetUrls(minioRoot, options.publicBaseUrl);
  const index = buildArmorSetManagedImageIndex({ managedUrls });
  const wikiArmorSets = readWikiArmorSets(options.wikiArmorSetsInput);
  const mergeResult = mergeWikiArmorSetSourceImages(payload, wikiArmorSets, index);
  const result = applyManagedArmorSetImageUrls(payload, index);
  const summary = {
    input: inputPath,
    minioRoot: path.resolve(process.cwd(), minioRoot),
    managedUrls: managedUrls.length,
    wikiArmorSets: wikiArmorSets.length,
    sourceMerge: mergeResult,
    total: result.total,
    updated: result.updated,
    unmatched: result.unmatched,
    apply: Boolean(options.apply),
    wrote: false
  };
  if (options.apply) {
    fs.writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`);
    summary.wrote = true;
  }
  return summary;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const summary = runArmorSetManagedImageIndex(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  }
}
