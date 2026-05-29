#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferCategoryFromStandardizedRecord,
  loadMountAllowlist,
  STANDARDIZED_INFERENCE_MODE,
} from '../lib/item-category-inference.mjs';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_RAW_ITEM_PAGES_DIR = path.resolve(process.cwd(), 'data', 'raw', 'wiki', 'item-pages');
const DEFAULT_STANDARDIZED_PATH = path.resolve(process.cwd(), 'data', 'standardized', 'items.standardized.json');
const DEFAULT_ITEM_PAGES_METADATA_PATH = path.resolve(process.cwd(), 'data', 'standardized', 'item_pages.standardized.json');
const DEFAULT_VERIFIED_INTERNAL_NAMES = [
  'DrillContainmentUnit',
  'SlimySaddle',
  'FuzzyCarrot',
  'CosmicCarKey',
  'WitchBroom',
  'RatMountItem',
];
const MATERIAL_ROOT_CODES = new Set([
  'MATERIAL',
  'MATERIAL_ORE',
  'MATERIAL_BAR',
  'MATERIAL_GEM',
  'MATERIAL_SEED',
  'MATERIAL_POTION_INGREDIENT',
  'MATERIAL_BLOCK',
  'MATERIAL_BRICK',
  'MATERIAL_WALL',
  'MATERIAL_MISC',
  'MATERIAL_CURRENCY',
  'MATERIAL_KEY',
]);

export function auditItemCategoryTaxonomy({
  fallbackMode = 'none',
  standardizedRecords,
  itemPagesMetadataByInternal,
  mountAllowlist,
  rawPagesByInternal,
  rawPagesDir,
  classifier,
  verifiedInternalNames = DEFAULT_VERIFIED_INTERNAL_NAMES,
} = {}) {
  const blockers = [];
  const useStandardizedInference = fallbackMode === STANDARDIZED_INFERENCE_MODE;
  const sourceMode = useStandardizedInference ? STANDARDIZED_INFERENCE_MODE : 'raw_wiki';
  const records = normalizeRecords(standardizedRecords);
  let rawPages = rawPagesByInternal instanceof Map ? rawPagesByInternal : null;
  const itemPagesMetadata = itemPagesMetadataByInternal instanceof Map
    ? itemPagesMetadataByInternal
    : null;
  const allowlist = mountAllowlist instanceof Set ? mountAllowlist : new Set();

  if (useStandardizedInference && !itemPagesMetadata) {
    blockers.push({ reason: 'standardized_item_page_metadata_missing' });
  }

  if (!rawPages && !useStandardizedInference) {
    if (!rawPagesDir || !fs.existsSync(rawPagesDir)) {
      blockers.push({ reason: 'raw_item_pages_missing' });
    } else {
      rawPages = loadRawPages(rawPagesDir);
    }
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      sourceMode,
      blockers,
      summary: {
        standardizedRecords: records.length,
        rawPages: 0,
        classified: 0,
        changedFromStandardized: 0,
      },
      distribution: {},
      verifiedSamples: [],
      suspiciousMaterials: [],
    };
  }

  const classify = classifier || defaultClassifier;
  const distribution = {};
  const verifiedSet = new Set(verifiedInternalNames);
  const verifiedSamples = [];
  const suspiciousMaterials = [];
  let classified = 0;
  let changedFromStandardized = 0;

  for (const record of records) {
    const internalName = getInternalName(record);
    if (!internalName) continue;
    const wiki = rawPages?.get(internalName) || null;
    const itemPage = itemPagesMetadata?.get(internalName) || null;
    if (!useStandardizedInference && !wiki) continue;

    const result = useStandardizedInference
      ? inferCategoryFromStandardizedRecord({
        item: record,
        itemPage,
        mountAllowlist: allowlist,
      }) || {}
      : classify({
        item: toClassifierItem(record),
        wiki,
        standardizedRecord: record,
      }) || {};
    const expectedCategoryCode = toCode(result.categoryCode);
    if (!expectedCategoryCode) continue;

    classified += 1;
    distribution[expectedCategoryCode] = (distribution[expectedCategoryCode] || 0) + 1;

    const currentCategoryCode = toCode(record.categoryCode ?? record.category_code);
    if (currentCategoryCode !== expectedCategoryCode) {
      changedFromStandardized += 1;
    }

    const sample = {
      internalName,
      expectedCategoryCode,
      currentCategoryCode,
      reason: text(result.reason) || null,
    };
    if (useStandardizedInference) {
      sample.source = text(result.source) || STANDARDIZED_INFERENCE_MODE;
      sample.confidence = text(result.confidence) || null;
    }
    if (verifiedSet.has(internalName)) {
      verifiedSamples.push(sample);
    }

    if (isMaterialCode(currentCategoryCode) && !isMaterialCode(expectedCategoryCode)) {
      suspiciousMaterials.push({
        internalName,
        name: text(record.name ?? record.nameEn ?? record.name_en) || null,
        currentCategoryCode,
        expectedCategoryCode,
        reason: sample.reason,
      });
    }
  }

  const hasSuspiciousMaterials = suspiciousMaterials.length > 0;
  const hasVerifiedMismatch = verifiedSamples.some(
    (sample) => sample.currentCategoryCode !== sample.expectedCategoryCode,
  );

  return {
    status: hasSuspiciousMaterials || hasVerifiedMismatch ? 'warning' : 'pass',
    sourceMode,
    blockers,
    summary: {
      standardizedRecords: records.length,
      rawPages: rawPages?.size || 0,
      classified,
      changedFromStandardized,
    },
    distribution,
    verifiedSamples,
    suspiciousMaterials,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = true;
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const standardizedPath = path.resolve(process.cwd(), args.standardized || DEFAULT_STANDARDIZED_PATH);
  const rawPagesDir = path.resolve(process.cwd(), args.rawItemPagesDir || DEFAULT_RAW_ITEM_PAGES_DIR);
  const itemPagesMetadataPath = path.resolve(process.cwd(), args.itemPagesMetadata || DEFAULT_ITEM_PAGES_METADATA_PATH);
  const standardizedRecords = fs.existsSync(standardizedPath)
    ? normalizeRecords(JSON.parse(fs.readFileSync(standardizedPath, 'utf8')))
    : [];
  const fallbackMode = args.fallbackMode || 'none';
  const useStandardizedInference = fallbackMode === STANDARDIZED_INFERENCE_MODE;
  const itemPagesMetadataByInternal = useStandardizedInference && fs.existsSync(itemPagesMetadataPath)
    ? buildItemPagesMetadataIndex(JSON.parse(fs.readFileSync(itemPagesMetadataPath, 'utf8')))
    : undefined;
  const classifier = await loadProjectClassifier();

  const audit = auditItemCategoryTaxonomy({
    fallbackMode,
    standardizedRecords,
    itemPagesMetadataByInternal,
    mountAllowlist: useStandardizedInference ? loadMountAllowlist({ repoRoot: process.cwd() }) : undefined,
    rawPagesDir,
    classifier,
  });

  if ((args.format || 'text') === 'json') {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  console.log(`status=${audit.status}`);
  console.log(JSON.stringify(audit.summary, null, 2));
}

async function loadProjectClassifier() {
  try {
    const module = await import('../sync/sync-item-categories-from-wiki-pages.mjs');
    if (typeof module.classifyItem === 'function') {
      return module.classifyItem;
    }
  } catch {
    return defaultClassifier;
  }
  return defaultClassifier;
}

function defaultClassifier({ item, wiki }) {
  const wikitext = String(wiki?.wikitext || '').toLowerCase();
  const itemName = String(item?.name || '').toLowerCase();
  const internalName = String(item?.internal_name || item?.internalName || '').toLowerCase();

  if (/\|\s*type\s*=\s*mount summon\b/i.test(String(wiki?.wikitext || ''))) {
    return { categoryCode: 'MOUNT', reason: 'type:mount summon' };
  }
  if (wikitext.includes('mount-summoning') || itemName.includes('mount') || internalName.includes('mount')) {
    return { categoryCode: 'MOUNT', reason: 'fallback:mount_signal' };
  }
  return { categoryCode: null, reason: 'no_classifier_available' };
}

function loadRawPages(rawPagesDir) {
  const pages = new Map();
  for (const entry of fs.readdirSync(rawPagesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(rawPagesDir, entry.name);
    const page = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const internalName = getInternalName(page)
      || text(page.internal)
      || text(page.internal_name)
      || text(page.requestedInternalName)
      || path.basename(entry.name, '.json');
    if (internalName) {
      pages.set(internalName, page);
    }
  }
  return pages;
}

function buildItemPagesMetadataIndex(input) {
  const byInternal = new Map();
  for (const record of normalizeRecords(input)) {
    const internalName = text(record?.itemInternalName ?? record?.item_internal_name);
    if (internalName) byInternal.set(internalName, record);
  }
  return byInternal;
}

function normalizeRecords(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.records)) return input.records;
  if (Array.isArray(input?.items)) return input.items;
  return [];
}

function toClassifierItem(record) {
  return {
    id: record.id ?? null,
    name: record.name ?? record.nameEn ?? record.name_en ?? null,
    internal_name: getInternalName(record),
    current_category_code: toCode(record.categoryCode ?? record.category_code),
    status: record.status ?? 1,
  };
}

function getInternalName(record) {
  return text(record?.internalName ?? record?.internal_name);
}

function isMaterialCode(code) {
  return MATERIAL_ROOT_CODES.has(toCode(code));
}

function toCode(value) {
  return text(value)?.toUpperCase() || null;
}

function text(value) {
  if (value == null) return null;
  const out = String(value).trim();
  return out ? out : null;
}

if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  await main();
}
