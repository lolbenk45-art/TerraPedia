import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { derivePartialPath } from '../lib/crawler-resume-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-town-npc-maintenance.mjs');

function mockHtml() {
  return `<!DOCTYPE html><html><head>
    <script>var wgArticleId=1;var wgRevisionId=1;</script>
    <title>NPC</title></head>
    <body><div class="mw-parser-output"><p>intro</p></div></body></html>`;
}

function setup(seedIds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'town-npc-resume-'));
  const worktreeRoot = path.join(dir, 'wt');
  const sourcePath = path.join(dir, 'npc-standardized-map.json');
  const outputPath = path.join(dir, 'generated', 'wiki-town-npc-maintenance.latest.json');
  const snapshotPath = path.join(dir, 'reports', 'snapshot.json');
  const progressPath = path.join(dir, 'progress.json');
  const statePath = path.join(dir, 'resume', 'state.resume.json');
  const mockHtmlPath = path.join(dir, 'npc.html');
  const records = {};

  fs.mkdirSync(worktreeRoot, { recursive: true });
  for (const id of seedIds) {
    records[id] = {
      gameId: id,
      internalName: `Npc${id}`,
      nameZh: `角色${id}`,
      rawJson: JSON.stringify({ name: `Npc${id}`, extras: { townNPC: true } }),
    };
  }
  fs.writeFileSync(sourcePath, JSON.stringify({ records }), 'utf8');
  fs.writeFileSync(mockHtmlPath, mockHtml(), 'utf8');

  return { dir, worktreeRoot, sourcePath, outputPath, snapshotPath, progressPath, statePath, mockHtmlPath };
}

function run(ctx, extraArgs = [], extraEnv = {}) {
  const enableCrashHook = extraEnv.TERRAPEDIA_TOWN_NPC_CRASH_AFTER != null
    && extraEnv.TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK == null
    ? { TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '1' }
    : {};
  return spawnSync(process.execPath, [
    scriptPath,
    `--source=${ctx.sourcePath}`,
    `--output=${ctx.outputPath}`,
    `--snapshot-output=${ctx.snapshotPath}`,
    `--progress-path=${ctx.progressPath}`,
    `--resume-state=${ctx.statePath}`,
    '--delay-ms=0',
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: ctx.worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: '',
      ...enableCrashHook,
      ...extraEnv,
    },
  });
}

test('crash after mark writes partial, state, failed progress, and no tmp files', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });

  assert.notEqual(res.status, 0, 'crash injection should exit non-zero');
  const partial = JSON.parse(fs.readFileSync(derivePartialPath(ctx.statePath), 'utf8'));
  assert.deepEqual(Object.keys(partial).map(Number).sort((a, b) => a - b), [1, 2]);
  assert.equal(typeof partial[1].internalName, 'string');
  assert.equal(Array.isArray(partial[1].shopItems), true);
  assert.equal(Array.isArray(partial[1].livingPreferences), true);

  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2]);
  assert.equal(fs.readdirSync(path.dirname(ctx.statePath)).some((name) => name.endsWith('.tmp')), false);

  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'error');
  assert.match(progress.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(path.resolve(progress.childStatusPath), ctx.progressPath);
  assert.equal(progress.current, 2);
  assert.equal(progress.total, 3);
  assert.equal(path.resolve(progress.outputPath), ctx.outputPath);
  assert.equal(path.resolve(progress.reportPath), ctx.snapshotPath);
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.resume.completed, 2);
  assert.equal(progress.resume.total, 3);

  const canonicalProgressPath = path.join(ctx.worktreeRoot, 'data', 'generated', 'domain-source-town-npc-maintenance-progress.latest.json');
  const canonicalProgress = JSON.parse(fs.readFileSync(canonicalProgressPath, 'utf8'));
  assert.equal(canonicalProgress.status, 'failed');
  assert.equal(path.resolve(canonicalProgress.childStatusPath), canonicalProgressPath);
});

test('crash between partial write and markCompleted does not skip that record on resume', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], {
    TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2',
    TERRAPEDIA_TOWN_NPC_CRASH_POINT: 'after-partial-before-mark',
  });
  assert.notEqual(crash.status, 0, 'crash injection should exit non-zero');

  const partial = JSON.parse(fs.readFileSync(derivePartialPath(ctx.statePath), 'utf8'));
  assert.deepEqual(Object.keys(partial).map(Number).sort((a, b) => a - b), [1, 2]);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1]);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 3);

  const resumed = run(ctx, ['--resume-mode=resume']);
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
  const summary = JSON.parse(resumed.stdout);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.fetchedCount, 2);
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('resume rejects missing partial store and auto downgrades to fresh', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0, 'crash injection should exit non-zero');
  fs.rmSync(derivePartialPath(ctx.statePath), { force: true });

  const refused = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /resume 校验失败\(partial-missing-store\)/);

  const auto = run(ctx, ['--resume-mode=auto']);
  assert.equal(auto.status, 0, auto.stderr || auto.stdout);
  const summary = JSON.parse(auto.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
});

test('resume continues after crash and only fetches remaining records', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 2);
  assert.equal(summary.fetchedCount, 1);
  assert.equal(summary.scrapedCount, 3);

  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.equal(output.totalTownNpcs, 3);
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
  for (const row of output.records) {
    assert.equal(typeof row.internalName, 'string');
    assert.equal(typeof row.pageUrl, 'string');
    assert.equal(Array.isArray(row.shopItems), true);
    assert.equal(Array.isArray(row.livingPreferences), true);
  }

  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 3);
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.resume.completed, 3);
  assert.equal(progress.resume.total, 3);
});

test('resume assembles output without refetching when state and partial are complete', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '3' });
  assert.notEqual(crash.status, 0);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2, 3]);

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 3);
  assert.equal(summary.fetchedCount, 0);
  assert.equal(summary.scrapedCount, 3);
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('fresh ignores old state and resets partial store', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);

  const res = run(ctx, ['--resume-mode=fresh']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
  assert.equal(summary.scrapedCount, 3);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2, 3]);
});

test('resume rejects incomplete partial records and gameId mismatches', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);
  const partialPath = derivePartialPath(ctx.statePath);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  const validPartial = { ...partial };

  partial[2] = { gameId: 2 };
  fs.writeFileSync(partialPath, JSON.stringify(partial), 'utf8');
  const incomplete = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /resume 校验失败\(partial-invalid-record\)/);

  validPartial[2] = { ...validPartial[2], gameId: 999 };
  fs.writeFileSync(partialPath, JSON.stringify(validPartial), 'utf8');
  const mismatch = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /resume 校验失败\(partial-key-mismatch\)/);
});

test('resume rejects state completed keys outside current seed set and auto downgrades fresh', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);

  const partialPath = derivePartialPath(ctx.statePath);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  partial[999] = { ...partial[1], gameId: 999, internalName: 'StaleNpc' };
  fs.writeFileSync(partialPath, JSON.stringify(partial), 'utf8');
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  state.completedKeys.push(999);
  fs.writeFileSync(ctx.statePath, JSON.stringify(state), 'utf8');

  const refused = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /resume 校验失败\(completed-key-out-of-scope\)/);

  const auto = run(ctx, ['--resume-mode=auto']);
  assert.equal(auto.status, 0, auto.stderr || auto.stdout);
  const summary = JSON.parse(auto.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
});

test('resume ignores stale partial keys outside current seeds', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);
  const partialPath = derivePartialPath(ctx.statePath);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  partial[999] = { ...partial[1], gameId: 999, internalName: 'StaleNpc' };
  fs.writeFileSync(partialPath, JSON.stringify(partial), 'utf8');

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('invalid resume mode exits non-zero and writes failed resume progress', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, ['--resume-mode=bogus']);

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /resume 校验失败\(invalid-mode\)/);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.current, 0);
  assert.equal(progress.total, 3);
  assert.equal(progress.resume.mode, 'keyed_items');
});

test('default resume state path follows WORKTREE_ROOT', () => {
  const ctx = setup([1]);
  const res = spawnSync(process.execPath, [
    scriptPath,
    `--source=${ctx.sourcePath}`,
    `--output=${ctx.outputPath}`,
    `--snapshot-output=${ctx.snapshotPath}`,
    `--progress-path=${ctx.progressPath}`,
    '--delay-ms=0',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: ctx.worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: '',
    },
  });

  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.equal(fs.existsSync(path.join(ctx.worktreeRoot, 'data', 'generated', 'resume', 'domain-source-town-npc-maintenance.resume.json')), true);
  assert.equal(fs.existsSync(path.join(ctx.worktreeRoot, 'data', 'generated', 'resume', 'domain-source-town-npc-maintenance.partial.json')), true);
});

test('resume rejects changed seed set or descriptors while auto downgrades to fresh', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);

  const changedSet = setup([1, 2, 3, 4]);
  const resumeChangedSet = spawnWithState(changedSet, ctx.statePath, ['--resume-mode=resume']);
  assert.notEqual(resumeChangedSet.status, 0);
  assert.match(resumeChangedSet.stderr, /resume 校验失败\(fingerprint-mismatch\)/);

  const changedDescriptor = setup([1, 2, 3]);
  const payload = JSON.parse(fs.readFileSync(changedDescriptor.sourcePath, 'utf8'));
  payload.records[3].rawJson = JSON.stringify({ name: 'Npc3Renamed', extras: { townNPC: true } });
  fs.writeFileSync(changedDescriptor.sourcePath, JSON.stringify(payload), 'utf8');
  const resumeChangedDescriptor = spawnWithState(changedDescriptor, ctx.statePath, ['--resume-mode=resume']);
  assert.notEqual(resumeChangedDescriptor.status, 0);
  assert.match(resumeChangedDescriptor.stderr, /resume 校验失败\(fingerprint-mismatch\)/);

  const auto = spawnWithState(changedSet, ctx.statePath, ['--resume-mode=auto']);
  assert.equal(auto.status, 0, auto.stderr || auto.stdout);
  const summary = JSON.parse(auto.stdout);
  assert.equal(summary.fetchedCount, 4);
  assert.equal(summary.scrapedCount, 4);
  assert.equal(summary.skippedCount, 0);
});

test('default mode is fresh so ordinary reruns do not silently reuse old partial data', () => {
  const ctx = setup([1, 2, 3]);
  const first = run(ctx);
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const second = run(ctx);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  const summary = JSON.parse(second.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
  assert.equal(summary.scrapedCount, 3);
});

test('crash hook env is ignored unless explicitly enabled', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, [], {
    TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
    TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '1',
  });

  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.fetchedCount, 3);
  assert.equal(summary.skippedCount, 0);
});

function spawnWithState(ctx, statePath, extraArgs = []) {
  return spawnSync(process.execPath, [
    scriptPath,
    `--source=${ctx.sourcePath}`,
    `--output=${ctx.outputPath}`,
    `--snapshot-output=${ctx.snapshotPath}`,
    `--progress-path=${ctx.progressPath}`,
    `--resume-state=${statePath}`,
    '--delay-ms=0',
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: ctx.worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: '',
    },
  });
}
