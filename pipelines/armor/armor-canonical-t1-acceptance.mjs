import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STANDARDIZED_PATH = 'data/standardized/armor_sets.standardized.json';
const VIEW_META_PATH = 'data/standardized-view/armor_sets/_meta.json';
const WIKI_PATH = 'data/generated/wiki-armor-sets.latest.json';
const DEFINITION_MAP_PATH = 'data/generated/armor-set-definition-map.json';
const IMAGE_PATH = 'data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json';

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readBoundJson(repoRoot, relativePath) {
  const filePath = path.resolve(repoRoot, relativePath);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Armor source must be an ordinary file: ${relativePath}`);
  const bytes = fs.readFileSync(filePath);
  return { value: JSON.parse(bytes.toString('utf8')), sha256: hashBytes(bytes) };
}

export function sanitizeArmorImageRows(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError('Armor image rows must be an array');
  return rows.map((row) => ({ ...row, cachedUrl: null }));
}

export function buildArmorLocalSourceManifest({ repoRoot = process.cwd() } = {}) {
  const standardized = readBoundJson(repoRoot, STANDARDIZED_PATH);
  const viewMetadata = readBoundJson(repoRoot, VIEW_META_PATH);
  const wiki = readBoundJson(repoRoot, WIKI_PATH);
  const definitionMap = readBoundJson(repoRoot, DEFINITION_MAP_PATH);
  const images = readBoundJson(repoRoot, IMAGE_PATH);
  const sets = standardized.value.records;
  const wikiDefinitions = wiki.value.records;
  const mapRecords = Object.values(definitionMap.value.records ?? {});
  const allImages = images.value.armorSetImages;
  if (!Array.isArray(sets) || !Array.isArray(wikiDefinitions) || !Array.isArray(allImages)) {
    throw new Error('Armor local source collections are missing');
  }
  const textKeys = sets.map((row) => String(row.textKey ?? '').trim());
  if (sets.length !== 64 || textKeys.some((key) => !key) || new Set(textKeys).size !== sets.length) {
    throw new Error('Armor standardized source must contain 64 unique textKey identities');
  }
  const dependencyItemIds = [...new Set(sets.flatMap((row) => row.uniqueItemIds ?? []).map(Number))]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((left, right) => left - right);
  const textKeySet = new Set(textKeys);
  const matchedImageRows = allImages.filter((row) => textKeySet.has(String(row.textKey ?? '')));
  const matchedImageSetKeys = [...new Set(matchedImageRows.map((row) => row.textKey))].sort();
  const missingImageSetKeys = textKeys.filter((key) => !matchedImageSetKeys.includes(key)).sort();
  const imageRows = sanitizeArmorImageRows(matchedImageRows);
  if (wikiDefinitions.length !== 88 || mapRecords.length !== 151 || dependencyItemIds.length !== 243
      || matchedImageRows.length !== 175 || matchedImageSetKeys.length !== 33 || missingImageSetKeys.length !== 31) {
    throw new Error('Armor local source counts differ from the reviewed offline baseline');
  }
  return Object.freeze({
    schemaVersion: 1,
    manifestKind: 'eight_domain_armor_local_source',
    sourceMode: 'local-offline-authorized',
    wikiUnchanged: false,
    generatedAt: new Date().toISOString(),
    sourceHashes: Object.freeze({
      standardized: standardized.sha256,
      standardizedViewMetadata: viewMetadata.sha256,
      wikiDefinitions: wiki.sha256,
      definitionMap: definitionMap.sha256,
      parsedImages: images.sha256,
    }),
    sourcePaths: Object.freeze({
      standardized: STANDARDIZED_PATH,
      standardizedViewMetadata: VIEW_META_PATH,
      wikiDefinitions: WIKI_PATH,
      definitionMap: DEFINITION_MAP_PATH,
      parsedImages: IMAGE_PATH,
    }),
    sourceRevision: standardized.value.upstreamMeta?.sourceRevisionTimestamp ?? null,
    sourceRevisionId: standardized.value.upstreamMeta?.sourceRevisionId ?? null,
    counts: Object.freeze({
      standardizedSets: sets.length,
      wikiDefinitions: wikiDefinitions.length,
      definitionMapRows: mapRecords.length,
      uniqueItemIds: dependencyItemIds.length,
      matchedImageRows: imageRows.length,
      matchedImageSetKeys: matchedImageSetKeys.length,
      missingImageSetKeys: missingImageSetKeys.length,
    }),
    dependencyItemIds: Object.freeze(dependencyItemIds),
    missingImageSetKeys: Object.freeze(missingImageSetKeys),
    sets: Object.freeze(sets),
    imageRows: Object.freeze(imageRows),
  });
}
