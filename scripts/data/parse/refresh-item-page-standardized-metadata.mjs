#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const DEFAULT_RAW_DIR = '/home/lolben/data/terraPedia/raw/wiki/item-pages';
const DEFAULT_OUTPUT = 'data/standardized/item_pages.standardized.json';
const DEFAULT_VIEW_DIR = 'data/standardized-view/item_pages';
const DEFAULT_PART_SIZE = 250;

export async function buildItemPageMetadataPayload({
  rawDir = DEFAULT_RAW_DIR,
  sourceDataDir = '/home/lolben/data/terraPedia',
  now = new Date().toISOString()
} = {}) {
  const files = (await fs.promises.readdir(rawDir))
    .filter((name) => name.endsWith('.latest.json'))
    .sort((left, right) => left.localeCompare(right));
  const records = [];

  for (const fileName of files) {
    const fullPath = path.join(rawDir, fileName);
    const payload = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
    records.push(deepSortObject({
      itemInternalName: nullableString(payload.itemInternalName),
      itemName: nullableString(payload.itemName),
      pageTitle: nullableString(payload.pageTitle),
      requestedPageTitle: nullableString(payload.requestedPageTitle),
      pageId: toFiniteNumber(payload.pageId),
      revisionTimestamp: nullableString(payload.revisionTimestamp),
      fetchedAt: nullableString(payload.fetchedAt),
      sourceApi: nullableString(payload.apiUrl),
      entityType: nullableString(payload.entityType),
      hasWikitext: typeof payload.wikitext === 'string',
      hasHtml: typeof payload.html === 'string',
      hasRecipesMarkup: typeof payload.recipesMarkup === 'string',
      wikitextLength: typeof payload.wikitext === 'string' ? payload.wikitext.length : 0,
      htmlLength: typeof payload.html === 'string' ? payload.html.length : 0,
      recipesMarkupLength: typeof payload.recipesMarkup === 'string' ? payload.recipesMarkup.length : 0,
      sourceFile: relativeFromWorkspace(fullPath)
    }));
  }

  return deepSortObject({
    schemaVersion: '1.0.0',
    entity: 'item_pages',
    generatedAt: now,
    sourceDataDir,
    sourceDirectory: relativeFromWorkspace(rawDir),
    totalRecords: records.length,
    records
  });
}

export async function runItemPageMetadataRefresh(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const payload = await buildItemPageMetadataPayload({
    rawDir: options.rawDir,
    sourceDataDir: options.sourceDataDir
  });
  writeJson(options.output, payload);
  const partCount = writeViewParts(options.viewDir, payload.records, options.partSize);
  return {
    output: options.output,
    viewDir: options.viewDir,
    totalRecords: payload.totalRecords,
    partCount
  };
}

function writeViewParts(viewDir, records, partSize) {
  fs.rmSync(viewDir, { recursive: true, force: true });
  fs.mkdirSync(viewDir, { recursive: true });
  let partCount = 0;
  for (let offset = 0; offset < records.length; offset += partSize) {
    partCount += 1;
    const partPath = path.join(viewDir, `part-${String(partCount).padStart(4, '0')}.json`);
    writeJson(partPath, {
      entity: 'item_pages',
      part: partCount,
      offset,
      count: records.slice(offset, offset + partSize).length,
      records: records.slice(offset, offset + partSize)
    });
  }
  writeJson(path.join(viewDir, '_meta.json'), {
    entity: 'item_pages',
    totalRecords: records.length,
    partCount,
    partSize
  });
  return partCount;
}

function normalizeOptions(rawOptions = {}) {
  return {
    rawDir: path.resolve(rawOptions.rawDir ?? rawOptions['raw-dir'] ?? DEFAULT_RAW_DIR),
    output: path.resolve(rawOptions.output ?? DEFAULT_OUTPUT),
    viewDir: path.resolve(rawOptions.viewDir ?? rawOptions['view-dir'] ?? DEFAULT_VIEW_DIR),
    partSize: Math.max(1, Number(rawOptions.partSize ?? rawOptions['part-size'] ?? DEFAULT_PART_SIZE)),
    sourceDataDir: path.resolve(rawOptions.sourceDataDir ?? rawOptions['source-data-dir'] ?? '/home/lolben/data/terraPedia')
  };
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

function nullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function deepSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortObject(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, deepSortObject(value[key])])
  );
}

function relativeFromWorkspace(targetPath) {
  return path.relative(path.dirname(getProjectRoot()), path.resolve(targetPath)).replaceAll('\\', '/');
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runItemPageMetadataRefresh(parseArgs(process.argv.slice(2))).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
