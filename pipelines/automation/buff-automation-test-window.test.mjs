import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_WINDOW_MINUTES,
  TEST_REDIS_DB,
  buildBuffAutomationTestIdentity,
  buildWindowArtifact,
  parseWindowArgs,
  assertFixtureAutomationPayload,
  assertNaturalFixtureTick,
  assertTerminalFixtureAttempt,
  assertTestWindowResources,
  runBuffAutomationTestWindow,
} from './buff-automation-test-window.mjs';

test('window arguments are bounded and default to the isolated T1 profile', () => {
  assert.deepEqual(parseWindowArgs([]), {
    profile: 't1',
    windowMinutes: DEFAULT_WINDOW_MINUTES,
  });
  assert.deepEqual(parseWindowArgs(['--fixture-profile=t1', '--window-minutes=7']), {
    profile: 't1',
    windowMinutes: 7,
  });
  for (const args of [
    ['--fixture-profile=t0'],
    ['--fixture-profile=t2-readonly'],
    ['--window-minutes=0'],
    ['--window-minutes=16'],
    ['--redis-db=14'],
    ['--unknown=value'],
  ]) {
    assert.throws(() => parseWindowArgs(args), /profile|window|Redis|unknown/i);
  }
});

test('identity rejects formal and reserved Redis targets', () => {
  const identity = buildBuffAutomationTestIdentity('buff-window-20261010');
  assert.match(identity.runKey, /^[a-z0-9]{1,3}_[a-f0-9]{16}$/);
  assert.match(identity.databases.local, /^terria_v1_automation_acceptance_/);
  assert.equal(identity.redis.logicalDb, TEST_REDIS_DB);
  assert.doesNotThrow(() => assertTestWindowResources(identity));
  for (const logicalDb of [14, 15, 16, 17, 18, 0]) {
    assert.throws(() => assertTestWindowResources({ ...identity, redis: { ...identity.redis, logicalDb } }), /Redis logical DB/i);
  }
  assert.throws(() => assertTestWindowResources({
    ...identity,
    databases: { ...identity.databases, local: 'terria_v1_local' },
  }), /formal|isolated/i);
});

test('fixture mode, natural tick, and terminal attempt are fail-closed contracts', () => {
  assert.doesNotThrow(() => assertFixtureAutomationPayload({
    enabled: true,
    mode: 'fixture-changed-only',
    sweepIntervalMinutes: 1,
    canaryActionId: 'crawler-queue-v2-fixture',
  }));
  assert.throws(() => assertFixtureAutomationPayload({ enabled: true, mode: 'changed-only' }), /fixture mode/i);
  const tick = assertNaturalFixtureTick({
    status: 'completed',
    detected: [{ actionId: 'crawler-queue-v2-fixture', changed: true }],
    dispatched: [{ actionId: 'crawler-queue-v2-fixture', attemptId: 'attempt-1', accepted: true }],
  });
  assert.equal(tick.attemptId, 'attempt-1');
  assert.deepEqual(assertTerminalFixtureAttempt({ attemptId: 'attempt-1', status: 'completed' }), {
    attemptId: 'attempt-1',
    status: 'completed',
  });
  assert.throws(() => assertNaturalFixtureTick({ detected: [], dispatched: [] }), /natural|fixture/i);
  assert.throws(() => assertTerminalFixtureAttempt({ attemptId: 'attempt-1', status: 'running' }), /terminal/i);
});

test('artifact records disable state and preserves failure reason', () => {
  const artifact = buildWindowArtifact({
    identity: buildBuffAutomationTestIdentity('buff-window-artifact'),
    status: 'failed',
    failure: 'fixture attempt failed',
    enabledAt: '2026-10-10T00:00:00Z',
    disabledAt: '2026-10-10T00:00:05Z',
    disableConfirmed: true,
  });
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.status, 'failed');
  assert.equal(artifact.failure, 'fixture attempt failed');
  assert.equal(artifact.disableConfirmed, true);
  assert.equal(artifact.manual_isolated_acceptance, true);
  assert.equal(artifact.production_source_delta, false);
  assert.equal(artifact.databaseWritesToFormalRuntime, false);
});

test('runner disables after success and after a failed natural tick', async () => {
  const calls = [];
  const makeDriver = (failed = false) => ({
    async prepare() { calls.push('prepare'); return { runId: 'driver-run' }; },
    async observeDisabledTick() { calls.push('observeDisabledTick'); return { dispatches: 0 }; },
    async enableAutomation() {
      calls.push('enableAutomation');
      return {
        enabled: true,
        mode: 'fixture-changed-only',
        sweepIntervalMinutes: 1,
        canaryActionId: 'crawler-queue-v2-fixture',
      };
    },
    async waitForScheduledTick() {
      calls.push('waitForScheduledTick');
      if (failed) throw new Error('natural tick timeout');
      return { detected: [{ actionId: 'crawler-queue-v2-fixture', changed: true }], dispatched: [{ actionId: 'crawler-queue-v2-fixture', attemptId: 'attempt-1', accepted: true }] };
    },
    async waitForProgress() { calls.push('waitForProgress'); return { attemptId: 'attempt-1', status: 'completed', buffAcceptance: { status: 'passed' } }; },
    async disableAutomation() { calls.push('disableAutomation'); return { enabled: false }; },
    async independentReadback() { calls.push('independentReadback'); return { liveAttempts: 0, liveClaims: 0, liveFences: 0 }; },
    async cleanup() { calls.push('cleanup'); },
  });
  const success = await runBuffAutomationTestWindow({
    runId: 'runner-success',
    driver: makeDriver(),
    writeArtifact: async () => {},
  });
  assert.equal(success.status, 'passed');
  assert.ok(calls.indexOf('disableAutomation') < calls.indexOf('cleanup'));
  calls.length = 0;
  const failure = await runBuffAutomationTestWindow({
    runId: 'runner-failure',
    driver: makeDriver(true),
    writeArtifact: async () => {},
  });
  assert.equal(failure.status, 'failed');
  assert.ok(calls.includes('disableAutomation'));
  assert.ok(calls.includes('cleanup'));
});
