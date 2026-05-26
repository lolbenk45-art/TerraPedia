#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { fetchWikiImageInfo, parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  createMinioImageUploader,
  isManagedUrl,
  resolveEntityManagedUrlPrefixes,
  slugify,
  toText
} from '../lib/minio-image-upload.mjs';
import { resolveManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';

const options = parseCliArgs(process.argv.slice(2));
const apply = booleanOption(options.apply, false);
const scopes = resolveScopes(options.scopes ?? options.scope ?? 'projectiles,buffs');
const standardizedRoot = path.resolve(process.cwd(), 'data', 'standardized');
const managedUrlPrefixes = Array.isArray(options.managedUrlPrefix)
  ? options.managedUrlPrefix
  : (toText(options.managedUrlPrefix)
      ? [toText(options.managedUrlPrefix)]
      : resolveManagedImageUrlPrefixes({ repoRoot: process.cwd() }));
const reportPath = path.resolve(
  process.cwd(),
  options.output ?? path.join(process.cwd(), 'reports', `workflow-image-sync-${new Date().toISOString().slice(0, 10)}.json`)
);
const wikiImageInfoCache = new Map();

const uploader = apply
  ? await createMinioImageUploader({
      apiBase: options.apiBase,
      adminUsername: options.adminUsername,
      adminPassword: options.adminPassword,
      managedUrlPrefixes,
      repoRoot: process.cwd()
    })
  : null;

const summary = {
  apply,
  generatedAt: new Date().toISOString(),
  managedUrlPrefixes,
  modules: {},
  reportPath,
  scopes
};

for (const scope of scopes) {
  if (scope === 'items') {
    summary.modules.items = await syncItems();
  } else if (scope === 'npcs') {
    summary.modules.npcs = await syncNpcs();
  } else if (scope === 'projectiles') {
    summary.modules.projectiles = await syncProjectiles();
  } else if (scope === 'buffs') {
    summary.modules.buffs = await syncBuffs();
  } else if (scope === 'armor_set_images') {
    summary.modules.armor_set_images = await syncArmorSetImages();
  } else if (scope === 'town_npc_maintenance') {
    summary.modules.town_npc_maintenance = await syncTownNpcMaintenanceImages();
  }
}

writeJson(reportPath, summary);
console.log(JSON.stringify(summary, null, 2));

async function syncItems() {
  const filePath = path.join(standardizedRoot, 'items.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return syncRecordImages({
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.imageUrl),
    fallbackSourceUrlResolver: (record) => resolveWikiImageUrlFromFileTitle(record?.imageFileTitle),
    targetUrlWriter: (record, url) => {
      record.imageUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'item')}${guessExtension(url)}`,
    nameHint: (record) => record?.internalName || record?.name || 'item'
  });
}

async function syncNpcs() {
  const filePath = path.join(standardizedRoot, 'npcs.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return syncRecordImages({
    entityDomain: 'npcs',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.imageUrl),
    fallbackSourceUrlResolver: (record) => resolveWikiImageUrlFromFileTitle(record?.imageFileTitle),
    targetUrlWriter: (record, url) => {
      record.imageUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'npc')}${guessExtension(url)}`,
    nameHint: (record) => record?.internalName || record?.name || 'npc'
  });
}

async function syncProjectiles() {
  const filePath = path.join(standardizedRoot, 'projectiles.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return syncRecordImages({
    entityDomain: 'projectiles',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.imageUrl),
    fallbackSourceUrlResolver: (record) => resolveWikiImageUrlFromFileTitle(
      record?.imageFileTitle ?? record?.extras?.image ?? record?.image
    ),
    targetUrlWriter: (record, url) => {
      record.imageUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.internalName || record?.name || 'projectile')}${guessExtension(url)}`,
    nameHint: (record) => record?.internalName || record?.name || 'projectile'
  });
}

async function syncBuffs() {
  const filePath = path.join(standardizedRoot, 'buffs.standardized.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return syncRecordImages({
    entityDomain: 'items',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.imageUrl),
    fallbackSourceUrlResolver: (record) => resolveWikiImageUrlFromFileTitle(
      record?.imageFileTitle ?? record?.image
    ),
    targetUrlWriter: (record, url) => {
      record.imageUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.internalName || record?.englishName || 'buff')}${guessExtension(url)}`,
    nameHint: (record) => record?.internalName || record?.englishName || 'buff'
  });
}

async function syncArmorSetImages() {
  const filePath = sharedDataPath('raw', 'wiki', 'armor_set_images.parsed.latest.json');
  const payload = readJson(filePath);
  const records = Array.isArray(payload?.armorSetImages) ? payload.armorSetImages : [];
  return syncRecordImages({
    entityDomain: 'items',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => toText(record?.cachedUrl) || toText(record?.originalUrl),
    targetUrlWriter: (record, url) => {
      record.cachedUrl = url;
    },
    fileNameHint: (record, url) => `${slugify(record?.sourceFileTitle || record?.pageTitle || 'armor-set')}${guessExtension(url)}`,
    nameHint: (record) => record?.sourceFileTitle || record?.pageTitle || 'armor-set'
  });
}

async function syncTownNpcMaintenanceImages() {
  const filePath = path.resolve(
    options.input ?? path.join(process.cwd(), 'data', 'generated', 'wiki-town-npc-maintenance.latest.json')
  );
  const payload = readJson(filePath);
  const townNpcs = Array.isArray(payload?.records) ? payload.records : [];
  const records = townNpcs.flatMap((record) => {
    const details = record?.wikiDetails && typeof record.wikiDetails === 'object'
      ? record.wikiDetails
      : {};
    return [
      { owner: record, field: 'spriteImage', sourceUrl: toText(details.spriteImage) },
      { owner: record, field: 'mapIconImage', sourceUrl: toText(details.mapIconImage) },
      { owner: record, field: 'dialogPortraitImage', sourceUrl: toText(details.dialogPortraitImage) },
    ].filter((entry) => entry.sourceUrl);
  });

  return syncRecordImages({
    entityDomain: 'npcs',
    filePath,
    payload,
    records,
    sourceUrlAccessor: (record) => record.sourceUrl,
    targetUrlWriter: (record, url) => {
      record.owner.wikiDetails = record.owner.wikiDetails ?? {};
      record.owner.wikiDetails[record.field] = url;
    },
    fileNameHint: (record, url) => `${slugify(`${record.owner?.internalName || 'town-npc'}-${record.field}`)}${guessExtension(url)}`,
    nameHint: (record) => `${record.owner?.internalName || 'town-npc'} ${record.field}`
  });
}

async function syncRecordImages({
  filePath,
  payload,
  records,
  sourceUrlAccessor,
  fallbackSourceUrlResolver,
  targetUrlWriter,
  fileNameHint,
  nameHint,
  entityDomain
} = {}) {
  let changed = 0;
  let alreadyManaged = 0;
  let candidates = 0;
  let missingSource = 0;
  let uploaded = 0;
  const entityManagedUrlPrefixes = resolveEntityManagedUrlPrefixes(entityDomain, managedUrlPrefixes);

  for (const record of records) {
    const directSourceUrl = sourceUrlAccessor(record);
    let sourceUrl = directSourceUrl;
    if (!sourceUrl && fallbackSourceUrlResolver) {
      sourceUrl = await fallbackSourceUrlResolver(record);
    }
    if (!sourceUrl) {
      missingSource += 1;
      continue;
    }
    candidates += 1;
    if (isManagedUrl(sourceUrl, entityManagedUrlPrefixes)) {
      alreadyManaged += 1;
      continue;
    }
    if (!apply || !uploader) {
      changed += 1;
      continue;
    }

    let managedUrl = await uploader.uploadImageUrl(sourceUrl, {
      entityDomain,
      fileName: fileNameHint(record, sourceUrl),
      nameHint: nameHint(record)
    });
    if (!managedUrl && fallbackSourceUrlResolver) {
      const fallbackSourceUrl = await fallbackSourceUrlResolver(record);
      if (fallbackSourceUrl && fallbackSourceUrl !== sourceUrl) {
        managedUrl = await uploader.uploadImageUrl(fallbackSourceUrl, {
          entityDomain,
          fileName: fileNameHint(record, fallbackSourceUrl),
          nameHint: nameHint(record)
        });
      }
    }
    if (!managedUrl) {
      continue;
    }
    targetUrlWriter(record, managedUrl);
    changed += 1;
    uploaded += 1;
  }

  if (apply && uploaded > 0) {
    writeJson(filePath, payload);
  }

  return {
    alreadyManaged,
    apply,
    candidates,
    changed,
    filePath,
    missingSource,
    total: records.length,
    uploaded
  };
}

async function resolveWikiImageUrlFromFileTitle(fileTitle) {
  const normalizedTitle = normalizeFileTitle(fileTitle);
  if (!normalizedTitle) {
    return null;
  }
  if (wikiImageInfoCache.has(normalizedTitle)) {
    return wikiImageInfoCache.get(normalizedTitle);
  }

  let resolvedUrl = null;
  try {
    const imageInfo = await fetchWikiImageInfo({ fileTitle: normalizedTitle });
    resolvedUrl = toText(imageInfo?.url);
  } catch {
    resolvedUrl = null;
  }
  wikiImageInfoCache.set(normalizedTitle, resolvedUrl);
  return resolvedUrl;
}

function normalizeFileTitle(fileTitle) {
  const text = toText(fileTitle);
  if (!text) {
    return null;
  }
  return text.replace(/^File:/i, '');
}

function resolveScopes(rawValue) {
  return [...new Set(
    String(rawValue ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )].filter((scope) => ['items', 'npcs', 'projectiles', 'buffs', 'armor_set_images', 'town_npc_maintenance'].includes(scope));
}

function guessExtension(sourceUrl) {
  const url = toText(sourceUrl);
  if (!url) {
    return '.png';
  }
  try {
    const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '.png';
  } catch {
    return '.png';
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function booleanOption(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}
