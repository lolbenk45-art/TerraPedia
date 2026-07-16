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
const scriptPath = path.join(__dirname, 'run-backend-data-refresh.mjs');

test('backend refresh runner preserves a real no-change child result in progress and report', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-backend-runner-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedDataRoot = path.join(tempDir, 'shared');
  const generatedRoot = path.join(sharedDataRoot, 'generated');
  const rawRoot = path.join(sharedDataRoot, 'raw', 'wiki');
  const outputPath = path.join(tempDir, 'backend-refresh.json');
  const localSourcePath = path.join(rawRoot, 'module__iteminfo__data.latest.json');
  const manifestPath = path.join(generatedRoot, 'wiki-source-manifest.latest.json');
  const monitorPath = path.join(generatedRoot, 'wiki-monitor-state.latest.json');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.mkdirSync(rawRoot, { recursive: true });
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(localSourcePath, JSON.stringify({
    moduleTitle: 'Module:Iteminfo/data',
    pageTitle: 'Module:Iteminfo/data',
    fetchedAt: '2026-07-16T00:00:00.000Z',
    revisionTimestamp: '2026-07-16T00:00:00.000Z',
    moduleContent: 'return { ["data"] = [=[{ "_terrariaversion": "1.4.4.9", "1": { "name": "Iron Pickaxe", "internalName": "IronPickaxe", "pick": 40, "maxStack": 1 } }]=] }'
  }), 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify({
    records: [{
      entityFamily: 'items',
      sourceKind: 'module',
      sourceKey: 'wiki.module.iteminfo',
      lang: 'en',
      pageTitle: 'Module:Iteminfo/data',
      requestedPageTitle: 'Module:Iteminfo/data',
      localPath: localSourcePath,
      revisionTimestamp: '2026-07-16T00:00:00.000Z',
      status: 'ok'
    }]
  }), 'utf8');
  fs.writeFileSync(monitorPath, JSON.stringify({
    requestedEntities: ['items'],
    sources: [{
      key: 'wiki.module.iteminfo',
      entityFamily: 'items',
      sourceKind: 'module',
      pageTitle: 'Module:Iteminfo/data',
      revisionTimestamp: '2026-07-16T00:00:00.000Z',
      changed: false,
      status: 'ok'
    }]
  }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--mode=apply',
    '--steps=wiki-items-refresh',
    `--output=${outputPath}`,
    '--heartbeat-ms=10'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const [action] = report.actions;
  assert.equal(action.id, 'wiki-items-refresh');
  assert.equal(action.status, 'completed');
  assert.equal(action.plannedCount, 0);
  assert.equal(action.actualCount, 0);
  assert.equal(action.skippedCount, 0);
  assert.equal(action.failedCount, 0);
  assert.equal(action.resultKind, 'no_change');
  assert.equal(action.resumeOutcome, 'not_supported');

  const progress = JSON.parse(fs.readFileSync(action.childStatusPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.resultKind, 'no_change');
  assert.equal(progress.plannedCount, 0);
  assert.equal(progress.actualCount, 0);
});
