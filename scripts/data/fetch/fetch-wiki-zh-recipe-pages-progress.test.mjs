import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveRecipeCrawlerProgressPaths,
  runRecipeCrawlerWithProgress,
} from './fetch-wiki-zh-recipe-pages-progress.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recipe-progress-'));
}

test('recipe crawler defaults to the canonical monitor-visible progress path', () => {
  const repoRoot = tempRoot();
  assert.deepEqual(resolveRecipeCrawlerProgressPaths({ repoRoot, env: {} }), [
    path.join(repoRoot, 'data/generated/wiki-sync-progress.latest.json'),
  ]);
});

test('an explicit progress path is honored and mirrored to the canonical path', () => {
  const repoRoot = tempRoot();
  const explicit = path.join(repoRoot, 'attempt', 'recipe.child-status.json');
  assert.deepEqual(resolveRecipeCrawlerProgressPaths({
    repoRoot,
    explicitPath: explicit,
    env: {},
  }), [
    explicit,
    path.join(repoRoot, 'data/generated/wiki-sync-progress.latest.json'),
  ]);
});

test('recipe crawler publishes running before work, heartbeat, and completed terminal progress', async () => {
  const repoRoot = tempRoot();
  const paths = resolveRecipeCrawlerProgressPaths({ repoRoot, env: {} });
  let initialDuringWork;
  let heartbeatDuringWork;

  const result = await runRecipeCrawlerWithProgress({
    progressPaths: paths,
    total: 2,
    heartbeatIntervalMs: 60_000,
    execute: async ({ publishProgress }) => {
      initialDuringWork = JSON.parse(fs.readFileSync(paths[0], 'utf8'));
      publishProgress({ phase: 'crawl', message: 'fetched first page', current: 1, total: 2 });
      heartbeatDuringWork = JSON.parse(fs.readFileSync(paths[0], 'utf8'));
      return { current: 2, total: 2, outputPath: 'data/generated/wiki-zh-recipe-pages.latest.json' };
    },
  });

  assert.equal(initialDuringWork.status, 'running');
  assert.equal(initialDuringWork.current, 0);
  assert.equal(heartbeatDuringWork.current, 1);
  assert.equal(result.status, 'completed');
  const final = JSON.parse(fs.readFileSync(paths[0], 'utf8'));
  assert.equal(final.status, 'completed');
  for (const field of [
    'actionId', 'status', 'generatedAt', 'lastHeartbeatAt', 'childStatusPath',
    'phase', 'message', 'current', 'total',
  ]) assert.ok(Object.hasOwn(final, field), `missing progress field: ${field}`);
});

test('recipe crawler writes failed terminal progress and rethrows', async () => {
  const repoRoot = tempRoot();
  const paths = resolveRecipeCrawlerProgressPaths({ repoRoot, env: {} });
  await assert.rejects(() => runRecipeCrawlerWithProgress({
    progressPaths: paths,
    execute: async () => { throw new Error('network failed'); },
  }), /network failed/);
  const final = JSON.parse(fs.readFileSync(paths[0], 'utf8'));
  assert.equal(final.status, 'failed');
  assert.match(final.message, /network failed/);
});

test('the recipe crawler entrypoint delegates its real crawl through the progress lifecycle', () => {
  const source = fs.readFileSync(new URL('./fetch-wiki-zh-recipe-pages.mjs', import.meta.url), 'utf8');
  assert.match(source, /export async function runRecipePageCrawler/);
  assert.match(source, /runRecipeCrawlerWithProgress\s*\(/);
  assert.match(source, /publishProgress\s*\(/);
  assert.match(source, /isDirectExecution\s*\(/);
});
