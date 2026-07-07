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

test('boss resume retries a record that crashed after partial write before markCompleted', () => {
  const ctx = createTempFixture();

  const first = runScript(ctx, {
    resumeMode: 'fresh',
    crashPoint: 'after-partial-before-mark',
    crashAfter: 1
  });

  assert.notEqual(first.status, 0);
  assert.equal(readJson(ctx.partialPath)['King Slime'].pageTitleEn, 'King Slime');
  assert.equal(readJson(ctx.statePath).completedKeys.includes('King Slime'), false);

  const second = runScript(ctx, { resumeMode: 'resume' });

  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.sort(), ['Eye of Cthulhu', 'King Slime']);
  const payload = readJson(ctx.outputPath);
  assert.deepEqual(payload.records.map((record) => record.pageTitleEn), ['King Slime', 'Eye of Cthulhu']);
});

test('boss resume skips a record that crashed after markCompleted and keeps failed progress accurate', () => {
  const ctx = createTempFixture();

  const first = runScript(ctx, {
    resumeMode: 'fresh',
    crashPoint: 'after-mark',
    crashAfter: 1
  });

  assert.notEqual(first.status, 0);
  assert.deepEqual(readJson(ctx.statePath).completedKeys, ['King Slime']);
  assert.equal(readJson(ctx.progressPath).resume.completed, 1);

  const second = runScript(ctx, { resumeMode: 'resume' });

  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.sort(), ['Eye of Cthulhu', 'King Slime']);
  const progress = readJson(ctx.progressPath);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.resume.completed, 2);
  assert.equal(progress.resume.total, 2);
});

test('boss resume rejects changed boss seed set while auto downgrades fresh', () => {
  const ctx = createTempFixture();
  const first = runScript(ctx, { resumeMode: 'fresh' });
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const changedMockPath = writeBossMock(ctx.tempDir, {
    bosses: ['King Slime', 'Queen Bee']
  });
  const resume = runScript(ctx, {
    resumeMode: 'resume',
    mockApiPath: changedMockPath
  });

  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /resume 校验失败\(fingerprint-mismatch\)/);

  const auto = runScript(ctx, {
    resumeMode: 'auto',
    mockApiPath: changedMockPath
  });

  assert.equal(auto.status, 0, auto.stderr || auto.stdout);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.sort(), ['King Slime', 'Queen Bee']);
  assert.equal(readJson(ctx.partialPath)['Eye of Cthulhu'], undefined);
});

test('boss page fetch failure is not marked complete and can be retried', () => {
  const ctx = createTempFixture();
  const failingMockPath = writeBossMock(ctx.tempDir, {
    failRenderedHtmlFor: ['King Slime']
  });

  const first = runScript(ctx, {
    resumeMode: 'fresh',
    mockApiPath: failingMockPath
  });

  assert.notEqual(first.status, 0);
  assert.equal(readJson(ctx.partialPath)['King Slime'], undefined);
  assert.deepEqual(readJson(ctx.statePath).completedKeys, ['Eye of Cthulhu']);
  const failedProgress = readJson(ctx.progressPath);
  assert.equal(failedProgress.status, 'failed');
  assert.equal(failedProgress.resume.completed, 1);
  assert.equal(failedProgress.resume.total, 2);

  const second = runScript(ctx, { resumeMode: 'resume' });

  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.deepEqual(readJson(ctx.statePath).completedKeys.sort(), ['Eye of Cthulhu', 'King Slime']);
});

test('boss resume rejects incomplete ok partial records', () => {
  const ctx = createTempFixture();
  const first = runScript(ctx, { resumeMode: 'fresh' });
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const partial = readJson(ctx.partialPath);
  partial['King Slime'] = { pageTitleEn: 'King Slime', status: 'ok' };
  fs.writeFileSync(ctx.partialPath, JSON.stringify(partial), 'utf8');

  const resume = runScript(ctx, { resumeMode: 'resume' });

  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /resume 校验失败\(partial-invalid-record\)/);
});

test('boss source declares resume CLI and default state path contract', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /options\['resume-mode'\]/);
  assert.match(source, /options\['resume-state'\]/);
  assert.match(source, /DEFAULT_RESUME_STATE_PATH/);
  assert.match(source, /domain-source-bosses\.resume\.json/);
  assert.match(source, /derivePartialPath/);
  assert.match(source, /buildResumeProgressFields/);
});

function createTempFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-resume-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  const statePath = path.join(worktreeRoot, 'data', 'generated', 'resume', 'domain-source-bosses.resume.json');
  return {
    tempDir,
    worktreeRoot,
    statePath,
    partialPath: statePath.replace(/\.resume\.json$/, '.partial.json'),
    progressPath: path.join(tempDir, 'progress.json'),
    outputPath: path.join(tempDir, 'out', 'wiki-bosses.latest.json'),
    reportPath: path.join(tempDir, 'reports', 'wiki-bosses-fetch.json'),
    mockApiPath: writeBossMock(tempDir)
  };
}

function runScript(ctx, {
  resumeMode,
  crashPoint = null,
  crashAfter = null,
  mockApiPath = ctx.mockApiPath
} = {}) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    WORKTREE_ROOT: ctx.worktreeRoot,
    TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
  };
  if (crashPoint) {
    env.TERRAPEDIA_BOSS_ENABLE_CRASH_HOOK = '1';
    env.TERRAPEDIA_BOSS_CRASH_POINT = crashPoint;
    env.TERRAPEDIA_BOSS_CRASH_AFTER = String(crashAfter ?? 1);
  }
  return spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${ctx.progressPath}`,
    `--output-json=${ctx.outputPath}`,
    `--report-json=${ctx.reportPath}`,
    `--resume-mode=${resumeMode}`,
    `--resume-state=${ctx.statePath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env
  });
}

function writeBossMock(tempDir, { bosses = ['King Slime', 'Eye of Cthulhu'], failRenderedHtmlFor = [] } = {}) {
  const failureSuffix = failRenderedHtmlFor.length > 0
    ? `-fail-${failRenderedHtmlFor.join('-').replaceAll(/\W+/g, '-')}`
    : '';
  const mockPath = path.join(tempDir, `mock-api-${bosses.join('-').replaceAll(/\W+/g, '-')}${failureSuffix}.json`);
  const failingHtml = new Set(failRenderedHtmlFor);
  const sections = [{ level: '2', line: 'Pre-Hardmode bosses' }];
  for (const boss of bosses) {
    sections.push({ level: '3', line: boss });
  }
  const byRequest = {
    'parse:sections:Bosses': {
      parse: {
        title: 'Bosses',
        pageid: 10,
        sections
      }
    }
  };
  for (const [index, boss] of bosses.entries()) {
    byRequest[`query:revisions|langlinks:${boss}`] = {
      query: {
        pages: [{
          pageid: 20 + index,
          title: boss,
          langlinks: [{ lang: 'zh', title: `${boss} zh` }],
          revisions: [{ revid: 30 + index, timestamp: '2026-05-20T00:00:00Z' }]
        }]
      }
    };
    if (!failingHtml.has(boss)) {
      byRequest[`parse:text:${boss}`] = {
        parse: {
          text: `<div class="section images"><img src="/images/${boss.replaceAll(' ', '_')}.png" /></div><p>${boss} is a boss encountered during progression with enough description text for extraction.</p>`
        }
      };
    }
  }
  fs.writeFileSync(mockPath, JSON.stringify({ __byRequest: byRequest }), 'utf8');
  return mockPath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
