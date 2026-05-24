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

test('boss source fetch writes completed progress to default canonical path with mock wiki payload', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-bosses-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const outputPath = path.join(tempDir, 'out', 'wiki-bosses.latest.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-bosses-fetch.json');
  const mockApiPath = writeBossMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([
    `--output-json=${outputPath}`,
    `--report-json=${reportPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-bosses-progress.latest.json');
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-bosses',
    status: 'completed',
    childStatusPath: progressPath,
    outputPath,
    reportPath
  });
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
});

test('boss source fetch honors explicit progress path and fails before hydration when max-records cap is exceeded', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-bosses-cap-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'custom-progress.json');
  const outputPath = path.join(tempDir, 'out', 'wiki-bosses.latest.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-bosses-fetch.json');
  const mockApiPath = writeBossMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([
    `--progress-path=${progressPath}`,
    `--output-json=${outputPath}`,
    `--report-json=${reportPath}`,
    '--max-records=0'
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-bosses-progress.latest.json');
  const canonicalProgress = readJson(canonicalProgressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-bosses',
    status: 'failed',
    childStatusPath: progressPath,
    outputPath,
    reportPath
  });
  assertProgressContract(canonicalProgress, {
    actionId: 'domain-source-bosses',
    status: 'failed',
    childStatusPath: canonicalProgressPath,
    outputPath,
    reportPath
  });
  assert.equal(progress.phase, 'discover');
  assert.match(progress.message, /max-records/i);
  assert.equal(fs.existsSync(outputPath), false);
});

test('boss source fetch uses TERRAPEDIA_CRAWLER_PROGRESS_PATH when CLI progress path is absent', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-bosses-env-progress-'));
  const progressPath = path.join(tempDir, 'env-progress.json');
  const outputPath = path.join(tempDir, 'out', 'wiki-bosses.latest.json');
  const reportPath = path.join(tempDir, 'reports', 'wiki-bosses-fetch.json');
  const mockApiPath = writeBossMock(tempDir);

  const result = runScript([
    `--output-json=${outputPath}`,
    `--report-json=${reportPath}`
  ], {
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readJson(progressPath).status, 'completed');
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
  assert.match(progress.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof progress.message, 'string');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeBossMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    __byRequest: {
      'parse:sections:Bosses': {
        parse: {
          title: 'Bosses',
          pageid: 10,
          sections: [
            { level: '2', line: 'Pre-Hardmode bosses' },
            { level: '3', line: 'King Slime' }
          ]
        }
      },
      'query:revisions|langlinks:King Slime': {
        query: {
          pages: [{
            pageid: 20,
            title: 'King Slime',
            langlinks: [{ lang: 'zh', title: '史莱姆王' }],
            revisions: [{ revid: 30, timestamp: '2026-05-20T00:00:00Z' }]
          }]
        }
      },
      'parse:text:King Slime': {
        parse: {
          text: '<div class="section images"><img src="/images/King_Slime.png" /></div><p>King Slime is a pre-Hardmode boss encountered early in progression with enough description text for extraction.</p>'
        }
      }
    }
  }), 'utf8');
  return mockPath;
}
