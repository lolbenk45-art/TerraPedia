#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  createContentHash,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  loadWikiSourceManifest,
  saveWikiSourceManifest,
  upsertManifestRecord
} from '../lib/wiki-sync-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const sharedRawWikiRoot = sharedDataPath('raw', 'wiki');
const manifestPath = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_WIKI_SOURCE_MANIFEST_PATH);

let manifest = loadWikiSourceManifest(manifestPath);
let seededCount = 0;

const moduleSeeds = [
  ['items', 'module', 'wiki.module.iteminfo', path.join(sharedRawWikiRoot, 'module__iteminfo__data.latest.json')],
  ['npcs', 'module', 'wiki.module.npcinfo', path.join(sharedRawWikiRoot, 'module__npcinfo__data.latest.json')],
  ['projectiles', 'module', 'wiki.module.projectileinfo', path.join(sharedRawWikiRoot, 'module__projectileinfo__data.latest.json')],
  ['armor_sets', 'module', 'wiki.module.armorsetbonuses', path.join(sharedRawWikiRoot, 'module__armorsetbonuses.latest.json')],
  ['buffs', 'template', 'wiki.page.template_getbuffinfo', path.join(sharedRawWikiRoot, 'template__getbuffinfo.latest.json')],
];

for (const [entityFamily, sourceKind, sourceKey, filePath] of moduleSeeds) {
  if (!fs.existsSync(filePath)) {
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  manifest = upsertManifestRecord(manifest, {
    contentHash: createContentHash(payload.moduleContent ?? JSON.stringify(payload)),
    entityFamily,
    lang: 'en',
    lastFetchedAt: payload.fetchedAt ?? null,
    lastParsedAt: payload.fetchedAt ?? null,
    localPath: filePath,
    pageId: payload.pageId ?? null,
    pageTitle: payload.pageTitle ?? payload.moduleTitle ?? null,
    requestedPageTitle: payload.moduleTitle ?? payload.pageTitle ?? null,
    revisionId: payload.revisionId ?? null,
    revisionTimestamp: payload.revisionTimestamp ?? null,
    sourceKey,
    sourceKind,
    status: 'ok'
  });
  seededCount += 1;
}

const itemPagesDir = path.join(sharedRawWikiRoot, 'item-pages');
if (fs.existsSync(itemPagesDir)) {
  const files = fs.readdirSync(itemPagesDir).filter((name) => name.endsWith('.latest.json'));
  for (const file of files) {
    const filePath = path.join(itemPagesDir, file);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    manifest = upsertManifestRecord(manifest, {
      contentHash: null,
      entityFamily: 'item_pages',
      lang: 'en',
      lastFetchedAt: payload.fetchedAt ?? null,
      lastParsedAt: payload.fetchedAt ?? null,
      localPath: filePath,
      pageId: payload.pageId ?? null,
      pageTitle: payload.pageTitle ?? payload.itemName ?? null,
      requestedPageTitle: payload.requestedPageTitle ?? payload.itemName ?? null,
      revisionId: null,
      revisionTimestamp: payload.revisionTimestamp ?? null,
      sourceKey: 'wiki.page.item_detail',
      sourceKind: 'page',
      status: 'ok'
    });
    seededCount += 1;
  }
}

const biomePagesDir = path.join(sharedRawWikiRoot, 'biomes');
if (fs.existsSync(biomePagesDir)) {
  const files = fs.readdirSync(biomePagesDir).filter((name) => name.endsWith('.latest.json'));
  for (const file of files) {
    const filePath = path.join(biomePagesDir, file);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    manifest = upsertManifestRecord(manifest, {
      contentHash: null,
      entityFamily: 'biomes',
      lang: 'en',
      lastFetchedAt: payload.fetchedAt ?? null,
      lastParsedAt: payload.fetchedAt ?? null,
      localPath: filePath,
      pageId: payload.pageId ?? null,
      pageTitle: payload.pageTitle ?? payload.requestedPageTitle ?? null,
      requestedPageTitle: payload.requestedPageTitle ?? payload.pageTitle ?? null,
      revisionId: null,
      revisionTimestamp: payload.revisionTimestamp ?? null,
      sourceKey: 'wiki.page.biome_detail',
      sourceKind: 'page',
      status: 'ok'
    });
    seededCount += 1;
  }
}

const bossesPath = path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json');
if (fs.existsSync(bossesPath)) {
  const payload = JSON.parse(fs.readFileSync(bossesPath, 'utf8'));
  manifest = upsertManifestRecord(manifest, {
    contentHash: null,
    entityFamily: 'bosses',
    lang: 'en',
    lastFetchedAt: payload.generatedAt ?? null,
    lastParsedAt: payload.generatedAt ?? null,
    localPath: bossesPath,
    pageId: payload.overview?.pageId ?? null,
    pageTitle: payload.overview?.title ?? 'Bosses',
    requestedPageTitle: 'Bosses',
    revisionId: null,
    revisionTimestamp: payload.records?.[0]?.revisionTimestamp ?? null,
    sourceKey: 'wiki.page.bosses_anchor',
    sourceKind: 'page_family_anchor',
    status: 'ok'
  });
  seededCount += 1;
}

const biomesPath = path.join(repoRoot, 'data', 'generated', 'wiki-biomes.latest.json');
if (fs.existsSync(biomesPath)) {
  const payload = JSON.parse(fs.readFileSync(biomesPath, 'utf8'));
  manifest = upsertManifestRecord(manifest, {
    contentHash: null,
    entityFamily: 'biomes',
    lang: 'en',
    lastFetchedAt: payload.generatedAt ?? null,
    lastParsedAt: payload.generatedAt ?? null,
    localPath: biomesPath,
    pageId: payload.overview?.pageId ?? null,
    pageTitle: payload.overview?.title ?? 'Biomes',
    requestedPageTitle: 'Biomes',
    revisionId: payload.overview?.revisionId ?? null,
    revisionTimestamp: payload.overview?.revisionTimestamp ?? null,
    sourceKey: 'wiki.page.biomes_anchor',
    sourceKind: 'page_family_anchor',
    status: 'ok'
  });
  seededCount += 1;
}

const categoriesPath = path.join(repoRoot, 'data', 'generated', 'wiki-item-categories.latest.json');
if (fs.existsSync(categoriesPath)) {
  const payload = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  for (const template of templates) {
    manifest = upsertManifestRecord(manifest, {
      contentHash: null,
      entityFamily: 'categories',
      lang: 'en',
      lastFetchedAt: payload.generatedAt ?? null,
      lastParsedAt: payload.generatedAt ?? null,
      localPath: categoriesPath,
      pageId: template.sourcePageId ?? null,
      pageTitle: template.templateTitle ?? null,
      requestedPageTitle: template.templateTitle ?? null,
      revisionId: template.sourceRevisionId ?? null,
      revisionTimestamp: template.sourceRevisionTimestamp ?? null,
      sourceKey: `wiki.page.${slugify(template.templateTitle)}`,
      sourceKind: 'page_family_anchor',
      status: 'ok'
    });
    seededCount += 1;
  }
}

saveWikiSourceManifest(manifestPath, manifest);
console.log(JSON.stringify({
  manifestPath,
  seededCount,
  totalRecords: manifest.records.length
}, null, 2));

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}
