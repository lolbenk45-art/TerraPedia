import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExactAttemptIdentity,
  assertMarkerOwnedPath,
  buildOfflineLifecycleReport,
  buildSchedulerLifecycleIdentity,
  runFixtureProgressProbe,
} from './crawler-queue-v2-scheduler-lifecycle.mjs';

test('scheduler lifecycle identity is isolated and exact', () => {
  const identity = buildSchedulerLifecycleIdentity({ runId: 'run-1', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-1:', redisDb: 14, epoch: 'epoch-1', fenceToken: 'fence-1' });
  assertExactAttemptIdentity(identity, { ...identity });
  assert.throws(() => assertExactAttemptIdentity(identity, { ...identity, fenceToken: 'other' }), /identity drift/);
  assert.throws(() => buildSchedulerLifecycleIdentity({ ...identity, namespace: 'terrapedia:crawler:wiki-monitor:v2:production:' }), /test namespace/);
});

test('scheduler lifecycle path guard rejects paths outside marker root', () => {
  assertMarkerOwnedPath('/tmp/marker/child.json', '/tmp/marker');
  assert.throws(() => assertMarkerOwnedPath('/tmp/other.json', '/tmp/marker'), /outside marker-owned/);
});

test('fixture probe publishes terminal progress and report records lifecycle boundaries', async () => {
  const progress = await runFixtureProgressProbe({ heartbeats: 3 });
  const identity = buildSchedulerLifecycleIdentity({ runId: 'run-2', namespace: 'terrapedia:crawler:wiki-monitor:v2:test:run-2:', redisDb: 13, epoch: 'epoch-2', fenceToken: 'fence-2' });
  const report = buildOfflineLifecycleReport({ identity, progress });
  assert.equal(report.status, 'probe-passed');
  assert.equal(report.leaseRenewals, 2);
  assert.equal(report.restart.mismatchRejected, true);
  assert.equal(report.cleanup.redisKeys, 0);
});
