import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createContentHash,
  loadWikiSourceManifest
} from './wiki-sync-manifest.mjs';

test('acknowledgeWikiProbeSnapshot preserves the probe hash and leaves the manifest unchanged for unreadable output', async () => {
  const manifestModule = await import('./wiki-sync-manifest.mjs');
  assert.equal(typeof manifestModule.acknowledgeWikiProbeSnapshot, 'function');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-probe-ack-'));
  const manifestPath = path.join(tempDir, 'manifest.json');
  const outputPath = path.join(tempDir, 'preview.json');
  const snapshot = {
    sourceKey: 'wiki.audio_assets.catalog',
    locator: 'Music|NPC_Hit|NPC_Killed|Item_',
    entityFamily: 'audio',
    sourceKind: 'media_catalog',
    contentHash: 'probe-content-hash',
    checkedAt: '2026-08-15T03:00:00.000Z'
  };
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  const before = fs.readFileSync(manifestPath, 'utf8');

  assert.throws(
    () => manifestModule.acknowledgeWikiProbeSnapshot({ manifestPath, snapshot, outputPath }),
    /readable terminal output/i
  );
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), before);

  fs.writeFileSync(outputPath, '{"bundle":true}\n', 'utf8');
  const acknowledged = manifestModule.acknowledgeWikiProbeSnapshot({ manifestPath, snapshot, outputPath });
  const record = manifestModule.resolveIngestedRecord(acknowledged, snapshot);
  assert.equal(record.contentHash, snapshot.contentHash);
  assert.equal(record.sourceKey, snapshot.sourceKey);
  assert.equal(record.localPath, path.resolve(outputPath).replaceAll('\\', '/'));
});

test('concurrent supplementary acknowledgements retain every source record', async () => {
  const manifestModuleUrl = pathToFileURL(path.resolve('scripts/data/lib/wiki-sync-manifest.mjs')).href;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-probe-concurrent-'));
  const manifestPath = path.join(tempDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: Array.from({ length: 120 }, (_, index) => ({
    sourceKey: `wiki.seed.${index}`,
    entityFamily: 'seed',
    sourceKind: 'fixture',
    lang: 'en',
    pageTitle: `Seed ${index}`,
    requestedPageTitle: `Seed ${index}`,
  })) }), 'utf8');

  const children = Array.from({ length: 20 }, (_, index) => {
    const outputPath = path.join(tempDir, `preview-${index}.json`);
    fs.writeFileSync(outputPath, '{"bundle":true}\n', 'utf8');
    const script = `
      const module = await import(${JSON.stringify(manifestModuleUrl)});
      module.acknowledgeWikiProbeSnapshot({
        manifestPath: ${JSON.stringify(manifestPath)},
        outputPath: ${JSON.stringify(outputPath)},
        snapshot: {
          sourceKey: ${JSON.stringify(`wiki.supplementary.${index}`)},
          locator: ${JSON.stringify(`Source ${index}`)},
          entityFamily: 'supplementary',
          sourceKind: 'fixture',
          contentHash: ${JSON.stringify(`hash-${index}`)},
          checkedAt: '2026-08-15T03:10:00.000Z'
        }
      });
    `;
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`child exited ${code}: ${stderr}`)));
    });
  });

  await Promise.all(children);
  const manifest = loadWikiSourceManifest(manifestPath);
  const supplementary = manifest.records.filter((record) => record.sourceKey.startsWith('wiki.supplementary.'));
  assert.equal(supplementary.length, 20);
  assert.deepEqual(supplementary.map((record) => record.sourceKey), Array.from({ length: 20 }, (_, index) => `wiki.supplementary.${index}`).sort());
});

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
