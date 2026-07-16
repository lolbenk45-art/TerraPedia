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
const scriptPath = path.join(__dirname, 'fetch-wiki-town-npc-maintenance.mjs');

test('town NPC fetch publishes record work counts and fresh checkpoint outcome', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sourcePath = path.join(tempDir, 'npc-map.json');
  const htmlPath = path.join(tempDir, 'merchant.html');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'town-npcs.json');
  const reportPath = path.join(tempDir, 'town-npcs-report.json');
  const resumeStatePath = path.join(tempDir, 'town-npcs.resume.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    records: {
      17: {
        gameId: 17,
        internalName: 'Merchant',
        nameZh: '商人',
        rawJson: JSON.stringify({ name: 'Merchant', extras: { townNPC: true } })
      }
    }
  }), 'utf8');
  fs.writeFileSync(htmlPath, [
    '<html><body>',
    '<h1 id="firstHeading">商人</h1>',
    '<div class="mw-parser-output"><p>The Merchant is a town NPC who sells basic tools and supplies.</p></div>',
    '</body></html>'
  ].join(''), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${reportPath}`,
    `--progress-path=${progressPath}`,
    `--resume-state=${resumeStatePath}`,
    '--resume-mode=fresh',
    '--delay-ms=0',
    '--limit=1'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: htmlPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.plannedCount, 1);
  assert.equal(progress.actualCount, 1);
  assert.equal(progress.skippedCount, 0);
  assert.equal(progress.failedCount, 0);
  assert.equal(progress.estimatedRequests, null);
  assert.equal(progress.estimatedRecords, 1);
  assert.equal(progress.resultKind, 'fetched');
  assert.equal(progress.resumeOutcome, 'fresh');
});

test('town NPC completed progress reports page errors as failed work units', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-error-progress-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sourcePath = path.join(tempDir, 'npc-map.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const outputPath = path.join(tempDir, 'town-npcs.json');
  const reportPath = path.join(tempDir, 'town-npcs-report.json');
  const resumeStatePath = path.join(tempDir, 'town-npcs.resume.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    records: {
      17: {
        gameId: 17,
        internalName: 'Merchant',
        nameZh: '商人',
        rawJson: JSON.stringify({ name: 'Merchant', extras: { townNPC: true } })
      }
    }
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${reportPath}`,
    `--progress-path=${progressPath}`,
    `--resume-state=${resumeStatePath}`,
    '--resume-mode=fresh',
    '--delay-ms=0',
    '--limit=1'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: path.join(tempDir, 'missing.html')
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(output.summary.errorCount, 1);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.failedCount, 1);
});
