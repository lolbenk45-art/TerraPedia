import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createContentHash,
  loadWikiSourceManifest
} from '../lib/wiki-sync-manifest.mjs';

test('wiki-core-refresh finalizes item npc and projectile ingestion fingerprints after action success', async () => {
  const finalizeModule = await import('./backend-refresh-manifest-finalize.mjs');
  assert.equal(typeof finalizeModule.finalizeBackendRefreshActionIngestionManifest, 'function');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-backend-manifest-finalize-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const rawDir = path.join(worktreeRoot, 'data', 'raw', 'wiki');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');

  const outputs = [
    ['module__iteminfo__data.latest.json', 'Module:Iteminfo/data', 'wiki.module.iteminfo', 'items', 'item-content'],
    ['module__npcinfo__data.latest.json', 'Module:Npcinfo/data', 'wiki.module.npcinfo', 'npcs', 'npc-content'],
    ['module__projectileinfo__data.latest.json', 'Module:Projectileinfo/data', 'wiki.module.projectileinfo', 'projectiles', 'projectile-content']
  ];
  for (let index = 0; index < outputs.length; index += 1) {
    const [fileName, moduleTitle, sourceKey, entityFamily, moduleContent] = outputs[index];
    fs.writeFileSync(path.join(rawDir, fileName), JSON.stringify({
      fetchedAt: `2026-06-20T00:0${index}:00.000Z`,
      moduleContent,
      moduleTitle,
      pageId: 100 + index,
      pageTitle: moduleTitle,
      revisionId: 200 + index,
      revisionTimestamp: `2026-06-20T00:0${index}:00Z`,
      sourceKey,
      entityFamily
    }), 'utf8');
  }

  await finalizeModule.finalizeBackendRefreshActionIngestionManifest({
    actionId: 'wiki-core-refresh',
    manifestPath,
    worktreeRoot
  });

  const manifest = loadWikiSourceManifest(manifestPath);
  assert.equal(manifest.records.length, 3);
  for (const [, moduleTitle, sourceKey, entityFamily, moduleContent] of outputs) {
    const record = manifest.records.find((entry) => entry.sourceKey === sourceKey);
    assert.ok(record, sourceKey);
    assert.equal(record.entityFamily, entityFamily);
    assert.equal(record.pageTitle, moduleTitle);
    assert.equal(record.requestedPageTitle, moduleTitle);
    assert.equal(record.contentHash, createContentHash(moduleContent));
  }
});

test('single wiki module refresh finalizes only its matching ingestion fingerprint', async () => {
  const finalizeModule = await import('./backend-refresh-manifest-finalize.mjs');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-single-wiki-manifest-finalize-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const rawDir = path.join(worktreeRoot, 'data', 'raw', 'wiki');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(path.join(rawDir, 'module__npcinfo__data.latest.json'), JSON.stringify({
    fetchedAt: '2026-06-20T00:01:00.000Z',
    moduleContent: 'npc-content',
    moduleTitle: 'Module:Npcinfo/data',
    pageId: 101,
    pageTitle: 'Module:Npcinfo/data',
    revisionId: 201,
    revisionTimestamp: '2026-06-20T00:01:00Z',
    sourceKey: 'wiki.module.npcinfo',
    entityFamily: 'npcs'
  }), 'utf8');

  await finalizeModule.finalizeBackendRefreshActionIngestionManifest({
    actionId: 'wiki-npcs-refresh',
    manifestPath,
    worktreeRoot
  });

  const manifest = loadWikiSourceManifest(manifestPath);
  assert.equal(manifest.records.length, 1);
  assert.equal(manifest.records[0].sourceKey, 'wiki.module.npcinfo');
  assert.equal(manifest.records[0].entityFamily, 'npcs');
  assert.equal(manifest.records[0].contentHash, createContentHash('npc-content'));
});

test('biome-sync finalizes Forest page identity after action success', async () => {
  const finalizeModule = await import('./backend-refresh-manifest-finalize.mjs');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-manifest-finalize-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const generatedDir = path.join(worktreeRoot, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    generatedAt: '2026-06-20T02:00:00.000Z',
    overview: {
      pageId: 1,
      title: 'Biomes',
      revisionId: 10,
      revisionTimestamp: '2026-06-20T01:00:00Z'
    },
    records: [
      {
        pageId: 2,
        pageTitle: 'Forest',
        requestedPageTitle: 'Forest',
        revisionId: 20,
        revisionTimestamp: '2026-06-20T01:30:00Z'
      },
      {
        pageId: 3,
        pageTitle: 'Desert',
        requestedPageTitle: 'Desert',
        revisionId: 30,
        revisionTimestamp: '2026-06-20T01:40:00Z'
      }
    ]
  }), 'utf8');

  await finalizeModule.finalizeBackendRefreshActionIngestionManifest({
    actionId: 'biome-sync',
    manifestPath,
    worktreeRoot
  });

  const manifest = loadWikiSourceManifest(manifestPath);
  assert.equal(manifest.records.length, 1);
  assert.equal(manifest.records[0].sourceKey, 'wiki.page.biomes_anchor');
  assert.equal(manifest.records[0].entityFamily, 'biomes');
  assert.equal(manifest.records[0].sourceKind, 'page_family_anchor');
  assert.equal(manifest.records[0].pageTitle, 'Forest');
  assert.equal(manifest.records[0].requestedPageTitle, 'Forest');
  assert.equal(manifest.records[0].revisionId, 20);
  assert.equal(manifest.records[0].revisionTimestamp, '2026-06-20T01:30:00Z');
  assert.equal(manifest.records[0].contentHash, null);
});

test('biome-sync accepts current generated biome records that expose title only', async () => {
  const finalizeModule = await import('./backend-refresh-manifest-finalize.mjs');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biome-title-manifest-finalize-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const generatedDir = path.join(worktreeRoot, 'data', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(path.join(generatedDir, 'wiki-biomes.latest.json'), JSON.stringify({
    generatedAt: '2026-07-05T02:00:00.000Z',
    records: [
      {
        pageId: 2,
        title: 'Forest',
        revisionId: 20,
        revisionTimestamp: '2026-07-05T01:30:00Z'
      }
    ]
  }), 'utf8');

  await finalizeModule.finalizeBackendRefreshActionIngestionManifest({
    actionId: 'biome-sync',
    manifestPath,
    worktreeRoot
  });

  const manifest = loadWikiSourceManifest(manifestPath);
  assert.equal(manifest.records.length, 1);
  assert.equal(manifest.records[0].pageTitle, 'Forest');
  assert.equal(manifest.records[0].requestedPageTitle, 'Forest');
  assert.equal(manifest.records[0].revisionId, 20);
});
