import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBackendRefreshSummary,
  buildBackendRefreshSummaryPath
} from './backend-refresh-summary.mjs';

test('buildBackendRefreshSummaryPath derives summary file next to report', () => {
  const summaryPath = buildBackendRefreshSummaryPath(
    'G:\\ClaudeCode\\TerraPedia-dev\\reports\\backend-refresh\\history\\backend-data-refresh-2026.json'
  );

  assert.ok(summaryPath.endsWith('backend-data-refresh-2026.summary.json'));
});

test('buildBackendRefreshSummary summarizes report status counts and durations', () => {
  const summary = buildBackendRefreshSummary({
    outputPath: 'reports/backend-refresh/history/report.json',
    report: {
      generatedAt: '2026-04-22T09:00:00.000Z',
      totalActions: 3,
      completedActions: 2,
      failedActions: 1,
      runningActions: 0,
      pendingActions: 0,
      timedOutActions: 1,
      actions: [
        { id: 'wiki-core-refresh', status: 'completed', durationMs: 1000 },
        { id: 'support-sync', status: 'failed', durationMs: 2500, timedOut: true },
        { id: 'boss-sync', status: 'completed', durationMs: 500 }
      ]
    }
  });

  assert.deepEqual(summary, {
    completedActions: 2,
    failedActions: 1,
    generatedAt: '2026-04-22T09:00:00.000Z',
    lastActionId: 'support-sync',
    outputPath: 'reports/backend-refresh/history/report.json',
    pendingActions: 0,
    runningActions: 0,
    timedOutActions: 1,
    totalActions: 3,
    totalDurationMs: 4000
  });
});
