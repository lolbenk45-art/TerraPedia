#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedDataPath } from '../lib/wiki-item-utils.mjs';

const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:9000/terrapedia-images/items/wiki/armor-sets';
const DEFAULT_INPUT = sharedDataPath('raw', 'wiki', 'armor_set_images.parsed.latest.json');
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
    publicBaseUrl: raw['public-base-url'] ?? raw.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL
  };
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
  const result = applyManagedArmorSetImageUrls(payload, index);
  const summary = {
    input: inputPath,
    minioRoot: path.resolve(process.cwd(), minioRoot),
    managedUrls: managedUrls.length,
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
