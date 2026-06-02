import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-audio-assets.mjs');

const REQUIRED_PROGRESS_FIELDS = [
  'actionId',
  'status',
  'phase',
  'message',
  'current',
  'total',
  'startedAt',
  'generatedAt',
  'lastHeartbeatAt',
  'childStatusPath',
  'batchOffset',
  'batchLimit',
  'overallCurrent',
  'overallTotal',
  'percent',
  'queue',
  'dataStage',
  'nextStep',
  'reportPath',
  'outputPath'
];

test('audio asset fetch writes completed progress, metadata, report, and scoped files with mock wiki payload', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-default-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedRoot = path.join(tempDir, 'shared');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.mkdirSync(sharedRoot, { recursive: true });

  const result = runScript([
    '--scopes=bgm,npcs,items',
    '--limit-per-scope=3',
    `--report-json=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-audio-assets-progress.latest.json');
  const outputJsonPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json');
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    status: 'completed',
    childStatusPath: progressPath,
    outputPath: outputJsonPath,
    reportPath
  });
  assert.equal(progress.current, 7);
  assert.equal(progress.total, 7);

  const metadata = readJson(outputJsonPath);
  assert.equal(metadata.summary.downloaded, 7);
  assert.equal(metadata.assets.length, 7);
  assert.ok(metadata.assets.some((asset) => asset.scope === 'bgm' && asset.localPath.includes('/bgm/')));
  assert.ok(metadata.assets.some((asset) => asset.scope === 'npcs' && asset.localPath.includes('/npcs/')));
  assert.ok(metadata.assets.some((asset) => asset.scope === 'items' && asset.localPath.includes('/items/')));
  for (const asset of metadata.assets) {
    assert.match(asset.localPath, /^data\/terraPedia\/media\/audio\/wiki\//);
    assert.equal(fs.existsSync(asset.absoluteLocalPath), true);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }

  const report = readJson(reportPath);
  assert.equal(report.summary.downloaded, 7);
});

test('audio asset fetch honors explicit progress path and mirrors canonical progress', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'custom-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const outputJsonPath = path.join(tempDir, 'shared-output.json');
  const mockApiPath = writeAudioMock(tempDir);

  const result = runScript([
    '--scopes=bgm',
    '--limit-per-scope=1',
    `--progress-path=${progressPath}`,
    `--output-json=${outputJsonPath}`,
    `--report-json=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assertProgressContract(readJson(progressPath), {
    status: 'completed',
    childStatusPath: progressPath,
    outputPath: outputJsonPath,
    reportPath
  });
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-audio-assets-progress.latest.json');
  assertProgressContract(readJson(canonicalProgressPath), {
    status: 'completed',
    childStatusPath: canonicalProgressPath,
    outputPath: outputJsonPath,
    reportPath
  });
});

test('audio asset fetch honors TERRAPEDIA_CRAWLER_PROGRESS_PATH when CLI progress path is absent', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-env-progress-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'env-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);

  const result = runScript([
    '--scopes=items',
    '--limit-per-scope=1',
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readJson(progressPath).status, 'completed');
  assert.equal(readJson(progressPath).childStatusPath, progressPath);
});

test('audio asset fetch writes failed progress when candidate cap is exceeded', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-cap-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'failed-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);

  const result = runScript([
    '--scopes=bgm,npcs',
    '--limit-per-scope=3',
    '--max-total-files=2',
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    status: 'failed',
    childStatusPath: progressPath,
    outputPath: path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json'),
    reportPath
  });
  assert.match(progress.message, /max-total-files/i);
});

test('audio asset fetch writes failed progress when mock API loading fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-api-failure-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'failed-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const missingMockPath = path.join(tempDir, 'missing-mock.json');

  const result = runScript([
    '--scopes=bgm',
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: missingMockPath
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    status: 'failed',
    childStatusPath: progressPath,
    outputPath: path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json'),
    reportPath
  });
  assert.match(progress.message, /missing-mock\.json|ENOENT/);
});

test('audio asset fetch fails oversized media without writing the final audio file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-oversized-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'oversized-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);
  const expectedFilePath = path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-overworld-day.mp3');

  const result = runScript([
    '--scopes=bgm',
    '--limit-per-scope=1',
    '--max-file-bytes=5',
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    status: 'failed',
    childStatusPath: progressPath,
    outputPath: path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json'),
    reportPath
  });
  assert.equal(fs.existsSync(expectedFilePath), false);
  assert.equal(fs.existsSync(`${expectedFilePath}.tmp`), false);
  const report = readJson(reportPath);
  assert.equal(report.summary.failed, 1);
  assert.match(report.failures[0].reason, /max-file-bytes/);
});

test('audio asset discovery writes complete per-prefix manifest without downloading files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-discovery-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'discovery-progress.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-discovery.json');
  const mockApiPath = writePagedAudioMock(tempDir);

  const result = runScript([
    '--mode=discover',
    '--allow-full-audio-corpus=true',
    '--max-total-files=20',
    '--max-api-pages-per-prefix=3',
    `--progress-path=${progressPath}`,
    `--manifest-output-json=${manifestPath}`,
    `--report-json=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = readJson(manifestPath);
  assert.equal(manifest.summary.prefixes, 4);
  assert.equal(manifest.summary.continuationComplete, true);
  assert.equal(manifest.prefixes.find((entry) => entry.prefix === 'NPC_Killed').audioRows, 1);
  assert.equal(manifest.summary.unsupportedRows, 1);
  assert.equal(manifest.assets.length, 5);
  assert.equal(manifest.unsupported.length, 1);
  assert.ok(manifest.assets.some((asset) => asset.shard === 'npc_death'));
  assert.equal(fs.existsSync(path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-aether.mp3')), false);

  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    status: 'completed',
    childStatusPath: progressPath,
    outputPath: path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json'),
    reportPath
  });
  assert.equal(progress.phase, 'discover');
});

test('audio asset download resumes from manifest and skips existing verified files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-resume-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'download-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const outputJsonPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json');
  const runOutputPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.runs', 'run.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('bgm:music-aether', 'bgm', 'Music-Aether.mp3', 'audio/mpeg', 'mock://audio/aether', 'existing-aether'),
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one'),
    manifestAsset('npc_death:npc-killed-1', 'npc_death', 'NPC_Killed_1.wav', 'audio/wav', 'mock://audio/killed1', 'npc-killed-one')
  ]);
  const existingPath = path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-aether.mp3');
  fs.mkdirSync(path.dirname(existingPath), { recursive: true });
  fs.writeFileSync(existingPath, 'existing-aether');
  const existingHash = sha256(Buffer.from('existing-aether'));
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, JSON.stringify({
    assets: [{
      assetId: 'bgm:music-aether',
      size: Buffer.byteLength('existing-aether'),
      sha256: existingHash,
      absoluteLocalPath: existingPath,
      localPath: 'data/terraPedia/media/audio/wiki/bgm/music-aether.mp3',
      status: 'downloaded'
    }]
  }));
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': 'item-one',
    'mock://audio/killed1': 'npc-killed-one'
  });

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    `--manifest-json=${manifestPath}`,
    `--resume-from-json=${outputJsonPath}`,
    `--progress-path=${progressPath}`,
    `--output-json=${outputJsonPath}`,
    `--run-output-json=${runOutputPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readJson(reportPath);
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.skippedExisting, 1);
  assert.equal(report.summary.downloaded, 2);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.assets.find((asset) => asset.assetId === 'bgm:music-aether').status, 'skipped_existing');
  const progress = readJson(progressPath);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 3);
});

test('audio asset skip existing requires resume metadata size to match manifest', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-skip-size-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'skip-size-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const outputJsonPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('bgm:music-aether', 'bgm', 'Music-Aether.mp3', 'audio/mpeg', 'mock://audio/aether', 'existing-aether')
  ]);
  const existingPath = path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-aether.mp3');
  fs.mkdirSync(path.dirname(existingPath), { recursive: true });
  fs.writeFileSync(existingPath, 'existing-aether');
  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, JSON.stringify({
    assets: [{
      assetId: 'bgm:music-aether',
      size: 1,
      sha256: sha256(Buffer.from('existing-aether')),
      absoluteLocalPath: existingPath,
      localPath: 'data/terraPedia/media/audio/wiki/bgm/music-aether.mp3',
      status: 'downloaded'
    }]
  }));
  const mockApiPath = writeBinaryMock(tempDir, {});

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    `--manifest-json=${manifestPath}`,
    `--resume-from-json=${outputJsonPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readJson(reportPath);
  assert.equal(report.assets[0].status, 'skipped_existing_unverified_source');
});

test('audio asset download retries transient binary failures before succeeding', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-retry-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'retry-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': [{ error: 'fetch failed' }, 'item-one']
  });

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    '--max-attempts=2',
    '--retry-delay-ms=1',
    `--manifest-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readJson(reportPath);
  assert.equal(report.summary.downloaded, 1);
  assert.equal(report.assets[0].attempts, 2);
  assert.equal(report.summary.retryExhausted, 0);
  assert.equal(readJson(progressPath).status, 'completed');
});

test('audio asset download preserves partial report and does not publish latest metadata on failure', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-partial-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'partial-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const latestOutputPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.latest.json');
  const runOutputPath = path.join(sharedRoot, 'generated', 'wiki-audio-assets.runs', 'partial-run.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one'),
    manifestAsset('items:item-2', 'items', 'Item_2.wav', 'audio/wav', 'mock://audio/missing', 'missing')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': 'item-one'
  });

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    `--manifest-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--output-json=${latestOutputPath}`,
    `--run-output-json=${runOutputPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const report = readJson(reportPath);
  assert.equal(report.summary.downloaded, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.failures[0].reason.includes('missing mock binary'), true);
  const progress = readJson(progressPath);
  assert.equal(progress.status, 'failed');
  assert.equal(progress.current, 2);
  assert.equal(progress.total, 2);
  assert.equal(fs.existsSync(latestOutputPath), false);
  assert.equal(fs.existsSync(runOutputPath), true);
});

test('audio asset download does not retry non-transient missing binary or oversized failures', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-no-retry-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'no-retry-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/missing', 'missing')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {});

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    '--max-attempts=3',
    `--manifest-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const report = readJson(reportPath);
  assert.equal(report.failures[0].attempts, 1);
  assert.equal(report.summary.retryExhausted, 0);
});

test('audio asset download filters manifest assets by requested shard', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-shard-filter-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'shard-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('bgm:music-aether', 'bgm', 'Music-Aether.mp3', 'audio/mpeg', 'mock://audio/aether', 'music-aether'),
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': 'item-one'
  });

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    '--shards=items',
    `--manifest-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readJson(reportPath);
  assert.equal(report.summary.total, 1);
  assert.equal(report.assets.length, 1);
  assert.equal(report.assets[0].shard, 'items');
  assert.equal(fs.existsSync(path.join(sharedRoot, 'media', 'audio', 'wiki', 'bgm', 'music-aether.mp3')), false);
});

test('audio asset download records retry exhausted failures', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-retry-exhausted-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'retry-exhausted-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': [{ error: 'fetch failed' }, { error: 'fetch failed' }]
  });

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    '--max-attempts=2',
    '--retry-delay-ms=1',
    `--manifest-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const report = readJson(reportPath);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.retryExhausted, 1);
  assert.equal(report.failures[0].attempts, 2);
  assert.equal(report.failures[0].retryExhausted, true);
});

test('audio asset fetch removes stale lock when owning process is absent', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-stale-lock-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'stale-lock-progress.json');
  const lockPath = path.join(tempDir, 'audio.lock');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const manifestPath = writeManifest(tempDir, [
    manifestAsset('items:item-1', 'items', 'Item_1.wav', 'audio/wav', 'mock://audio/item1', 'item-one')
  ]);
  const mockApiPath = writeBinaryMock(tempDir, {
    'mock://audio/item1': 'item-one'
  });
  fs.writeFileSync(lockPath, JSON.stringify({
    actionId: 'wiki-audio-assets-refresh',
    pid: 99999999,
    token: 'stale-process',
    startedAt: '2000-01-01T00:00:00.000Z'
  }));

  const result = runScript([
    '--mode=download',
    '--allow-full-audio-corpus=true',
    `--manifest-json=${manifestPath}`,
    `--lock-path=${lockPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(readJson(progressPath).status, 'completed');
});

test('audio asset all mode discovers a manifest then downloads from that manifest', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-all-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'all-progress.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writePagedAudioMock(tempDir);

  const result = runScript([
    '--mode=all',
    '--allow-full-audio-corpus=true',
    '--max-total-files=20',
    '--max-api-pages-per-prefix=3',
    `--manifest-output-json=${manifestPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = readJson(reportPath);
  assert.equal(report.manifestPath, manifestPath);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.total, readJson(manifestPath).summary.audioRows);
});

test('audio asset all mode requires explicit allow-full-audio-corpus', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-all-guard-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'all-guard-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);

  const result = runScript([
    '--mode=all',
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /allow-full-audio-corpus/);
  assert.equal(readJson(progressPath).status, 'failed');
});

test('audio asset fetch rejects full-sized run without allow-full-audio-corpus', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-guard-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'guard-progress.json');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);

  const result = runScript([
    '--mode=discover',
    '--max-total-files=600',
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /allow-full-audio-corpus/);
  assert.equal(readJson(progressPath).status, 'failed');
});

test('audio asset fetch does not reclaim unreadable partial lock', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-partial-lock-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'partial-lock-progress.json');
  const lockPath = path.join(tempDir, 'audio.lock');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);
  fs.writeFileSync(lockPath, '');

  const result = runScript([
    '--mode=discover',
    '--allow-full-audio-corpus=true',
    `--lock-path=${lockPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lock exists but is not readable/);
  assert.equal(readJson(progressPath).status, 'failed');
  assert.equal(fs.readFileSync(lockPath, 'utf8'), '');
});

test('audio asset fetch refuses to start when live lock exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-audio-assets-lock-'));
  const sharedRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'lock-progress.json');
  const lockPath = path.join(tempDir, 'audio.lock');
  const reportPath = path.join(tempDir, 'reports', 'workflow-audio-fetch.json');
  const mockApiPath = writeAudioMock(tempDir);
  fs.writeFileSync(lockPath, JSON.stringify({
    actionId: 'wiki-audio-assets-refresh',
    pid: process.pid,
    token: 'other-process',
    startedAt: new Date().toISOString()
  }));

  const result = runScript([
    '--mode=discover',
    '--allow-full-audio-corpus=true',
    `--lock-path=${lockPath}`,
    `--progress-path=${progressPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_SHARED_DATA_ROOT: sharedRoot,
    TERRAPEDIA_WIKI_AUDIO_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /wiki-audio-assets-refresh lock/);
  assert.equal(readJson(progressPath).status, 'failed');
  assert.equal(readJson(lockPath).token, 'other-process');
});

function runScript(args, env = {}) {
  const defaultWorktreeRoot = path.join(
    os.tmpdir(),
    `terrapedia-audio-assets-worktree-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: defaultWorktreeRoot,
      ...env
    }
  });
}

function assertProgressContract(progress, expected) {
  for (const field of REQUIRED_PROGRESS_FIELDS) {
    assert.ok(Object.hasOwn(progress, field), `missing ${field}`);
  }
  assert.equal(progress.actionId, 'wiki-audio-assets-refresh');
  assert.equal(progress.status, expected.status);
  assert.equal(progress.childStatusPath, expected.childStatusPath);
  assert.equal(progress.outputPath, expected.outputPath);
  assert.equal(progress.reportPath, expected.reportPath);
  assert.match(progress.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.queue, /^wiki audio assets/);
  assert.match(progress.dataStage, /^wiki allimages/);
  assert.equal(typeof progress.nextStep, 'string');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeAudioMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-audio-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    allimages: {
      Music: [
        audioRow('Music-Overworld_Day.mp3', 'audio/mpeg', 12, 'overworld'),
        audioRow('Music-Boss_1.mp3', 'audio/mpeg', 10, 'boss')
      ],
      NPC_Hit: [
        audioRow('NPC_Hit_1.wav', 'audio/wav', 8, 'hit1'),
        audioRow('NPC_Hit_2.wav', 'audio/x-wav', 9, 'hit2')
      ],
      NPC_Killed: [
        audioRow('NPC_Killed_1.wav', 'audio/wav', 11, 'killed1')
      ],
      Item_: [
        audioRow('Item_1.wav', 'audio/wav', 7, 'item1'),
        audioRow('Item_166.wav', 'audio/wav', 13, 'item166')
      ]
    },
    binary: {
      'mock://audio/overworld': 'overworld-day',
      'mock://audio/boss': 'boss-one',
      'mock://audio/hit1': 'npc-hit-one',
      'mock://audio/hit2': 'npc-hit-two',
      'mock://audio/killed1': 'npc-killed-one',
      'mock://audio/item1': 'item-one',
      'mock://audio/item166': 'item-music-box'
    }
  }), 'utf8');
  return mockPath;
}

function writePagedAudioMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-paged-audio-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    allimages: {
      Music: [
        {
          rows: [
            audioRow('Music-Aether.mp3', 'audio/mpeg', 12, 'aether'),
            audioRow('Music_Box.png', 'image/png', 4, 'music-box')
          ],
          continue: 'Music-B'
        },
        {
          rows: [
            audioRow('Music-Boss_1.mp3', 'audio/mpeg', 10, 'boss')
          ],
          continue: null
        }
      ],
      NPC_Hit: [
        {
          rows: [
            audioRow('NPC_Hit_1.wav', 'audio/wav', 8, 'hit1')
          ],
          continue: null
        }
      ],
      NPC_Killed: [
        {
          rows: [
            audioRow('NPC_Killed_1.wav', 'audio/wav', 11, 'killed1')
          ],
          continue: null
        }
      ],
      Item_: [
        {
          rows: [
            audioRow('Item_1.wav', 'audio/wav', 7, 'item1')
          ],
          continue: null
        }
      ]
    },
    binary: {
      'mock://audio/aether': 'music-aether',
      'mock://audio/boss': 'boss-one',
      'mock://audio/hit1': 'npc-hit-one',
      'mock://audio/killed1': 'npc-killed-one',
      'mock://audio/item1': 'item-one'
    }
  }), 'utf8');
  return mockPath;
}

function writeBinaryMock(tempDir, binary) {
  const mockPath = path.join(tempDir, 'mock-binary-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    allimages: {},
    binary
  }), 'utf8');
  return mockPath;
}

function writeManifest(tempDir, assets) {
  const manifestPath = path.join(tempDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    contractVersion: 1,
    source: {
      apiUrl: 'https://terraria.wiki.gg/api.php',
      mode: 'wiki-allimages-audio-manifest'
    },
    summary: {
      prefixes: new Set(assets.map((asset) => asset.prefix)).size,
      allRows: assets.length,
      audioRows: assets.length,
      unsupportedRows: 0,
      totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
      continuationComplete: true
    },
    prefixes: [],
    assets,
    unsupported: []
  }), 'utf8');
  return manifestPath;
}

function manifestAsset(assetId, shard, name, mime, url, body) {
  const sourceKey = name.replace(/\.[^.]+$/, '');
  return {
    assetId,
    shard,
    scope: shard,
    prefix: shard === 'bgm' ? 'Music' : shard === 'items' ? 'Item_' : shard === 'npc_death' ? 'NPC_Killed' : 'NPC_Hit',
    kind: shard === 'bgm' ? 'bgm_track' : shard === 'items' ? 'item_sound' : shard === 'npc_death' ? 'npc_death_sound' : 'npc_hit_sound',
    sourceKey,
    name,
    url,
    mime,
    size: Buffer.byteLength(body),
    slug: sourceKey.toLowerCase().replaceAll('_', '-')
  };
}

function audioRow(name, mime, size, key) {
  return {
    name,
    mime,
    size,
    url: `mock://audio/${key}`
  };
}

function sha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}
