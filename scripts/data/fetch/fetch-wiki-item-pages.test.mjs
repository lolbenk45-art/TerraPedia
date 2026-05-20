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
      '--delay-ms=0',
      '--jitter-ms=0'
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
      '--delay-ms=0',
      '--jitter-ms=0'
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
      '--delay-ms=0',
      '--jitter-ms=0'
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
      '--delay-ms=0',
      '--jitter-ms=0'
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
      '--delay-ms=0',
      '--jitter-ms=0'
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
