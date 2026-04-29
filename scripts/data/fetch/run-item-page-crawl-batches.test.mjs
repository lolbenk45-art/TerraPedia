import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBatchPlan,
  buildFetchArgs,
  resolveResumeOffset
} from './run-item-page-crawl-batches.mjs';

test('buildBatchPlan creates bounded item page shards', () => {
  assert.deepEqual(buildBatchPlan({
    startOffset: 100,
    endOffset: 350,
    batchSize: 100
  }), [100, 200, 300]);
});

test('buildBatchPlan returns no shards when start is past end', () => {
  assert.deepEqual(buildBatchPlan({
    startOffset: 6200,
    endOffset: 6131,
    batchSize: 100
  }), []);
});

test('resolveResumeOffset restarts an unfinished progress batch', () => {
  const progress = {
    status: 'running',
    batchOffset: 100,
    batchLimit: 100,
    current: 88,
    total: 100,
    overallTotal: 6131
  };

  assert.equal(resolveResumeOffset({ progress, fallbackOffset: 0 }), 100);
});

test('resolveResumeOffset advances after a completed progress batch', () => {
  const progress = {
    status: 'completed',
    batchOffset: 100,
    batchLimit: 100,
    current: 100,
    total: 100,
    overallTotal: 6131
  };

  assert.equal(resolveResumeOffset({ progress, fallbackOffset: 0 }), 200);
});

test('buildFetchArgs forwards safe crawl defaults and batch identity', () => {
  const args = buildFetchArgs({
    offset: 300,
    batchSize: 100,
    concurrency: 1,
    onlyChanged: false,
    withRecipes: true,
    delayMs: 5000,
    jitterMs: 2000,
    maxAttempts: 8,
    progressPath: 'data/generated/wiki-sync-progress.latest.json'
  });

  assert.deepEqual(args, [
    'scripts/data/fetch/fetch-wiki-item-pages.mjs',
    '--offset=300',
    '--limit=100',
    '--concurrency=1',
    '--only-changed=false',
    '--with-recipes=true',
    '--delay-ms=5000',
    '--jitter-ms=2000',
    '--max-attempts=8',
    '--progress-path=data/generated/wiki-sync-progress.latest.json'
  ]);
});
