import fs from 'node:fs';
import path from 'node:path';

import { resolveProjectPath } from '../lib/project-root.mjs';
import { sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  advanceWikiIngestionManifestForSource,
  DEFAULT_WIKI_SOURCE_MANIFEST_PATH
} from '../lib/wiki-sync-manifest.mjs';

const WIKI_CORE_SOURCES = [
  {
    sourceKey: 'wiki.module.iteminfo',
    locator: 'Module:Iteminfo/data',
    entityFamily: 'items',
    sourceKind: 'module',
    outputFile: 'module__iteminfo__data.latest.json'
  },
  {
    sourceKey: 'wiki.module.npcinfo',
    locator: 'Module:Npcinfo/data',
    entityFamily: 'npcs',
    sourceKind: 'module',
    outputFile: 'module__npcinfo__data.latest.json'
  },
  {
    sourceKey: 'wiki.module.projectileinfo',
    locator: 'Module:Projectileinfo/data',
    entityFamily: 'projectiles',
    sourceKind: 'module',
    outputFile: 'module__projectileinfo__data.latest.json'
  }
];

export function finalizeBackendRefreshActionIngestionManifest({
  actionId,
  manifestPath = DEFAULT_WIKI_SOURCE_MANIFEST_PATH,
  worktreeRoot = resolveProjectPath()
} = {}) {
  if (actionId === 'wiki-core-refresh') {
    return finalizeWikiCoreRefresh({ manifestPath, worktreeRoot });
  }
  if (actionId === 'biome-sync') {
    return finalizeBiomeSync({ manifestPath, worktreeRoot });
  }
  return [];
}

function finalizeWikiCoreRefresh({ manifestPath, worktreeRoot }) {
  const finalized = [];
  for (const source of WIKI_CORE_SOURCES) {
    const outputPath = path.join(worktreeRoot, 'data', 'raw', 'wiki', source.outputFile);
    advanceWikiIngestionManifestForSource({
      sourceKey: source.sourceKey,
      locator: source.locator,
      entityFamily: source.entityFamily,
      sourceKind: source.sourceKind,
      outputPath,
      manifestPath
    });
    finalized.push(source.sourceKey);
  }
  return finalized;
}

function finalizeBiomeSync({ manifestPath, worktreeRoot }) {
  const outputPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json');
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const forest = (Array.isArray(payload.records) ? payload.records : [])
    .find((record) => record?.pageTitle === 'Forest' || record?.requestedPageTitle === 'Forest');
  if (!forest) {
    throw new Error('Cannot finalize biome-sync manifest: Forest record missing from wiki-biomes.latest.json');
  }
  advanceWikiIngestionManifestForSource({
    sourceKey: 'wiki.page.biomes_anchor',
    locator: 'Forest',
    entityFamily: 'biomes',
    sourceKind: 'page_family_anchor',
    outputPath,
    manifestPath,
    record: {
      ...forest,
      contentHash: null,
      fetchedAt: payload.generatedAt ?? forest.fetchedAt ?? null
    }
  });
  return ['wiki.page.biomes_anchor'];
}

export function defaultWikiSourceManifestPath() {
  return sharedDataPath('generated', 'wiki-source-manifest.latest.json');
}
