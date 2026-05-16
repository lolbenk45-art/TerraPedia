import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveProjectPath, resolveSharedDataRoot } from '../lib/project-root.mjs';
import { sharedDataPath } from '../lib/wiki-item-utils.mjs';

const defaultRepoRoot = resolveProjectPath();
const defaultSharedDataRoot = sharedDataPath();

function normalizePortablePath(value) {
  return String(value).replaceAll('\\', '/');
}

function normalizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizeParseStatus(value) {
  const normalized = normalizeText(value, 'ok');
  if (['ok', 'partial', 'error', 'skipped'].includes(normalized)) {
    return normalized;
  }
  return 'ok';
}

function createContentHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

function toSourceLocator(filePath, repoRoot, sharedDataRoot) {
  const absolutePath = path.resolve(filePath);
  const normalizedRepoRoot = path.resolve(repoRoot);
  const normalizedSharedDataRoot = path.resolve(sharedDataRoot);
  if (absolutePath.startsWith(normalizedRepoRoot)) {
    return `repo://${normalizePortablePath(path.relative(normalizedRepoRoot, absolutePath))}`;
  }
  if (absolutePath.startsWith(normalizedSharedDataRoot)) {
    return `shared://${normalizePortablePath(path.relative(normalizedSharedDataRoot, absolutePath))}`;
  }
  return normalizePortablePath(absolutePath);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function buildFileDescriptor({
  datasetType,
  filePath,
  payload,
  provider,
  sourceKind,
  sourceKey,
  sourcePage,
  sourceRevisionTimestamp,
  fetchedAt,
  parsedAt,
  parseStatus,
  repoRoot,
  sharedDataRoot,
}) {
  return {
    datasetType,
    provider,
    sourceKind,
    sourceKey: normalizeText(sourceKey),
    sourcePage: normalizeText(sourcePage, normalizeText(sourceKey)),
    sourceLocator: toSourceLocator(filePath, repoRoot, sharedDataRoot),
    sourceRevisionTimestamp: sourceRevisionTimestamp ?? null,
    fetchedAt: fetchedAt ?? null,
    parsedAt: parsedAt ?? fetchedAt ?? null,
    parseStatus: normalizeParseStatus(parseStatus),
    payloadBytes: Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8'),
    contentHash: createContentHash(payload),
    loadPayload: async () => readJson(filePath),
  };
}

function buildInlineDescriptor({
  datasetType,
  filePath,
  payload,
  provider,
  sourceKind,
  sourceKey,
  sourcePage,
  sourceRevisionTimestamp,
  fetchedAt,
  parsedAt,
  parseStatus,
  repoRoot,
  sharedDataRoot,
}) {
  return {
    datasetType,
    provider,
    sourceKind,
    sourceKey: normalizeText(sourceKey),
    sourcePage: normalizeText(sourcePage, normalizeText(sourceKey)),
    sourceLocator: toSourceLocator(filePath, repoRoot, sharedDataRoot),
    sourceRevisionTimestamp: sourceRevisionTimestamp ?? null,
    fetchedAt: fetchedAt ?? null,
    parsedAt: parsedAt ?? fetchedAt ?? null,
    parseStatus: normalizeParseStatus(parseStatus),
    payloadBytes: Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8'),
    contentHash: createContentHash(payload),
    payload,
  };
}

export function resolveDatasetFilter(value) {
  if (value == null || value === '') {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function listSourceDatasetLandingInputs(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const sharedDataRoot = path.resolve(options.sharedDataRoot ?? defaultSharedDataRoot);
  const datasetFilter = new Set(
    Array.isArray(options.datasets) ? options.datasets.filter(Boolean) : resolveDatasetFilter(options.datasets),
  );
  const shouldInclude = (datasetType) => datasetFilter.size === 0 || datasetFilter.has(datasetType);

  const entries = [];
  const pushFileDescriptor = async (datasetType, filePath, builder) => {
    if (!shouldInclude(datasetType) || !(await exists(filePath))) {
      return;
    }
    const payload = await readJson(filePath);
    entries.push(builder(filePath, payload));
  };

  await pushFileDescriptor(
    'items_raw',
    path.join(sharedDataRoot, 'raw', 'wiki', 'module__iteminfo__data.latest.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'items_raw',
      filePath,
      payload,
      provider: 'terraria.wiki.gg',
      sourceKind: 'module',
      sourceKey: 'wiki.module.iteminfo',
      sourcePage: payload.pageTitle ?? payload.moduleTitle,
      sourceRevisionTimestamp: payload.revisionTimestamp,
      fetchedAt: payload.fetchedAt,
      parsedAt: payload.fetchedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  await pushFileDescriptor(
    'npcs_raw',
    path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'npcs_raw',
      filePath,
      payload,
      provider: 'terrapedia.generated',
      sourceKind: 'generated_standardized_bridge',
      sourceKey: 'generated.wiki_crawler_npc_bridge',
      sourcePage: 'npcs.standardized',
      sourceRevisionTimestamp: null,
      fetchedAt: payload.generatedAt,
      parsedAt: payload.generatedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  await pushFileDescriptor(
    'projectiles_raw',
    path.join(sharedDataRoot, 'raw', 'wiki', 'module__projectileinfo__data.parsed.latest.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'projectiles_raw',
      filePath,
      payload,
      provider: 'terraria.wiki.gg',
      sourceKind: 'module',
      sourceKey: 'wiki.module.projectileinfo',
      sourcePage: payload.sourcePageTitle,
      sourceRevisionTimestamp: payload.sourceRevisionTimestamp,
      fetchedAt: payload.fetchedAt,
      parsedAt: payload.fetchedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  await pushFileDescriptor(
    'armor_sets_raw',
    path.join(sharedDataRoot, 'raw', 'wiki', 'module__armorsetbonuses.parsed.latest.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'armor_sets_raw',
      filePath,
      payload,
      provider: 'terraria.wiki.gg',
      sourceKind: 'module',
      sourceKey: 'wiki.module.armorsetbonuses',
      sourcePage: 'Module:Armorsetbonuses',
      sourceRevisionTimestamp: null,
      fetchedAt: payload.generatedAt,
      parsedAt: payload.generatedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  await pushFileDescriptor(
    'armor_set_images_raw',
    path.join(sharedDataRoot, 'raw', 'wiki', 'armor_set_images.parsed.latest.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'armor_set_images_raw',
      filePath,
      payload,
      provider: 'terraria.wiki.gg',
      sourceKind: 'page_imageinfo',
      sourceKey: 'wiki.armor_set_images',
      sourcePage: payload.sourcePageTitle ?? 'Armor set pages',
      sourceRevisionTimestamp: payload.sourceRevisionTimestamp ?? null,
      fetchedAt: payload.fetchedAt,
      parsedAt: payload.fetchedAt,
      parseStatus: Array.isArray(payload.warnings) && payload.warnings.length > 0 ? 'partial' : 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  if (shouldInclude('buffs_raw')) {
    const standardizedBuffsPath = path.join(repoRoot, 'data', 'standardized', 'buffs.standardized.json');
    const rawTemplateBuffsPath = path.join(sharedDataRoot, 'raw', 'wiki', 'template__getbuffinfo.parsed.latest.json');
    const filePath = (await exists(standardizedBuffsPath)) ? standardizedBuffsPath : rawTemplateBuffsPath;
    if (await exists(filePath)) {
      const payload = await readJson(filePath);
      const usesStandardizedPayload = filePath === standardizedBuffsPath;
      entries.push(buildFileDescriptor({
        datasetType: 'buffs_raw',
        filePath,
        payload,
        provider: usesStandardizedPayload ? 'terrapedia.generated' : 'terraria.wiki.gg',
        sourceKind: usesStandardizedPayload ? 'generated_standardized' : 'template',
        sourceKey: usesStandardizedPayload ? 'generated.buffs.standardized' : 'wiki.template.getbuffinfo',
        sourcePage: usesStandardizedPayload ? 'buffs.standardized' : payload.sourcePageTitle,
        sourceRevisionTimestamp: usesStandardizedPayload ? null : payload.sourceRevisionTimestamp,
        fetchedAt: usesStandardizedPayload ? payload.generatedAt : payload.fetchedAt,
        parsedAt: usesStandardizedPayload ? payload.generatedAt : payload.fetchedAt,
        parseStatus: 'ok',
        repoRoot,
        sharedDataRoot,
      }));
    }
  }

  if (shouldInclude('item_pages_raw')) {
    const itemPageDir = path.join(sharedDataRoot, 'raw', 'wiki', 'item-pages');
    if (await exists(itemPageDir)) {
      const fileNames = (await fs.readdir(itemPageDir))
        .filter((name) => name.endsWith('.latest.json'))
        .sort();
      for (const fileName of fileNames) {
        const filePath = path.join(itemPageDir, fileName);
        const payload = await readJson(filePath);
        const fileStem = fileName.replace(/\.latest\.json$/i, '');
        entries.push(buildFileDescriptor({
          datasetType: 'item_pages_raw',
          filePath,
          payload,
          provider: 'terraria.wiki.gg',
          sourceKind: 'page',
          sourceKey: `wiki.page.item_detail:${payload.itemInternalName ?? fileStem}`,
          sourcePage: payload.pageTitle ?? payload.requestedPageTitle ?? fileStem,
          sourceRevisionTimestamp: payload.revisionTimestamp,
          fetchedAt: payload.fetchedAt,
          parsedAt: payload.fetchedAt,
          parseStatus: 'ok',
          repoRoot,
          sharedDataRoot,
        }));
      }
    }
  }

  if (shouldInclude('biomes_raw')) {
    const biomeDir = path.join(sharedDataRoot, 'raw', 'wiki', 'biomes');
    if (await exists(biomeDir)) {
      const fileNames = (await fs.readdir(biomeDir))
        .filter((name) => name.endsWith('.latest.json'))
        .sort();
      for (const fileName of fileNames) {
        const filePath = path.join(biomeDir, fileName);
        const payload = await readJson(filePath);
        const fileStem = fileName.replace(/\.latest\.json$/i, '');
        entries.push(buildFileDescriptor({
          datasetType: 'biomes_raw',
          filePath,
          payload,
          provider: 'terraria.wiki.gg',
          sourceKind: 'page',
          sourceKey: `wiki.page.biome_detail:${payload.biomeCode ?? fileStem}`,
          sourcePage: payload.pageTitle ?? payload.requestedPageTitle ?? fileStem,
          sourceRevisionTimestamp: payload.revisionTimestamp,
          fetchedAt: payload.fetchedAt,
          parsedAt: payload.fetchedAt,
          parseStatus: 'ok',
          repoRoot,
          sharedDataRoot,
        }));
      }
    }
  }

  if (shouldInclude('bosses_raw')) {
    const filePath = path.join(repoRoot, 'data', 'generated', 'wiki-bosses.latest.json');
    if (await exists(filePath)) {
      const payload = await readJson(filePath);
      for (const record of Array.isArray(payload.records) ? payload.records : []) {
        entries.push(buildInlineDescriptor({
          datasetType: 'bosses_raw',
          filePath,
          payload: record,
          provider: 'terraria.wiki.gg',
          sourceKind: 'generated_page_index',
          sourceKey: `wiki.page.boss:${record.pageTitleEn ?? record.titleEn ?? record.pageId ?? 'unknown'}`,
          sourcePage: record.pageTitleEn ?? record.titleEn ?? record.sourceUrl ?? 'Bosses',
          sourceRevisionTimestamp: record.revisionTimestamp,
          fetchedAt: payload.generatedAt,
          parsedAt: payload.generatedAt,
          parseStatus: record.status ?? 'ok',
          repoRoot,
          sharedDataRoot,
        }));
      }
    }
  }

  if (shouldInclude('categories_raw')) {
    const filePath = path.join(repoRoot, 'data', 'generated', 'wiki-item-categories.latest.json');
    if (await exists(filePath)) {
      const payload = await readJson(filePath);
      for (const template of Array.isArray(payload.templates) ? payload.templates : []) {
        entries.push(buildInlineDescriptor({
          datasetType: 'categories_raw',
          filePath,
          payload: template,
          provider: 'terraria.wiki.gg',
          sourceKind: 'generated_page_index',
          sourceKey: `wiki.template.item_categories:${template.templateTitle ?? 'unknown'}`,
          sourcePage: template.templateTitle ?? 'Template:Unknown',
          sourceRevisionTimestamp: template.sourceRevisionTimestamp,
          fetchedAt: payload.generatedAt,
          parsedAt: payload.generatedAt,
          parseStatus: 'ok',
          repoRoot,
          sharedDataRoot,
        }));
      }
    }
  }

  await pushFileDescriptor(
    'shimmer_raw',
    path.join(repoRoot, 'data', 'generated', 'wiki-shimmer.latest.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'shimmer_raw',
      filePath,
      payload,
      provider: 'terraria.wiki.gg',
      sourceKind: 'page',
      sourceKey: 'wiki.page.shimmer',
      sourcePage: payload.pageTitle ?? payload.requestedPageTitle ?? 'Shimmer',
      sourceRevisionTimestamp: payload.revisionTimestamp,
      fetchedAt: payload.fetchedAt ?? payload.generatedAt,
      parsedAt: payload.generatedAt ?? payload.fetchedAt,
      parseStatus: payload.status ?? 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  if (shouldInclude('recipes_raw')) {
    const filePath = path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json');
    if (await exists(filePath)) {
      const payload = await readJson(filePath);
      for (const record of Array.isArray(payload.records) ? payload.records : []) {
        entries.push(buildInlineDescriptor({
          datasetType: 'recipes_raw',
          filePath,
          payload: record,
          provider: 'terraria.wiki.gg/zh',
          sourceKind: 'generated_page_index',
          sourceKey: `wiki.zh.page.recipe:${record.pageTitle ?? record.requestedPageTitle ?? 'unknown'}`,
          sourcePage: record.pageTitle ?? record.requestedPageTitle ?? 'unknown',
          sourceRevisionTimestamp: record.revisionTimestamp,
          fetchedAt: record.fetchedAt ?? payload.generatedAt,
          parsedAt: payload.generatedAt ?? record.fetchedAt,
          parseStatus: record.status ?? 'ok',
          repoRoot,
          sharedDataRoot,
        }));
      }
    }
  }

  await pushFileDescriptor(
    'item_relations_bundle_raw',
    path.join(sharedDataRoot, 'normalized', 'item-relations.bundle.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'item_relations_bundle_raw',
      filePath,
      payload,
      provider: 'terrapedia.generated',
      sourceKind: 'generated_bundle',
      sourceKey: 'generated.item_relations_bundle',
      sourcePage: 'item-relations.bundle',
      sourceRevisionTimestamp: null,
      fetchedAt: payload.generatedAt,
      parsedAt: payload.generatedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  await pushFileDescriptor(
    'npc_item_relations_bundle_raw',
    path.join(repoRoot, 'data', 'generated', 'npc-item-relations.bundle.json'),
    (filePath, payload) => buildFileDescriptor({
      datasetType: 'npc_item_relations_bundle_raw',
      filePath,
      payload,
      provider: 'terrapedia.generated',
      sourceKind: 'generated_bundle',
      sourceKey: 'generated.npc_item_relations_bundle',
      sourcePage: 'npc-item-relations.bundle',
      sourceRevisionTimestamp: null,
      fetchedAt: payload.generatedAt,
      parsedAt: payload.generatedAt,
      parseStatus: 'ok',
      repoRoot,
      sharedDataRoot,
    }),
  );

  entries.sort((left, right) => {
    if (left.datasetType !== right.datasetType) {
      return left.datasetType.localeCompare(right.datasetType);
    }
    if (left.sourcePage !== right.sourcePage) {
      return left.sourcePage.localeCompare(right.sourcePage);
    }
    return left.sourceLocator.localeCompare(right.sourceLocator);
  });

  return entries;
}
