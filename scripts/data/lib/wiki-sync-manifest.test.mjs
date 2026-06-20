import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createContentHash,
  loadWikiSourceManifest
} from './wiki-sync-manifest.mjs';

test('advanceWikiIngestionManifestForSource writes normalized source output fingerprint', async () => {
  const manifestModule = await import('./wiki-sync-manifest.mjs');
  assert.equal(typeof manifestModule.advanceWikiIngestionManifestForSource, 'function');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-manifest-helper-'));
  const manifestPath = path.join(tempDir, 'manifest.json');
  const outputPath = path.join(tempDir, 'module-output.json');
  const moduleContent = 'return { item = "Copper Pickaxe" }';

  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(outputPath, JSON.stringify({
    fetchedAt: '2026-06-20T01:02:03.000Z',
    moduleContent,
    moduleTitle: 'Module:Iteminfo/data',
    pageId: 1001,
    pageTitle: 'Module:Iteminfo/data',
    revisionId: 2002,
    revisionTimestamp: '2026-06-20T01:00:00Z'
  }), 'utf8');

  await manifestModule.advanceWikiIngestionManifestForSource({
    sourceKey: 'wiki.module.iteminfo',
    locator: 'Module:Iteminfo/data',
    entityFamily: 'items',
    sourceKind: 'module',
    outputPath,
    manifestPath
  });

  const manifest = loadWikiSourceManifest(manifestPath);
  assert.equal(manifest.records.length, 1);
  assert.deepEqual(manifest.records[0], {
    contentHash: createContentHash(moduleContent),
    entityFamily: 'items',
    key: 'items|module|wiki.module.iteminfo|en|Module:Iteminfo/data',
    lang: 'en',
    lastFetchedAt: '2026-06-20T01:02:03.000Z',
    lastParsedAt: '2026-06-20T01:02:03.000Z',
    localPath: path.resolve(outputPath).replaceAll('\\', '/'),
    pageId: 1001,
    pageTitle: 'Module:Iteminfo/data',
    requestedPageTitle: 'Module:Iteminfo/data',
    revisionId: 2002,
    revisionTimestamp: '2026-06-20T01:00:00Z',
    sourceKey: 'wiki.module.iteminfo',
    sourceKind: 'module',
    status: 'ok'
  });
});

test('resolveIngestedRecord matches sourceKey by page identity before newest timestamp', async () => {
  const manifestModule = await import('./wiki-sync-manifest.mjs');
  assert.equal(typeof manifestModule.buildManifestRecordsBySourceKey, 'function');
  assert.equal(typeof manifestModule.resolveIngestedRecord, 'function');

  const manifest = {
    records: [
      {
        key: 'biomes|page_family_anchor|wiki.page.biomes_anchor|en|Forest',
        sourceKey: 'wiki.page.biomes_anchor',
        entityFamily: 'biomes',
        sourceKind: 'page_family_anchor',
        pageTitle: 'Forest',
        requestedPageTitle: 'Forest',
        lastParsedAt: '2026-06-20T01:00:00Z',
        revisionId: 20
      },
      {
        key: 'biomes|page_family_anchor|wiki.page.biomes_anchor|en|Biomes',
        sourceKey: 'wiki.page.biomes_anchor',
        entityFamily: 'biomes',
        sourceKind: 'page_family_anchor',
        pageTitle: 'Biomes',
        requestedPageTitle: 'Biomes',
        lastParsedAt: '2026-06-20T02:00:00Z',
        revisionId: 10
      },
      {
        key: 'items|module|wiki.module.iteminfo|en|Module:Iteminfo/data',
        sourceKey: 'wiki.module.iteminfo',
        entityFamily: 'items',
        sourceKind: 'module',
        pageTitle: 'Module:Iteminfo/data',
        lastFetchedAt: '2026-06-20T00:00:00Z',
        revisionId: 5
      }
    ]
  };

  const bySourceKey = manifestModule.buildManifestRecordsBySourceKey(manifest);
  assert.equal(bySourceKey.get('wiki.page.biomes_anchor').length, 2);
  assert.equal(bySourceKey.get('wiki.module.iteminfo').length, 1);

  const forest = manifestModule.resolveIngestedRecord(manifest, {
    sourceKey: 'wiki.page.biomes_anchor',
    locator: 'Forest'
  });
  assert.equal(forest.pageTitle, 'Forest');
  assert.equal(forest.revisionId, 20);

  const newestBiomeAnchor = manifestModule.resolveIngestedRecord(manifest, {
    sourceKey: 'wiki.page.biomes_anchor'
  });
  assert.equal(newestBiomeAnchor.pageTitle, 'Biomes');

  assert.equal(manifestModule.resolveIngestedRecord(manifest, {
    sourceKey: 'wiki.missing',
    locator: 'Missing'
  }), null);
});
