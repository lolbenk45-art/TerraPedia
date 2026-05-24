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
const scriptPath = path.join(__dirname, 'fetch-wiki-armor-sets.mjs');

test('armor set source fetch writes completed progress to default canonical path with mock wiki payload', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-armor-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const outputDir = path.join(tempDir, 'generated');
  const mockApiPath = writeArmorMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([`--output-dir=${outputDir}`], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-armor-sets-progress.latest.json');
  const outputPath = path.join(outputDir, 'wiki-armor-sets.latest.json');
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-armor-sets',
    status: 'completed',
    childStatusPath: progressPath,
    outputPath
  });
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
});

test('armor set source fetch honors explicit progress path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-armor-custom-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const progressPath = path.join(tempDir, 'custom-progress.json');
  const outputDir = path.join(tempDir, 'generated');
  const mockApiPath = writeArmorMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });

  const result = runScript([
    `--output-dir=${outputDir}`,
    `--progress-path=${progressPath}`
  ], {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = readJson(progressPath);
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-armor-sets-progress.latest.json');
  const canonicalProgress = readJson(canonicalProgressPath);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);
  assert.equal(progress.outputPath, path.join(outputDir, 'wiki-armor-sets.latest.json'));
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(canonicalProgress.childStatusPath, canonicalProgressPath);
  assert.equal(canonicalProgress.outputPath, path.join(outputDir, 'wiki-armor-sets.latest.json'));
});

test('armor set source fetch writes failed progress when mock wiki payload errors via env progress path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-armor-env-progress-'));
  const progressPath = path.join(tempDir, 'env-progress.json');
  const outputDir = path.join(tempDir, 'generated');

  const result = runScript([`--output-dir=${outputDir}`], {
    TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: path.join(tempDir, 'missing-mock.json')
  });

  assert.notEqual(result.status, 0);
  const progress = readJson(progressPath);
  assertProgressContract(progress, {
    actionId: 'domain-source-armor-sets',
    status: 'failed',
    childStatusPath: progressPath,
    outputPath: path.join(outputDir, 'wiki-armor-sets.latest.json')
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
  assert.equal(progress.reportPath, null);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeArmorMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    parse: {
      title: '盔甲',
      pageid: 101,
      wikitext: `
== [[{{tr|Pre-Hardmode}}]] ==
{| class="terraria lined"
|-
| [[File:Wood armor.png|link=]]
| {{item|mode=text|wrap=y|Wood armor}}
|}
== [[{{tr|Hardmode}}]] ==
`,
      text: `
<h3>困难模式之前</h3>
<table><tbody>
<tr><td><img alt="Wood armor.png" src="https://terraria.wiki.gg/images/Wood_armor.png" /></td><td><a title="木盔甲">木盔甲</a></td></tr>
</tbody></table>`,
      sections: []
    },
    query: {
      pages: [{
        pageid: 101,
        title: '盔甲',
        revisions: [{ timestamp: '2026-05-20T00:00:00Z' }]
      }]
    }
  }), 'utf8');
  return mockPath;
}
