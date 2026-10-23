import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectPath } from '../lib/project-root.mjs';

export const DEFAULT_PC_VERSION_IDENTITY_CATALOG_FILES = Object.freeze({
  items: 'data/standardized/item_pages.standardized.json',
  npcs: 'data/standardized/npcs.standardized.json',
  projectiles: 'data/standardized/projectiles.standardized.json',
  buffs: 'data/standardized/buffs.standardized.json',
  armor_sets: 'data/generated/wiki-armor-sets.latest.json',
  bosses: 'data/generated/wiki-bosses.latest.json',
  shimmer: 'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json'
});

const DOMAIN_BUILDERS = Object.freeze({
  items: buildItemTargets,
  npcs: buildNpcTargets,
  projectiles: buildProjectileTargets,
  buffs: buildBuffTargets,
  armor_sets: buildArmorSetTargets,
  bosses: buildBossTargets,
  shimmer: buildShimmerTargets
});

export function loadPcVersionIdentityCatalog({
  projectRoot = resolveProjectPath(),
  files = DEFAULT_PC_VERSION_IDENTITY_CATALOG_FILES,
  readFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))
} = {}) {
  const datasets = {};
  for (const [domain, relativePath] of Object.entries(files)) {
    const filePath = path.isAbsolute(relativePath) ? relativePath : path.resolve(projectRoot, relativePath);
    try {
      datasets[domain] = readFile(filePath);
    } catch (error) {
      datasets[domain] = { __catalogError: compactError(error), __catalogPath: relativePath };
    }
  }
  return buildPcVersionIdentityCatalog(datasets, { files });
}

export function buildPcVersionIdentityCatalog(datasets = {}, { files = DEFAULT_PC_VERSION_IDENTITY_CATALOG_FILES } = {}) {
  const index = new Map();
  const provenance = {};
  for (const [domain, builder] of Object.entries(DOMAIN_BUILDERS)) {
    const dataset = datasets?.[domain];
    const sourcePath = files?.[domain] ?? null;
    if (!dataset || dataset.__catalogError) {
      provenance[domain] = {
        status: 'unavailable',
        sourcePath,
        error: dataset?.__catalogError ?? 'catalog dataset missing'
      };
      continue;
    }
    const records = Array.isArray(dataset.records)
      ? dataset.records
      : (domain === 'npcs' && dataset.records && typeof dataset.records === 'object'
        ? Object.values(dataset.records)
        : null);
    if (records == null) {
      provenance[domain] = {
        status: 'unavailable',
        sourcePath,
        error: 'catalog dataset records are missing or malformed'
      };
      continue;
    }
    const targets = builder(records).map((target) => ({
      ...target,
      provenance: {
        domain,
        sourcePath,
        generatedAt: dataset.generatedAt ?? dataset.fetchedAt ?? null
      }
    }));
    provenance[domain] = {
      status: 'available',
      sourcePath,
      generatedAt: dataset.generatedAt ?? dataset.fetchedAt ?? null,
      recordCount: records.length,
      identityCount: targets.length
    };
    for (const target of targets) {
      for (const title of target.wikiTitles) {
        const key = wikiTitleKey(title);
        if (!key) continue;
        const entries = index.get(key) ?? [];
        if (!entries.some((entry) => identityKey(entry) === identityKey(target))) entries.push(target);
        index.set(key, entries);
      }
    }
  }
  if (!provenance.audio) {
    provenance.audio = { status: 'unavailable', sourcePath: null, error: 'no maintained audio identity catalog' };
  }
  return Object.freeze({ index, provenance });
}

export function resolvePcVersionWikiTitle(catalog, title) {
  const key = wikiTitleKey(title);
  if (!key || !catalog?.index) return { status: 'unknown', targets: [], candidateCount: 0 };
  const targets = catalog.index.get(key) ?? [];
  if (targets.length === 1) return { status: 'unique', targets: [cloneTarget(targets[0])], candidateCount: 1 };
  if (targets.length > 1) return { status: 'ambiguous', targets: [], candidateCount: targets.length };
  return { status: 'unknown', targets: [], candidateCount: 0 };
}

function wikiTitleKey(value) {
  const characters = [...normalizeWikiTitle(value)];
  if (characters.length === 0) return '';
  characters[0] = characters[0].toLocaleLowerCase('en-US');
  return characters.join('');
}

export function normalizeWikiTitle(value) {
  return String(value ?? '').replaceAll('_', ' ').trim()
    .replace(/^:+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildItemTargets(records) {
  return records.flatMap((record) => {
    const internalName = text(record.itemInternalName ?? record.internalName);
    const title = text(record.pageTitle ?? record.itemName ?? record.name);
    if (!internalName || !title) return [];
    return [target('items', 'item', { kind: 'item_internal_name', value: internalName }, title, record.itemName ?? record.name ?? title)];
  });
}

function buildNpcTargets(records) {
  return records.flatMap((record) => {
    const internalName = text(record.internalName);
    const title = text(record.pageTitle ?? record.name ?? record.nameEn);
    if (!internalName || !title) return [];
    return [target('npcs', 'npc', { kind: 'npc_internal_name', value: internalName }, title, record.name ?? title)];
  });
}

function buildProjectileTargets(records) {
  return records.flatMap((record) => {
    const internalName = text(record.internalName);
    const title = text(record.pageTitle ?? record.name);
    if (!internalName || !title) return [];
    return [target('projectiles', 'projectile', { kind: 'projectile_internal_name', value: internalName }, title, record.name ?? title)];
  });
}

function buildBuffTargets(records) {
  return records.flatMap((record) => {
    const internalName = text(record.internalName);
    const localizedPage = record.localized?.en?.page;
    const title = text(localizedPage ?? record.pageTitle ?? record.englishName ?? record.name);
    if (!internalName || !title) return [];
    const aliases = [title, record.englishName, record.localized?.en?.name].filter(Boolean);
    return [target('buffs', 'buff', { kind: 'buff_internal_name', value: internalName }, aliases, record.englishName ?? title)];
  });
}

function buildArmorSetTargets(records) {
  return records.flatMap((record) => {
    const title = text(record.pageTitle ?? record.nameEn);
    if (!title) return [];
    return [target('armor_sets', 'armor_set', { kind: 'armor_set_page_title', value: title }, title, record.nameEn ?? title)];
  });
}

function buildBossTargets(records) {
  return records.flatMap((record) => {
    const title = text(record.pageTitleEn ?? record.titleEn);
    if (!title) return [];
    return [target('bosses', 'boss', { kind: 'boss_page_title', value: title }, title, record.titleEn ?? title)];
  });
}

function buildShimmerTargets(records) {
  return records.flatMap((record) => {
    const result = [];
    for (const [nameKey, identityKeyName] of [['inputNameEn', 'inputInternalName'], ['outputNameEn', 'outputInternalName']]) {
      const title = text(record[nameKey]);
      const internalName = text(record[identityKeyName]);
      if (!title || !internalName) continue;
      result.push(target('shimmer', 'shimmer_item', { kind: 'shimmer_item_internal_name', value: internalName }, title, title));
    }
    return result;
  });
}

function target(domain, entityType, stableIdentity, titles, displayName) {
  return { domain, entityType, stableIdentity, wikiTitles: [...new Set((Array.isArray(titles) ? titles : [titles]).map(normalizeWikiTitle).filter(Boolean))], displayName };
}

function identityKey(value) {
  return [value.domain, value.entityType, value.stableIdentity.kind, value.stableIdentity.value].join('|');
}

function cloneTarget(value) {
  return { ...value, wikiTitles: [...value.wikiTitles], stableIdentity: { ...value.stableIdentity }, provenance: { ...value.provenance } };
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function compactError(error) {
  return String(error?.message ?? error ?? 'unknown catalog error').replace(/\s+/g, ' ').slice(0, 240);
}
