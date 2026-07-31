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
  assert.equal(progress.estimatedRequests, 4);
  assert.equal(progress.estimatedRecords, 1);
  assert.equal(progress.resultKind, 'fetched');
  assert.equal(progress.resumeOutcome, 'fresh');
});

test('boss fetch records the Chinese intro alongside the English one', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-notes-zh-'));
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
            { level: '3', line: 'Eater of Worlds' }
          ]
        }
      },
      'query:revisions|langlinks:Eater of Worlds': {
        query: {
          pages: [{
            pageid: 2,
            title: 'Eater of Worlds',
            revisions: [{ revid: 3, timestamp: '2026-07-16T00:00:00Z' }],
            langlinks: [{ lang: 'zh', title: '世界吞噬怪' }]
          }]
        }
      },
      'parse:text:Eater of Worlds': {
        parse: { text: '<p>The Eater of Worlds is a pre-Hardmode worm boss with enough text for a stable source record.</p>' }
      },
      'parse:text:世界吞噬怪': {
        parse: {
          title: '世界吞噬怪',
          text: '<p><b>世界吞噬怪</b>是一个困难模式之前的蠕虫 Boss。它总共有 67 个体节。<sup class="reference"><a href="#cite_note-1">[1]</a></sup>。当任何身体体节被击杀时，它会分裂成多条更短的蠕虫。</p>'
        }
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
  const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const record = payload.records[0];

  assert.equal(record.titleZh, '世界吞噬怪');
  assert.match(record.notes, /^The Eater of Worlds is a pre-Hardmode worm boss/);
  assert.equal(
    record.notesZh,
    '世界吞噬怪是一个困难模式之前的蠕虫 Boss。它总共有 67 个体节。当任何身体体节被击杀时，它会分裂成多条更短的蠕虫。'
  );
});

test('boss fetch leaves the Chinese intro null when the page has no zh langlink', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-notes-zh-missing-'));
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
            revisions: [{ revid: 3, timestamp: '2026-07-16T00:00:00Z' }]
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
  const record = JSON.parse(fs.readFileSync(outputPath, 'utf8')).records[0];

  assert.equal(record.titleZh, null);
  assert.equal(record.notesZh, null);
});

test('boss fetch resolves celestial pillars through the shared zh page', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-boss-pillar-'));
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
            { level: '2', line: 'Event bosses' },
            { level: '3', line: 'Solar Pillar' }
          ]
        }
      },
      // The English pillar pages carry no zh langlink, which is exactly why the
      // shared-page mapping has to cover them.
      'query:revisions|langlinks:Solar Pillar': {
        query: {
          pages: [{
            pageid: 2,
            title: 'Solar Pillar',
            revisions: [{ revid: 3, timestamp: '2026-07-16T00:00:00Z' }]
          }]
        }
      },
      'parse:text:Solar Pillar': {
        parse: { text: '<p>The Solar Pillar is one of the four Celestial Pillars with enough text for a stable record.</p>' }
      },
      'parse:text:天界柱': {
        parse: {
          title: '天界柱',
          text: '<p><b>天界柱</b>（又称为月亮柱、月亮塔、或天界塔）是在月亮事件中当拜月教邪教徒被打败后出现的四个 Boss。</p>'
        }
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
  const record = JSON.parse(fs.readFileSync(outputPath, 'utf8')).records[0];

  assert.equal(record.titleZh, '日耀柱');
  assert.equal(record.pageTitleZh, '天界柱');
  assert.equal(record.sourceUrlZh, `https://terraria.wiki.gg/zh/wiki/${encodeURIComponent('日耀柱')}`);
  assert.equal(
    record.notesZh,
    '天界柱（又称为月亮柱、月亮塔、或天界塔）是在月亮事件中当拜月教邪教徒被打败后出现的四个 Boss。'
  );
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
