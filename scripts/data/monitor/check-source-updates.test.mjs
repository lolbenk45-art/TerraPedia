import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createContentHash } from '../lib/wiki-sync-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'check-source-updates.mjs');

test('compareWikiSourceFingerprint uses contentHash from ingested record even for wiki_page sources', async () => {
  const comparison = await import('./source-update-comparison.mjs');
  assert.equal(typeof comparison.compareWikiSourceFingerprint, 'function');

  const result = comparison.compareWikiSourceFingerprint({
    source: {
      key: 'wiki.page.template_getbuffinfo',
      category: 'wiki_page',
      locator: 'Template:GetBuffInfo'
    },
    apiFingerprint: {
      contentHash: 'hash-a',
      revisionId: 123,
      revisionTimestamp: '2026-06-20T00:00:00Z'
    },
    ingestedRecord: {
      sourceKey: 'wiki.page.template_getbuffinfo',
      contentHash: 'hash-a',
      revisionId: null,
      revisionTimestamp: null
    }
  });

  assert.equal(result.changed, false);
  assert.equal(result.status, 'ok');
  assert.equal(result.currentValue, 'hash-a');
  assert.equal(result.ingestedValue, 'hash-a');
  assert.equal(result.meta.compareBasis, 'ingestion-manifest');
  assert.equal(result.meta.compareField, 'contentHash');
});

test('compareWikiSourceFingerprint reports changed until ingested manifest changes', async () => {
  const { compareWikiSourceFingerprint } = await import('./source-update-comparison.mjs');

  const first = compareWikiSourceFingerprint({
    source: { key: 'wiki.module.iteminfo', category: 'wiki_module', locator: 'Module:Iteminfo/data' },
    apiFingerprint: { contentHash: 'new-hash' },
    ingestedRecord: { contentHash: 'old-hash' }
  });
  const second = compareWikiSourceFingerprint({
    source: { key: 'wiki.module.iteminfo', category: 'wiki_module', locator: 'Module:Iteminfo/data' },
    apiFingerprint: { contentHash: 'new-hash' },
    ingestedRecord: { contentHash: 'old-hash' }
  });
  const afterIngestion = compareWikiSourceFingerprint({
    source: { key: 'wiki.module.iteminfo', category: 'wiki_module', locator: 'Module:Iteminfo/data' },
    apiFingerprint: { contentHash: 'new-hash' },
    ingestedRecord: { contentHash: 'new-hash' }
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, true);
  assert.equal(afterIngestion.changed, false);
});

test('compareWikiSourceFingerprint falls back to revision fields and missing manifest changes', async () => {
  const { compareWikiSourceFingerprint } = await import('./source-update-comparison.mjs');

  const missing = compareWikiSourceFingerprint({
    source: { key: 'wiki.page.biomes_anchor', category: 'wiki_page', locator: 'Forest' },
    apiFingerprint: { revisionId: 7, revisionTimestamp: '2026-06-20T00:00:00Z' },
    ingestedRecord: null
  });
  assert.equal(missing.changed, true);
  assert.equal(missing.status, 'missing_ingestion_manifest');

  const revisionId = compareWikiSourceFingerprint({
    source: { key: 'wiki.page.biomes_anchor', category: 'wiki_page', locator: 'Forest' },
    apiFingerprint: { revisionId: 7, revisionTimestamp: '2026-06-20T00:00:00Z' },
    ingestedRecord: { revisionId: 7, revisionTimestamp: '2026-06-19T00:00:00Z' }
  });
  assert.equal(revisionId.changed, false);
  assert.equal(revisionId.meta.compareField, 'revisionId');
  assert.equal(revisionId.meta.apiRevisionId, 7);
  assert.equal(revisionId.meta.ingestedRevisionId, 7);

  const revisionTimestamp = compareWikiSourceFingerprint({
    source: { key: 'wiki.page.biomes_anchor', category: 'wiki_page', locator: 'Forest' },
    apiFingerprint: { revisionTimestamp: '2026-06-20T00:00:00Z' },
    ingestedRecord: { revisionTimestamp: '2026-06-19T00:00:00Z' }
  });
  assert.equal(revisionTimestamp.changed, true);
  assert.equal(revisionTimestamp.meta.compareField, 'revisionTimestamp');
});

test('check-source-updates compares wiki sources against ingestion manifest, not previous state snapshot', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-a2-'));
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const reportDir = path.join(tempDir, 'reports');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  const itemContent = 'return { ["data"] = [[{"1":{"name":"Wood"}}]] }';

  fs.writeFileSync(statePath, JSON.stringify({
    sources: [{
      key: 'wiki.module.iteminfo',
      currentValue: 'stale-state-value'
    }]
  }), 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({
    records: [{
      contentHash: createContentHash(itemContent),
      entityFamily: 'items',
      key: 'items|module|wiki.module.iteminfo|en|Module:Iteminfo/data',
      pageTitle: 'Module:Iteminfo/data',
      requestedPageTitle: 'Module:Iteminfo/data',
      revisionId: 101,
      revisionTimestamp: '2026-06-20T00:00:00Z',
      sourceKey: 'wiki.module.iteminfo',
      sourceKind: 'module'
    }, {
      contentHash: createContentHash('npc-content'),
      entityFamily: 'npcs',
      key: 'npcs|module|wiki.module.npcinfo|en|Module:Npcinfo/data',
      pageTitle: 'Module:Npcinfo/data',
      requestedPageTitle: 'Module:Npcinfo/data',
      sourceKey: 'wiki.module.npcinfo',
      sourceKind: 'module'
    }, {
      contentHash: createContentHash('projectile-content'),
      entityFamily: 'projectiles',
      key: 'projectiles|module|wiki.module.projectileinfo|en|Module:Projectileinfo/data',
      pageTitle: 'Module:Projectileinfo/data',
      requestedPageTitle: 'Module:Projectileinfo/data',
      sourceKey: 'wiki.module.projectileinfo',
      sourceKind: 'module'
    }, {
      contentHash: createContentHash('armor-content'),
      entityFamily: 'armor_sets',
      key: 'armor_sets|module|wiki.module.armorsetbonuses|en|Module:ArmorSetBonuses',
      pageTitle: 'Module:ArmorSetBonuses',
      requestedPageTitle: 'Module:ArmorSetBonuses',
      sourceKey: 'wiki.module.armorsetbonuses',
      sourceKind: 'module'
    }, {
      contentHash: createContentHash('buff-content'),
      entityFamily: 'buffs',
      key: 'buffs|template|wiki.page.template_getbuffinfo|en|Template:GetBuffInfo',
      pageTitle: 'Template:GetBuffInfo',
      requestedPageTitle: 'Template:GetBuffInfo',
      sourceKey: 'wiki.page.template_getbuffinfo',
      sourceKind: 'template'
    }, {
      contentHash: null,
      entityFamily: 'biomes',
      key: 'biomes|page_family_anchor|wiki.page.biomes_anchor|en|Forest',
      pageTitle: 'Forest',
      requestedPageTitle: 'Forest',
      revisionId: 606,
      revisionTimestamp: '2026-06-20T06:00:00Z',
      sourceKey: 'wiki.page.biomes_anchor',
      sourceKind: 'page_family_anchor'
    }]
  }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({
    __byRequest: {
      'query:revisions:Module:Iteminfo/data': wikiModuleResponse('Module:Iteminfo/data', itemContent, 101, '2026-06-20T00:00:00Z'),
      'query:revisions:Module:Npcinfo/data': wikiModuleResponse('Module:Npcinfo/data', 'npc-content', 202, '2026-06-20T02:00:00Z'),
      'query:revisions:Module:Projectileinfo/data': wikiModuleResponse('Module:Projectileinfo/data', 'projectile-content', 303, '2026-06-20T03:00:00Z'),
      'query:revisions:Module:ArmorSetBonuses': wikiModuleResponse('Module:ArmorSetBonuses', 'armor-content', 404, '2026-06-20T04:00:00Z'),
      'query:revisions:Template:GetBuffInfo': wikiModuleResponse('Template:GetBuffInfo', 'buff-content', 505, '2026-06-20T05:00:00Z'),
      'query:revisions:Forest': wikiPageResponse('Forest', 606, '2026-06-20T06:00:00Z')
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--state-file=${statePath}`,
    `--manifest-path=${manifestPath}`,
    `--report-dir=${reportDir}`,
    `--progress-path=${progressPath}`,
    '--official-check-mode=never'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const item = state.sources.find((source) => source.key === 'wiki.module.iteminfo');
  assert.equal(item.changed, false);
  assert.equal(item.previousValue, createContentHash(itemContent));
  assert.equal(item.meta.compareBasis, 'ingestion-manifest');
  assert.equal(item.meta.compareField, 'contentHash');
  assert.equal(state.summary.changedSources, 0);
  assert.deepEqual(
    state.sources
      .filter((source) => source.key.startsWith('wiki.audio_assets.') || source.key.startsWith('wiki.bosses.') || source.key.startsWith('wiki.shimmer.'))
      .map((source) => source.key)
      .sort(),
    ['wiki.audio_assets.catalog', 'wiki.bosses.catalog', 'wiki.shimmer.page_and_langlinks']
  );
  assert.ok(state.sources
    .filter((source) => source.key.startsWith('wiki.audio_assets.') || source.key.startsWith('wiki.bosses.') || source.key.startsWith('wiki.shimmer.'))
    .every((source) => source.changed === false));

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);
});

test('check-source-updates records wiki errors as unchanged and still writes completed progress', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-progress-failed-'));
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const reportDir = path.join(tempDir, 'reports');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--state-file=${statePath}`,
    `--manifest-path=${manifestPath}`,
    `--report-dir=${reportDir}`,
    `--progress-path=${progressPath}`,
    '--official-check-mode=never'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.ok(state.sources.every((source) => source.status === 'error'));
  assert.ok(state.sources.every((source) => source.changed === false));

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);
});

function wikiModuleResponse(title, content, revisionId, revisionTimestamp) {
  return {
    query: {
      pages: [{
        pageid: revisionId,
        title,
        revisions: [{
          revid: revisionId,
          timestamp: revisionTimestamp,
          slots: {
            main: {
              content
            }
          }
        }]
      }]
    }
  };
}

function wikiPageResponse(title, revisionId, revisionTimestamp) {
  return {
    query: {
      pages: [{
        pageid: revisionId,
        title,
        revisions: [{
          revid: revisionId,
          timestamp: revisionTimestamp
        }]
      }]
    }
  };
}
