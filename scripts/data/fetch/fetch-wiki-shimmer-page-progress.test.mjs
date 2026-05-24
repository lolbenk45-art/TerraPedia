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

test('shimmer source fetch keeps default raw output path for transform compatibility', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /DEFAULT_OUTPUT_PATH\s*=\s*path\.join\(repoRoot,\s*'data',\s*'generated',\s*'wiki-shimmer\.latest\.json'\)/);
});

test('shimmer source fetch writes completed progress to default canonical path with mock wiki payload', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-shimmer-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const outputPath = path.join(tempDir, 'generated', 'shimmer', 'wiki-shimmer-manifest.latest.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-shimmer-summary.md');
  const mockApiPath = writeShimmerMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([
    `--output=${outputPath}`,
    `--report-output=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-shimmer-progress.latest.json');
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-shimmer',
    status: 'completed',
    childStatusPath: progressPath,
    outputPath,
    reportPath
  });
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 3);
});

test('shimmer source fetch honors explicit progress path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-shimmer-custom-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'custom-progress.json');
  const outputPath = path.join(tempDir, 'generated', 'wiki-shimmer.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-shimmer-summary.md');
  const mockApiPath = writeShimmerMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([
    `--progress-path=${progressPath}`,
    `--output=${outputPath}`,
    `--report-output=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = readJson(progressPath);
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-shimmer-progress.latest.json');
  const canonicalProgress = readJson(canonicalProgressPath);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);
  assert.equal(progress.outputPath, outputPath);
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(canonicalProgress.childStatusPath, canonicalProgressPath);
  assert.equal(canonicalProgress.outputPath, outputPath);
});

test('shimmer source fetch writes failed progress when mock wiki payload errors via env progress path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-shimmer-env-progress-'));
  const progressPath = path.join(tempDir, 'env-progress.json');
  const outputPath = path.join(tempDir, 'generated', 'wiki-shimmer.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-shimmer-summary.md');

  const result = runScript([
    `--output=${outputPath}`,
    `--report-output=${reportPath}`
  ], {
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: path.join(tempDir, 'missing-mock.json')
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-shimmer',
    status: 'failed',
    childStatusPath: progressPath,
    outputPath,
    reportPath
  });
  assert.match(progress.message, /ENOENT|no such file/i);
});

function runScript(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...env
    }
  });
}

function assertProgressContract(progress, expected) {
  for (const field of [
    'actionId',
    'status',
    'generatedAt',
    'lastHeartbeatAt',
    'childStatusPath',
    'phase',
    'message',
    'current',
    'total',
    'outputPath',
    'reportPath'
  ]) {
    assert.ok(Object.hasOwn(progress, field), `missing ${field}`);
  }
  assert.equal(progress.actionId, expected.actionId);
  assert.equal(progress.status, expected.status);
  assert.equal(progress.childStatusPath, expected.childStatusPath);
  assert.equal(progress.outputPath, expected.outputPath);
  assert.equal(progress.reportPath, expected.reportPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeShimmerMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    __byRequest: {
      'query:revisions:微光': {
        query: {
          pages: [{
            pageid: 777,
            title: '微光',
            revisions: [{
              revid: 888,
              timestamp: '2026-05-20T00:00:00Z',
              content: 'Mock shimmer wikitext'
            }]
          }]
        }
      },
      'parse:sections:微光': {
        parse: {
          sections: [{ number: '1', level: '2', line: 'Contents' }]
        }
      },
      'parse:text:微光': {
        parse: {
          text: '<p>Mock shimmer rendered HTML.</p>'
        }
      }
    }
  }), 'utf8');
  return mockPath;
}
