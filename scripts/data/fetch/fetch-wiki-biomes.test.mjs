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
const scriptPath = path.join(__dirname, 'fetch-wiki-biomes.mjs');

test('biome fetch writes monitor progress to explicit and canonical paths', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biomes-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(tempDir, 'progress.json');
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');
  const mockApiPath = writeBiomeMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biomes-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-biomes-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'write');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
  assert.equal(progress.overallCurrent, 1);
  assert.equal(progress.overallTotal, 1);
  assert.match(progress.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
  assert.match(progress.outputPath, /wiki-biomes\.latest\.json$/);
  assert.match(progress.reportPath, /wiki-biomes-summary-\d{4}-\d{2}-\d{2}\.md$/);

  const canonicalProgress = JSON.parse(fs.readFileSync(canonicalProgressPath, 'utf8'));
  assert.equal(canonicalProgress.actionId, 'test-biomes-refresh');
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(path.resolve(canonicalProgress.childStatusPath), canonicalProgressPath);

  const output = JSON.parse(fs.readFileSync(path.join(worktreeRoot, 'data', 'generated', 'wiki-biomes.latest.json'), 'utf8'));
  assert.equal(output.records.length, 1);
  assert.equal(output.unresolved.length, 0);
});

test('default biome fetch progress path follows WORKTREE_ROOT when omitted', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-biomes-default-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');
  const mockApiPath = writeBiomeMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = spawnSync(process.execPath, [
    scriptPath
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_ACTION_ID: 'test-biomes-default-refresh',
      NODE_ENV: 'test',
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(progressPath), true);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'test-biomes-default-refresh');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
});

function writeBiomeMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    query: {
      pages: [{
        pageid: 101,
        title: 'Forest',
        revisions: [{
          revid: 202,
          timestamp: '2026-05-20T00:00:00Z',
          content: 'mock forest revision'
        }]
      }]
    },
    parse: {
      title: 'Biomes',
      pageid: 303,
      sections: [
        { level: '2', line: 'Surface and Underground' },
        { level: '3', line: 'Forest' }
      ],
      text: '<div class="mw-parser-output"><p>The Forest is the central surface biome.</p></div>'
    }
  }), 'utf8');
  return mockPath;
}
