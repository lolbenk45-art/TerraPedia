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
const defaultProgressPath = path.join(repoRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

test('writes child progress and report to explicit paths when no item pages are selected', () => {
  withPreservedFile(defaultProgressPath, () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-fetch-items-'));
    const inputPath = path.join(tempDir, 'items.json');
    const rawDir = path.join(tempDir, 'raw');
    const reportDir = path.join(tempDir, 'reports');
    const progressPath = path.join(tempDir, 'progress.json');

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
});

test('default fetch progress path follows WORKTREE_ROOT when progress path is omitted', () => {
  withPreservedFile(defaultProgressPath, () => {
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
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withPreservedFile(filePath, task) {
  const existed = fs.existsSync(filePath);
  const previous = existed ? fs.readFileSync(filePath) : null;
  try {
    task();
  } finally {
    if (existed) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, previous);
    } else {
      fs.rmSync(filePath, { force: true });
    }
  }
}
