import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  NPC_CRAWLER_FACT_ACTION_IDS,
  resolveNpcCrawlerFactProgressPath,
  runGovernedNpcCrawlerPreview,
  runNpcCrawlerFactAction,
} from './npc-crawler-fact-action.mjs';

function tempWorktree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-crawler-fact-action-'));
}

test('NPC crawler-fact actions expose the exact preview/apply pair', () => {
  assert.deepEqual(NPC_CRAWLER_FACT_ACTION_IDS, {
    preview: 'npc-crawler-facts-preview',
    apply: 'npc-crawler-facts-apply',
  });
});

test('default progress path is isolated under WORKTREE_ROOT and uses backend child-status shape', () => {
  const worktreeRoot = tempWorktree();
  const progressPath = resolveNpcCrawlerFactProgressPath({
    actionId: NPC_CRAWLER_FACT_ACTION_IDS.preview,
    env: { WORKTREE_ROOT: worktreeRoot },
  });
  assert.equal(progressPath, path.join(
    worktreeRoot,
    'reports/backend-refresh/history/npc-crawler-facts.runtime',
    'npc-crawler-facts-preview.child-status.json',
  ));
});

test('action publishes running before work, heartbeat, and completed terminal progress', async () => {
  const progressPath = path.join(tempWorktree(), 'attempt', 'child-status.json');
  let initialDuringWork;
  let heartbeatDuringWork;
  const result = await runNpcCrawlerFactAction({
    actionId: NPC_CRAWLER_FACT_ACTION_IDS.preview,
    progressPath,
    heartbeatIntervalMs: 5,
    execute: async () => {
      initialDuringWork = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, 25));
      heartbeatDuringWork = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      return { current: 4, total: 4, phase: 'verify', message: 'NPC crawler facts verified' };
    },
  });

  assert.equal(initialDuringWork.status, 'running');
  assert.equal(initialDuringWork.current, 0);
  assert.equal(initialDuringWork.total, 4);
  assert.notEqual(heartbeatDuringWork.lastHeartbeatAt, initialDuringWork.lastHeartbeatAt);
  const final = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(final.status, 'completed');
  assert.equal(final.actionId, NPC_CRAWLER_FACT_ACTION_IDS.preview);
  assert.equal(final.childStatusPath, progressPath);
  assert.equal(final.current, 4);
  assert.equal(final.total, 4);
  assert.equal(result.status, 'completed');
});

test('action writes failed terminal progress and rethrows the owning error', async () => {
  const progressPath = path.join(tempWorktree(), 'attempt', 'child-status.json');
  await assert.rejects(() => runNpcCrawlerFactAction({
    actionId: NPC_CRAWLER_FACT_ACTION_IDS.apply,
    progressPath,
    execute: async () => { throw new Error('NPC fact projection failed'); },
  }), /projection failed/);

  const final = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(final.status, 'failed');
  assert.equal(final.actionId, NPC_CRAWLER_FACT_ACTION_IDS.apply);
  for (const field of [
    'actionId', 'status', 'generatedAt', 'lastHeartbeatAt', 'childStatusPath',
    'phase', 'message', 'current', 'total',
  ]) assert.ok(Object.hasOwn(final, field), `missing progress field: ${field}`);
});

test('governed preview requires a bounded targets file and invokes the real crawler batch with fanout writes', async () => {
  const worktreeRoot = tempWorktree();
  const targetsFile = path.join(worktreeRoot, 'coverage-audit.latest.json');
  fs.writeFileSync(targetsFile, JSON.stringify({ eligibleBatchTargets: [{ pageTitle: 'Merchant' }] }));
  let observedArgs;
  const progress = [];

  const result = await runGovernedNpcCrawlerPreview({
    repoRoot: worktreeRoot,
    targetsFile,
    targetPriority: 'P0',
    limit: 10,
    outputRoot: path.join(worktreeRoot, 'data/wiki-crawler'),
    publishProgress: (value) => progress.push(value),
    runCliImpl: async (args) => {
      observedArgs = args;
      return { summary: { total: 1, pass: 1, warn: 0, fail: 0 }, reportPath: 'batch.json' };
    },
  });

  assert.deepEqual(observedArgs, [
    'batch',
    '--domain=npc',
    `--targets-file=${targetsFile}`,
    '--target-priority=P0',
    '--limit=10',
    '--write-files',
    `--output-root=${path.join(worktreeRoot, 'data/wiki-crawler')}`,
  ]);
  assert.equal(result.current, 1);
  assert.equal(result.total, 1);
  assert.ok(progress.some((value) => value.phase === 'crawl'));

  await assert.rejects(() => runGovernedNpcCrawlerPreview({
    repoRoot: worktreeRoot,
    targetsFile,
    limit: 0,
    runCliImpl: async () => ({}),
  }), /positive bounded limit/i);
});
