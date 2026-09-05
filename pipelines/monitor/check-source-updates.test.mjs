import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createContentHash } from '../lib/wiki-sync-manifest.mjs';
import { writeJson } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(__dirname, 'check-source-updates.mjs');

test('writeJson preserves the previous source evidence when target publication fails mid-write', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-atomic-'));
  const targetPath = path.join(tempDir, 'source-update-monitor.latest.json');
  const previous = '{"status":"previous","sources":[]}';
  fs.writeFileSync(targetPath, previous, 'utf8');
  const originalFsyncSync = fs.fsyncSync;
  fs.fsyncSync = function patchedFsyncSync() {
    throw new Error('simulated publication fsync failure');
  };
  try {
    assert.throws(() => writeJson(targetPath, { status: 'replacement' }), /simulated publication fsync failure/);
  } finally {
    fs.fsyncSync = originalFsyncSync;
  }
  assert.equal(fs.readFileSync(targetPath, 'utf8'), previous);
});

test('check-source-updates publishes terminal failed progress when the previous state is corrupt', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-corrupt-state-'));
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(statePath, '{not-json', 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

  const result = spawnSourceMonitor({
    statePath,
    manifestPath,
    reportDir: path.join(tempDir, 'reports'),
    progressPath,
    mockApiPath,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'initialization');
  assert.match(progress.message, /JSON|state/i);
});

test('check-source-updates fails closed before source work when the initial progress write fails once', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-initial-progress-'));
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  const preloadPath = path.join(tempDir, 'fail-first-progress-write.mjs');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');
  fs.writeFileSync(preloadPath, `
    import fs from 'node:fs';
    const originalOpenSync = fs.openSync;
    let failed = false;
    fs.openSync = (filePath, ...args) => {
      if (!failed && String(filePath).includes('progress.json')) {
        failed = true;
        throw new Error('simulated initial progress write failure');
      }
      return originalOpenSync(filePath, ...args);
    };
  `, 'utf8');

  const result = spawnSourceMonitor({
    statePath,
    manifestPath,
    reportDir: path.join(tempDir, 'reports'),
    progressPath,
    mockApiPath,
    nodeOptions: `--import=${pathToFileURL(preloadPath).href}`,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(statePath), false, 'source work must not publish state after initial progress failure');
  assert.equal(fs.existsSync(path.join(tempDir, 'reports')), false, 'source work must not create reports after initial progress failure');
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'initialization');
  assert.match(progress.message, /initial progress write failure/i);
});

test('check-source-updates rejects a symbolic-link progress ancestor before publication', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-progress-symlink-'));
  const outsideDir = path.join(tempDir, 'outside');
  const linkedDir = path.join(tempDir, 'linked-progress');
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const progressPath = path.join(linkedDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.mkdirSync(outsideDir);
  fs.symlinkSync(outsideDir, linkedDir, 'dir');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

  const result = spawnSourceMonitor({
    statePath,
    manifestPath,
    reportDir: path.join(tempDir, 'reports'),
    progressPath,
    mockApiPath,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(outsideDir, 'progress.json')), false);
  assert.equal(fs.existsSync(statePath), false);
  assert.equal(fs.existsSync(path.join(tempDir, 'reports')), false);
});

for (const failure of [
  {
    name: 'state publication',
    statePath: () => path.join('/sys', `terrapedia-source-state-${Date.now()}-${Math.random().toString(16).slice(2)}.json`),
    reportDir: (tempDir) => path.join(tempDir, 'reports'),
    message: /publication|read-only|EROFS|state/i,
  },
  {
    name: 'report publication',
    statePath: (tempDir) => path.join(tempDir, 'state.json'),
    reportDir: () => '/sys',
    message: /publication|read-only|EROFS|report/i,
  },
]) {
  test(`check-source-updates publishes terminal failed progress when ${failure.name} fails`, () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-publication-'));
    const statePath = typeof failure.statePath === 'function'
      ? failure.statePath(tempDir)
      : failure.statePath;
    const manifestPath = path.join(tempDir, 'manifest.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

    const result = spawnSourceMonitor({
      statePath,
      manifestPath,
      reportDir: failure.reportDir(tempDir),
      progressPath,
      mockApiPath,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.actionId, 'source-update-monitor-check');
    assert.equal(progress.status, 'failed');
    assert.equal(progress.phase, 'publication');
    assert.match(progress.message, failure.message);
  });
}

test('check-source-updates publishes terminal failed progress when directory fsync fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-fsync-'));
  const preloadPath = path.join(tempDir, 'fail-directory-fsync.mjs');
  fs.writeFileSync(preloadPath, `
    import fs from 'node:fs';
    const originalFsyncSync = fs.fsyncSync;
    let calls = 0;
    fs.fsyncSync = (fd) => {
      calls += 1;
      if (calls === 4) throw new Error('simulated directory fsync failure');
      return originalFsyncSync(fd);
    };
  `, 'utf8');
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

  const result = spawnSourceMonitor({
    statePath,
    manifestPath,
    reportDir: path.join(tempDir, 'reports'),
    progressPath,
    mockApiPath,
    nodeOptions: `--import=${pathToFileURL(preloadPath).href}`,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'publication');
  assert.match(progress.message, /directory fsync/i);
});

test('check-source-updates preserves the previous state when immutable report publication fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-source-update-report-preserve-'));
  const statePath = path.join(tempDir, 'state.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  const previous = {
    schemaVersion: '1.0.0',
    checkedAt: '2026-08-31T00:00:00.000Z',
    sentinel: 'previous-state-must-survive-report-failure',
    sources: []
  };
  fs.writeFileSync(statePath, JSON.stringify(previous), 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

  const result = spawnSourceMonitor({
    statePath,
    manifestPath,
    reportDir: '/sys',
    progressPath,
    mockApiPath,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), previous);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'publication');
});

test('source update monitor disables official feeds unless explicitly requested', async () => {
  const { resolveOfficialCheckMode } = await import('./source-update-monitor-options.mjs');

  assert.equal(resolveOfficialCheckMode({}), 'never');
  assert.equal(resolveOfficialCheckMode({ 'official-check-mode': 'always' }), 'always');
  assert.equal(resolveOfficialCheckMode({ officialCheckMode: 'never' }), 'never');
  assert.equal(resolveOfficialCheckMode({ officialCheckMode: 'invalid' }), 'never');
});

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
  assert.equal(missing.currentValue, 7);
  assert.equal(missing.meta.compareField, 'revisionId');

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

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const item = state.sources.find((source) => source.key === 'wiki.module.iteminfo');
  assert.equal(item.changed, false);
  assert.equal(item.previousValue, createContentHash(itemContent));
  assert.equal(item.meta.compareBasis, 'ingestion-manifest');
  assert.equal(item.meta.compareField, 'contentHash');
  assert.equal(state.summary.changedSources, 0);
  assert.equal(state.summary.probeHealthy, false);
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
  assert.equal(progress.status, 'failed');
  assert.equal(progress.childStatusPath, progressPath);
});

test('check-source-updates fails closed when a wiki probe errors', () => {
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

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.ok(state.sources.every((source) => source.status === 'error'));
  assert.ok(state.sources.every((source) => source.changed === false));
  assert.equal(state.summary.probeHealthy, false);
  assert.equal(state.summary.failedSourceKeys.length, state.sources.length);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'source-update-monitor-check');
  assert.equal(progress.status, 'failed');
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

function spawnSourceMonitor({
  statePath,
  manifestPath,
  reportDir,
  progressPath,
  mockApiPath,
  nodeOptions = process.env.NODE_OPTIONS,
}) {
  return spawnSync(process.execPath, [
    scriptPath,
    `--state-file=${statePath}`,
    `--manifest-path=${manifestPath}`,
    `--report-dir=${reportDir}`,
    `--progress-path=${progressPath}`,
    '--official-check-mode=never',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath,
      ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
    },
  });
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
