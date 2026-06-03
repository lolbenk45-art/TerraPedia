import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildDefaultBackfillQueue,
  buildQueueProgressPayload,
  resolveItemResumeOffset,
  runCrawlerBackfillQueue
} from './run-crawler-backfill-queue.mjs';

test('buildDefaultBackfillQueue prioritizes small fetch lanes before item pages', () => {
  const queue = buildDefaultBackfillQueue({
    repoRoot: '/repo',
    sharedDataRoot: '/shared',
    itemStartOffset: 270,
    itemEndOffset: 470,
    itemBatchSize: 100
  });

  assert.deepEqual(queue.map((task) => task.id), [
    'armor-set-images',
    'town-npc-maintenance',
    'item-pages-0270',
    'item-pages-0370'
  ]);
  assert.deepEqual(queue[0].args.slice(0, 2), [
    'scripts/data/fetch/fetch-wiki-armor-set-images.mjs',
    '--input=/repo/data/standardized/armor_sets.standardized.json'
  ]);
  assert.equal(queue[0].env.TERRAPEDIA_CRAWLER_ACTION_ID, 'armor-set-images');
  assert.equal(queue[1].command, 'uv');
  assert.deepEqual(queue[1].args.slice(0, 4), ['run', '--with', 'beautifulsoup4', 'python3']);
  assert.equal(queue[1].args[4], 'scripts/data/fetch/fetch-wiki-town-npc-maintenance.py');
  assert.equal(queue[2].args.includes('--with-recipes=false'), true);
  assert.equal(queue[2].args.includes('--start-offset=270'), true);
  assert.equal(queue[2].args.includes('--end-offset=370'), true);
});

test('resolveItemResumeOffset advances from completed item progress', () => {
  assert.equal(resolveItemResumeOffset({
    status: 'completed',
    batchOffset: 170,
    batchLimit: 100,
    current: 100,
    total: 100,
    overallCurrent: 270
  }, 0), 270);
});

test('buildQueueProgressPayload writes monitor-visible queue state', () => {
  const payload = buildQueueProgressPayload({
    status: 'running',
    phase: 'queue',
    message: 'running armor-set-images',
    current: 1,
    total: 4,
    activeTaskId: 'armor-set-images',
    nextStep: 'town-npc-maintenance',
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    startedAt: '2026-06-03T00:00:00.000Z',
    now: '2026-06-03T00:01:00.000Z'
  });

  assert.equal(payload.actionId, 'crawler-backfill-queue');
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'queue');
  assert.equal(payload.current, 1);
  assert.equal(payload.total, 4);
  assert.equal(payload.activeTaskId, 'armor-set-images');
  assert.equal(payload.nextStep, 'town-npc-maintenance');
  assert.equal(payload.childStatusPath, 'data/generated/wiki-sync-progress.latest.json');
  assert.equal(payload.lastHeartbeatAt, '2026-06-03T00:01:00.000Z');
});

test('runCrawlerBackfillQueue writes queued/running/completed progress and stops on failure', async () => {
  const writes = [];
  const spawns = [];
  const result = await runCrawlerBackfillQueue({
    queue: [
      { id: 'ok-task', command: 'node', args: ['ok.mjs'], env: {} },
      { id: 'fail-task', command: 'node', args: ['fail.mjs'], env: {} },
      { id: 'never-task', command: 'node', args: ['never.mjs'], env: {} }
    ],
    repoRoot: '/repo',
    progressPath: '/repo/data/generated/wiki-sync-progress.latest.json',
    now: () => new Date(`2026-06-03T00:00:0${writes.length}.000Z`),
    writeJson: (filePath, payload) => writes.push({ filePath: path.normalize(filePath), payload }),
    spawnSync: (command, args) => {
      spawns.push([command, args]);
      return { status: args[0] === 'fail.mjs' ? 7 : 0 };
    }
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(spawns, [
    ['node', ['ok.mjs']],
    ['node', ['fail.mjs']]
  ]);
  assert.equal(writes.at(0).payload.status, 'queued');
  assert.equal(writes.some((entry) => entry.payload.activeTaskId === 'ok-task' && entry.payload.status === 'running'), true);
  assert.equal(writes.at(-1).payload.status, 'failed');
  assert.equal(writes.at(-1).payload.activeTaskId, 'fail-task');
  assert.match(writes.at(-1).payload.message, /failed fail-task exit=7/);
});
