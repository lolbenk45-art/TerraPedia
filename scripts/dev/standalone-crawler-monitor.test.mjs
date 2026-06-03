import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildStandaloneMonitorState,
  renderStandaloneMonitorHtml,
  routeStandaloneMonitorRequest
} from './standalone-crawler-monitor.mjs';

async function writeJson(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('standalone monitor builds read-only item page state from progress, request gate, raw files, and reports', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-standalone-monitor-'));
  const repoRoot = path.join(root, 'repo');
  const sharedDataRoot = path.join(root, 'shared');
  await writeJson(path.join(repoRoot, 'data/generated/wiki-sync-progress.latest.json'), {
    actionId: 'item-pages-batch-0020',
    status: 'completed',
    current: 50,
    total: 50,
    overallCurrent: 70,
    overallTotal: 6131,
    lastHeartbeatAt: '2026-06-03T03:52:32.480Z',
    message: 'finished item page fetch; ok=50; failed=0'
  });
  await writeJson(path.join(sharedDataRoot, 'generated/wiki-request-gate.latest.json'), {
    cooldownUntil: null,
    consecutiveThrottleFailures: 0,
    successCount: 1937,
    failureCount: 46
  });
  await fs.promises.mkdir(path.join(sharedDataRoot, 'raw/wiki/item-pages'), { recursive: true });
  await fs.promises.writeFile(path.join(sharedDataRoot, 'raw/wiki/item-pages/ironpickaxe.latest.json'), '{}');
  await writeJson(path.join(sharedDataRoot, 'reports/fetch/fetch-item-pages-2026.json'), {
    successCount: 50,
    failureCount: 0,
    withRecipes: false
  });

  const state = await buildStandaloneMonitorState({ repoRoot, sharedDataRoot, now: new Date('2026-06-03T04:00:00Z') });

  assert.equal(state.progress.payload.actionId, 'item-pages-batch-0020');
  assert.equal(state.itemPages.rawCount, 1);
  assert.equal(state.itemPages.latestReport.successCount, 50);
  assert.equal(state.requestGate.cooldownActive, false);
  assert.equal(state.files.some((file) => file.label === 'Item page progress' && file.found), true);
});

test('standalone monitor html mirrors admin crawler monitor visual anchors and has no crawler action controls', () => {
  const html = renderStandaloneMonitorHtml();

  assert.match(html, /page-wrap crawler-monitor/);
  assert.match(html, /workspace-shell workspace-shell--unified/);
  assert.match(html, /source-progress-panel/);
  assert.match(html, /operations-grid/);
  assert.match(html, /monitor-layout/);
  assert.doesNotMatch(html, /Start crawler|Stop crawler|Retry crawler|开始爬取|停止爬取|执行刷新/);
});

test('standalone monitor rejects non-read routes', async () => {
  const response = await routeStandaloneMonitorRequest({
    method: 'POST',
    url: '/api/state'
  }, {
    repoRoot: '/repo',
    sharedDataRoot: '/shared'
  });

  assert.equal(response.status, 405);
});

test('standalone monitor serves html and json routes', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tp-standalone-monitor-routes-'));
  const options = { repoRoot: path.join(root, 'repo'), sharedDataRoot: path.join(root, 'shared') };

  const html = await routeStandaloneMonitorRequest({ method: 'GET', url: '/' }, options);
  const json = await routeStandaloneMonitorRequest({ method: 'GET', url: '/api/state' }, options);
  const missing = await routeStandaloneMonitorRequest({ method: 'GET', url: '/missing' }, options);

  assert.equal(html.status, 200);
  assert.match(html.body, /<main class="page-wrap crawler-monitor">/);
  assert.equal(json.status, 200);
  assert.match(json.body, /"itemPages"/);
  assert.equal(missing.status, 404);
});
