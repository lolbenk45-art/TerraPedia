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
const scriptPath = path.join(__dirname, 'fetch-wiki-shimmer-page.mjs');

test('shimmer fetch publishes three real request steps and a fetched result', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'shimmer.json');
  const reportPath = path.join(tempDir, 'shimmer.md');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(mockApiPath, JSON.stringify({
    __byRequest: {
      'query:revisions:Shimmer': {
        query: {
          pages: [{
            pageid: 42,
            title: 'Shimmer',
            revisions: [{
              revid: 1001,
              timestamp: '2026-07-16T00:00:00Z',
              content: 'Shimmer source'
            }]
          }]
        }
      },
      'parse:sections:Shimmer': {
        parse: { sections: [{ number: '1', level: '2', line: 'Notes' }] }
      },
      'parse:text:Shimmer': {
        parse: { text: '<p>Shimmer rendered source.</p>' }
      }
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--page=Shimmer',
    `--output=${outputPath}`,
    `--report-output=${reportPath}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-shimmer');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.plannedCount, 3);
  assert.equal(progress.actualCount, 3);
  assert.equal(progress.skippedCount, 0);
  assert.equal(progress.failedCount, 0);
  assert.equal(progress.estimatedRequests, 3);
  assert.equal(progress.estimatedRecords, null);
  assert.equal(progress.resultKind, 'fetched');
  assert.equal(progress.resumeOutcome, 'not_supported');
});

test('shimmer failure preserves completed request steps in terminal progress', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-failure-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'shimmer.json');
  const reportPath = path.join(tempDir, 'shimmer.md');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(mockApiPath, JSON.stringify({
    __byRequest: {
      'query:revisions:Shimmer': {
        query: {
          pages: [{
            pageid: 42,
            title: 'Shimmer',
            revisions: [{ revid: 1001, timestamp: '2026-07-16T00:00:00Z', content: 'Shimmer source' }]
          }]
        }
      }
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--page=Shimmer',
    `--output=${outputPath}`,
    `--report-output=${reportPath}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.notEqual(result.status, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.current, 1);
  assert.equal(progress.actualCount, 1);
  assert.equal(progress.failedCount, 2);
});
