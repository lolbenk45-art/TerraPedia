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
const scriptPath = path.join(__dirname, 'fetch-wiki-bosses.mjs');

test('boss fetch publishes page work counts and fresh checkpoint outcome', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'bosses.json');
  const reportPath = path.join(tempDir, 'bosses-report.json');
  const resumeStatePath = path.join(tempDir, 'bosses.resume.json');
  const mockApiPath = path.join(tempDir, 'mock-api.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(mockApiPath, JSON.stringify({
    __byRequest: {
      'parse:sections:Bosses': {
        parse: {
          title: 'Bosses',
          pageid: 1,
          sections: [
            { level: '2', line: 'Pre-Hardmode bosses' },
            { level: '3', line: 'King Slime' }
          ]
        }
      },
      'query:revisions|langlinks:King Slime': {
        query: {
          pages: [{
            pageid: 2,
            title: 'King Slime',
            revisions: [{ revid: 3, timestamp: '2026-07-16T00:00:00Z' }],
            langlinks: [{ lang: 'zh', title: '史莱姆王' }]
          }]
        }
      },
      'parse:text:King Slime': {
        parse: { text: '<p>King Slime is an early-game boss with enough text for a stable source record.</p>' }
      }
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--output-json=${outputPath}`,
    `--report-json=${reportPath}`,
    `--progress-path=${progressPath}`,
    `--resume-state=${resumeStatePath}`,
    '--resume-mode=fresh',
    '--max-records=1'
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
  assert.equal(progress.actionId, 'domain-source-bosses');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.plannedCount, 1);
  assert.equal(progress.actualCount, 1);
  assert.equal(progress.skippedCount, 0);
  assert.equal(progress.failedCount, 0);
  assert.equal(progress.estimatedRequests, 3);
  assert.equal(progress.estimatedRecords, 1);
  assert.equal(progress.resultKind, 'fetched');
  assert.equal(progress.resumeOutcome, 'fresh');
});

test('boss discovery failure keeps the unknown plan null', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-discovery-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'bosses.json');
  const reportPath = path.join(tempDir, 'bosses-report.json');
  const resumeStatePath = path.join(tempDir, 'bosses.resume.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--output-json=${outputPath}`,
    `--report-json=${reportPath}`,
    `--progress-path=${progressPath}`,
    `--resume-state=${resumeStatePath}`,
    '--resume-mode=fresh'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: path.join(tempDir, 'missing-mock.json')
    }
  });

  assert.notEqual(result.status, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.total, null);
  assert.equal(progress.plannedCount, null);
  assert.equal(progress.estimatedRequests ?? null, null);
  assert.equal(progress.estimatedRecords ?? null, null);
});
