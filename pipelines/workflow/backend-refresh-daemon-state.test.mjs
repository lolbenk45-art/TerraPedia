import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDaemonHeartbeatPayload,
  buildDaemonStatePayload
} from './backend-refresh-daemon-state.mjs';

test('buildDaemonHeartbeatPayload includes daemon and active child state', () => {
  const payload = buildDaemonHeartbeatPayload({
    status: 'running',
    pid: 4321,
    activeChildPid: 9876,
    generatedAt: '2026-04-22T08:00:00.000Z',
    lastOutputPath: 'reports/backend-refresh/history/report.json',
    lastActionId: 'support-sync'
  });

  assert.deepEqual(payload, {
    activeChildPid: 9876,
    generatedAt: '2026-04-22T08:00:00.000Z',
    lastActionId: 'support-sync',
    lastOutputPath: 'reports/backend-refresh/history/report.json',
    pid: 4321,
    status: 'running'
  });
});

test('buildDaemonStatePayload includes next planned time when provided', () => {
  const payload = buildDaemonStatePayload({
    status: 'sleeping',
    generatedAt: '2026-04-22T08:00:00.000Z',
    lastCycleDurationMs: 1200,
    nextPlannedAt: '2026-04-22T08:15:00.000Z'
  });

  assert.deepEqual(payload, {
    generatedAt: '2026-04-22T08:00:00.000Z',
    lastCycleDurationMs: 1200,
    nextPlannedAt: '2026-04-22T08:15:00.000Z',
    status: 'sleeping'
  });
});
