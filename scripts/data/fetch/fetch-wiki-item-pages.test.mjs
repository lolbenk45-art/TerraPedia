import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-item-pages.mjs');

test('writes child progress and report to explicit paths when no item pages are selected', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const defaultProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--items=DefinitelyMissingItem',
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages'
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(escapeRegExp(reportDir)));
    assert.equal(fs.readdirSync(reportDir).filter((entry) => entry.endsWith('.json')).length, 1);

    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.actionId, 'test-item-pages');
    assert.equal(progress.status, 'completed');
    assert.equal(progress.current, 0);
    assert.equal(progress.total, 0);
    assert.match(progress.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(progress.batchOffset, 0);
    assert.equal(progress.batchLimit, 1);
    assert.equal(progress.overallCurrent, 0);
    assert.equal(progress.overallTotal, 0);
    assert.equal(path.resolve(progress.childStatusPath), progressPath);
    assert.match(progress.message, /finished item page fetch/);

    const defaultProgress = JSON.parse(fs.readFileSync(defaultProgressPath, 'utf8'));
    assert.equal(defaultProgress.actionId, 'test-item-pages');
    assert.equal(defaultProgress.status, 'completed');
    assert.equal(defaultProgress.startedAt, progress.startedAt);
    assert.equal(defaultProgress.overallCurrent, 0);
    assert.equal(defaultProgress.overallTotal, 0);
    assert.equal(path.resolve(defaultProgress.childStatusPath), defaultProgressPath);
});

test('item page fetcher leaves request pacing to the wiki request gate', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    assert.doesNotMatch(source, /delay-ms/);
    assert.doesNotMatch(source, /jitter-ms/);
    assert.doesNotMatch(source, /computeDelayMs/);
});

test('default fetch progress path follows WORKTREE_ROOT when progress path is omitted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-worktree-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const worktreeProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      '--items=DefinitelyMissingItem',
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-worktree'
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(worktreeProgressPath), true);

    const progress = JSON.parse(fs.readFileSync(worktreeProgressPath, 'utf8'));
    assert.equal(progress.actionId, 'test-item-pages-worktree');
    assert.equal(progress.status, 'completed');
    assert.equal(path.resolve(progress.childStatusPath), worktreeProgressPath);
});

test('sample mode fetches a deterministic bounded item subset and reports sample metadata', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-sample-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');
    const sampleItems = buildSampleItems();

    fs.mkdirSync(worktreeRoot, { recursive: true });
    writeItemsInput(inputPath, sampleItems);
    writeMockItemPageApi(mockApiPath, sampleItems);

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--sample-size=2',
      '--sample-seed=stable-smoke',
      '--only-changed=false',
      '--limit=5',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-sample',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const report = readOnlyJsonReport(reportDir);
    assert.equal(report.sampled, true);
    assert.equal(report.sampleSize, 2);
    assert.equal(report.sampleSeed, 'stable-smoke');
    assert.equal(report.candidateCountBeforeSample, 5);
    assert.equal(report.sampleCandidateCount, 2);
    assert.equal(report.selectedCount, 2);
    assert.equal(report.items.length, 2);
    assert.equal(fs.readdirSync(rawDir).filter((entry) => entry.endsWith('.latest.json')).length, 2);

    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.actionId, 'test-item-pages-sample');
    assert.equal(progress.status, 'completed');
    assert.equal(progress.current, 2);
    assert.equal(progress.total, 2);
});

test('sample mode accepts standardized records input shape', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-records-sample-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.standardized.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');
    const sampleItems = buildSampleItems();

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({ records: sampleItems }), 'utf8');
    writeMockItemPageApi(mockApiPath, sampleItems);

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--sample-size=2',
      '--sample-seed=standardized-records',
      '--only-changed=false',
      '--limit=5',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-records-sample',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const report = readOnlyJsonReport(reportDir);
    assert.equal(report.sampled, true);
    assert.equal(report.candidateCountBeforeSample, 5);
    assert.equal(report.sampleCandidateCount, 2);
    assert.equal(report.selectedCount, 2);
    assert.equal(report.items.length, 2);
});

test('sample mode selects the same item order for the same seed across runs', () => {
    const firstRun = runSampleFetchInTemp({ sampleSize: 3, sampleSeed: 'repeatable-seed' });
    const secondRun = runSampleFetchInTemp({ sampleSize: 3, sampleSeed: 'repeatable-seed' });

    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
    assert.equal(firstRun.itemInternalNames.length, 3);
    assert.deepEqual(secondRun.itemInternalNames, firstRun.itemInternalNames);
});

test('sample mode writes progress before probe metadata and probes only sampled titles', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-sample-probe-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');
    const sampleItems = buildSampleItems();

    fs.mkdirSync(worktreeRoot, { recursive: true });
    writeItemsInput(inputPath, sampleItems);
    writeMockItemPageApi(mockApiPath, sampleItems);

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--probe-only=true',
      '--sample-size=1',
      '--sample-seed=metadata-smoke',
      '--limit=5',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-sample-probe',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(fs.existsSync(progressPath), true);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const report = readOnlyJsonReport(reportDir);
    assert.equal(report.probeOnly, true);
    assert.equal(report.sampled, true);
    assert.equal(report.sampleSize, 1);
    assert.equal(report.sampleSeed, 'metadata-smoke');
    assert.equal(report.candidateCountBeforeSample, 5);
    assert.equal(report.sampleCandidateCount, 1);
    assert.equal(report.selectedCount, 1);
    assert.equal(report.items.length, 1);
    assert.equal(fs.readdirSync(rawDir).filter((entry) => entry.endsWith('.latest.json')).length, 0);

    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.status, 'completed');
    assert.equal(progress.total, 1);
});

test('sample mode applies sampling before offset and limit', () => {
    const fullSample = runSampleFetchInTemp({
      sampleSize: 5,
      sampleSeed: 'sample-before-limit',
      limit: 5
    });
    assert.equal(fullSample.status, 0, fullSample.stderr || fullSample.stdout);

    const slicedSample = runSampleFetchInTemp({
      sampleSize: 5,
      sampleSeed: 'sample-before-limit',
      offset: 2,
      limit: 1
    });
    assert.equal(slicedSample.status, 0, slicedSample.stderr || slicedSample.stdout);
    assert.deepEqual(slicedSample.itemInternalNames, [fullSample.itemInternalNames[2]]);
});

test('sample mode rejects sample sizes above the crawler smoke cap', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-sample-cap-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    writeItemsInput(inputPath, buildSampleItems());

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--sample-size=101',
      '--sample-seed=too-large',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-sample-cap'
      }
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample-size.*100/i);
});

test('sample mode rejects reports under domain acceptance evidence directories', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-sample-domain-report-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(worktreeRoot, 'reports', 'domain', 'items', 'sample-smoke');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    writeItemsInput(inputPath, buildSampleItems());

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--sample-size=2',
      '--sample-seed=domain-evidence',
      '--only-changed=false',
      '--limit=5',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-sample-domain-report'
      }
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reports[\/\\]domain/i);
    assert.equal(fs.existsSync(reportDir), false);
});

test('sample mode writes failed progress when sampled remote metadata fails', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-sample-failed-progress-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    writeItemsInput(inputPath, buildSampleItems());
    fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: {} }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--probe-only=true',
      '--sample-size=1',
      '--sample-seed=metadata-fails',
      '--limit=5',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-sample-failed-progress',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(progressPath), true);
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.actionId, 'test-item-pages-sample-failed-progress');
    assert.equal(progress.status, 'failed');
    assert.equal(progress.phase, 'error');
    assert.equal(progress.total, 1);
    assert.match(progress.message, /Missing mock wiki API response/);
});

test('probe-only writes changed page report without raw item page payloads', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-probe-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'miningpotion.latest.json'), JSON.stringify({
      itemInternalName: 'MiningPotion',
      revisionTimestamp: '2026-01-01T00:00:00Z'
    }), 'utf8');
    fs.writeFileSync(mockApiPath, JSON.stringify({
      query: {
        pages: [{
          pageid: 123,
          title: 'Mining Potion',
          revisions: [{ revid: 456, timestamp: '2026-05-20T00:00:00Z' }]
        }]
      }
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--probe-only=true',
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-probe',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Probe only: true/);
    assert.equal(fs.existsSync(path.join(rawDir, 'miningpotion.2026-05-20T00-00-00.000Z.json')), false);
    assert.equal(fs.readdirSync(rawDir).filter((entry) => entry !== 'miningpotion.latest.json').length, 0);

    const reportFiles = fs.readdirSync(reportDir).filter((entry) => entry.endsWith('.json'));
    assert.equal(reportFiles.length, 1);
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, reportFiles[0]), 'utf8'));
    assert.equal(report.probeOnly, true);
    assert.equal(report.onlyChanged, false);
    assert.equal(report.changedCount, 1);
    assert.equal(report.items[0].internalName, 'MiningPotion');
    assert.equal(report.items[0].reason, 'source_changed');
});

test('item page fetcher does not keep timestamp snapshots by default', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-no-snapshot-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');
    fs.writeFileSync(mockApiPath, JSON.stringify({
      parse: {
        pageid: 123,
        title: 'Mining Potion',
        wikitext: 'Mining Potion page',
        text: '<p>Mining Potion page</p>',
        sections: []
      },
      query: {
        pages: [{
          pageid: 123,
          title: 'Mining Potion',
          revisions: [{ revid: 456, timestamp: '2026-05-20T00:00:00Z' }]
        }]
      }
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--items=MiningPotion',
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-no-snapshot',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(fs.readdirSync(rawDir).sort(), ['miningpotion.latest.json']);

    const reportFile = fs.readdirSync(reportDir).find((entry) => entry.endsWith('.json'));
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), 'utf8'));
    assert.equal(report.items[0].latestPath.endsWith('miningpotion.latest.json'), true);
    assert.equal(report.items[0].snapshotPath, null);
});

test('item page fetcher keeps timestamp snapshots when explicitly requested', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-keep-snapshot-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');
    fs.writeFileSync(mockApiPath, JSON.stringify({
      parse: {
        pageid: 123,
        title: 'Mining Potion',
        wikitext: 'Mining Potion page',
        text: '<p>Mining Potion page</p>',
        sections: []
      },
      query: {
        pages: [{
          pageid: 123,
          title: 'Mining Potion',
          revisions: [{ revid: 456, timestamp: '2026-05-20T00:00:00Z' }]
        }]
      }
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--items=MiningPotion',
      '--limit=1',
      '--only-changed=false',
      '--keep-snapshot=true',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-keep-snapshot',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const files = fs.readdirSync(rawDir).sort();
    assert.equal(files.includes('miningpotion.latest.json'), true);
    assert.equal(files.filter((entry) => /^miningpotion\.\d{4}-\d{2}-\d{2}T.*\.json$/.test(entry)).length, 1);

    const reportFile = fs.readdirSync(reportDir).find((entry) => entry.endsWith('.json'));
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), 'utf8'));
    assert.match(report.items[0].snapshotPath, /miningpotion\.\d{4}-\d{2}-\d{2}T.*\.json$/);
});

test('item page probe writes redis heartbeat when redis-cli is available', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-heartbeat-'));
    const binDir = path.join(tempDir, 'bin');
    const redisLog = path.join(tempDir, 'redis-cli-args.jsonl');
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');
    const mockApiPath = path.join(tempDir, 'mock-api.json');

    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'redis-cli'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(redisLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o755 });
    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(inputPath, JSON.stringify({
      items: [{ internalName: 'MiningPotion', name: 'Mining Potion' }]
    }), 'utf8');
    fs.writeFileSync(mockApiPath, JSON.stringify({
      query: {
        pages: [{
          pageid: 123,
          title: 'Mining Potion',
          revisions: [{ revid: 456, timestamp: '2026-05-20T00:00:00Z' }]
        }]
      }
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--probe-only=true',
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-heartbeat',
        TERRAPEDIA_REDIS_HOST: '127.0.0.1',
        TERRAPEDIA_REDIS_PORT: '6380',
        TERRAPEDIA_REDIS_DATABASE: '0',
        NODE_ENV: 'test',
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const calls = fs.readFileSync(redisLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => {
      return args.includes('SETEX')
        && args.includes('terrapedia:crawler:items:heartbeat')
        && args.includes('300')
        && args.some((arg) => String(arg).includes('"status":"running"'));
    }));
    assert.ok(calls.some((args) => args.some((arg) => String(arg).includes('"status":"completed"'))));
});

test('item page fetch writes failed redis heartbeat before exiting on startup error', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-heartbeat-failed-'));
    const binDir = path.join(tempDir, 'bin');
    const redisLog = path.join(tempDir, 'redis-cli-args.jsonl');
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const inputPath = path.join(tempDir, 'missing-items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'redis-cli'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(redisLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
`, { mode: 0o755 });
    fs.mkdirSync(worktreeRoot, { recursive: true });

    const result = spawnSync(process.execPath, [
      scriptPath,
      `--input=${inputPath}`,
      `--raw-dir=${rawDir}`,
      `--report-dir=${reportDir}`,
      `--progress-path=${progressPath}`,
      '--limit=1',
      '--only-changed=false',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        WORKTREE_ROOT: worktreeRoot,
        TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-heartbeat-failed',
        TERRAPEDIA_REDIS_HOST: '127.0.0.1',
        TERRAPEDIA_REDIS_PORT: '6380',
        TERRAPEDIA_REDIS_DATABASE: '0'
      }
    });

    assert.notEqual(result.status, 0);
    const calls = fs.readFileSync(redisLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => {
      return args.includes('SETEX')
        && args.includes('terrapedia:crawler:items:heartbeat')
        && args.some((arg) => String(arg).includes('"status":"failed"'));
    }));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSampleItems() {
  return [
    { internalName: 'SampleItemAlpha', name: 'Sample Item Alpha' },
    { internalName: 'SampleItemBeta', name: 'Sample Item Beta' },
    { internalName: 'SampleItemGamma', name: 'Sample Item Gamma' },
    { internalName: 'SampleItemDelta', name: 'Sample Item Delta' },
    { internalName: 'SampleItemEpsilon', name: 'Sample Item Epsilon' }
  ];
}

function writeItemsInput(inputPath, items) {
  fs.writeFileSync(inputPath, JSON.stringify({ items }), 'utf8');
}

function writeMockItemPageApi(mockApiPath, items) {
  const byRequest = {};
  items.forEach((item, index) => {
    byRequest[`parse:*:${item.name}`] = {
      parse: {
        pageid: 1000 + index,
        title: item.name,
        wikitext: `${item.name} page`,
        text: `<p>${item.name} page</p>`,
        sections: []
      }
    };
    byRequest[`query:revisions:${item.name}`] = {
      query: {
        pages: [{
          pageid: 1000 + index,
          title: item.name,
          revisions: [{ revid: 2000 + index, timestamp: `2026-05-${20 + index}T00:00:00Z` }]
        }]
      }
    };
  });
  fs.writeFileSync(mockApiPath, JSON.stringify({ __byRequest: byRequest }), 'utf8');
}

function runSampleFetchInTemp({ sampleSize, sampleSeed, offset = 0, limit = 5 }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-repeatable-sample-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const inputPath = path.join(tempDir, 'items.json');
  const rawDir = path.join(tempDir, 'raw');
  const reportDir = path.join(tempDir, 'reports');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  const sampleItems = buildSampleItems();

  fs.mkdirSync(worktreeRoot, { recursive: true });
  writeItemsInput(inputPath, sampleItems);
  writeMockItemPageApi(mockApiPath, sampleItems);

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--input=${inputPath}`,
    `--raw-dir=${rawDir}`,
    `--report-dir=${reportDir}`,
    `--progress-path=${progressPath}`,
    `--sample-size=${sampleSize}`,
    `--sample-seed=${sampleSeed}`,
    '--only-changed=false',
    `--offset=${offset}`,
    `--limit=${limit}`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-item-pages-repeatable-sample',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  const report = result.status === 0 ? readOnlyJsonReport(reportDir) : null;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    itemInternalNames: report?.items?.map((item) => item.itemInternalName) ?? []
  };
}

function readOnlyJsonReport(reportDir) {
  const reportFiles = fs.readdirSync(reportDir).filter((entry) => entry.endsWith('.json'));
  assert.equal(reportFiles.length, 1);
  return JSON.parse(fs.readFileSync(path.join(reportDir, reportFiles[0]), 'utf8'));
}
