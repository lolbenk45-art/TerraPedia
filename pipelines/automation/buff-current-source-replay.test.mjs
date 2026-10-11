import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertBuffCurrentSourceReplayIdentity,
  buildBuffCurrentSourceReplayIdentity,
  assertLoopbackHost,
  runBuffCurrentSourceReplay,
} from './buff-current-source-replay.mjs';

function createHarness(t, { mysqlHost = '127.0.0.1', redisHost = 'localhost' } = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buff-source-replay-test-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const configPath = path.join(repoRoot, 'local-stack.config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    database: { host: mysqlHost, port: 13306, username: 'local', password: 'local' },
    redis: { host: redisHost, port: 6380, password: 'local' },
  }));
  const runId = 'source-replay-test';
  const identity = buildBuffCurrentSourceReplayIdentity(runId);
  const artifactPath = path.join(repoRoot, '.local', 'tmp', `buff-current-source-replay-${identity.runKey}.json`);
  return { repoRoot, configPath, runId, identity, artifactPath };
}

test('current-source replay accepts only explicit loopback targets', () => {
  for (const host of ['localhost', '127.0.0.1', '127.10.2.3', '::1']) {
    assert.equal(assertLoopbackHost(host, 'target'), host);
  }
  for (const host of ['db.internal', '192.168.1.5', '::ffff:127.0.0.1']) {
    assert.throws(() => assertLoopbackHost(host, 'target'), /loopback/i);
  }
});

test('current-source replay writes a failed artifact when DB18 preflight fails', async (t) => {
  const harness = createHarness(t);
  let captureCalled = false;
  await assert.rejects(() => runBuffCurrentSourceReplay({
    ...harness,
    redisDbSizeImpl: () => { throw new Error('NOAUTH'); },
    captureImpl: async () => { captureCalled = true; },
  }), /NOAUTH/);
  assert.equal(captureCalled, false);
  const artifact = JSON.parse(fs.readFileSync(harness.artifactPath, 'utf8'));
  assert.equal(artifact.status, 'failed');
  assert.match(artifact.failure, /NOAUTH/);
  assert.equal(artifact.redis.logicalDb, 18);
});

test('current-source replay retains a failed artifact when source capture fails', async (t) => {
  const harness = createHarness(t);
  let redisChecks = 0;
  await assert.rejects(() => runBuffCurrentSourceReplay({
    ...harness,
    redisDbSizeImpl: () => { redisChecks += 1; return 0; },
    captureImpl: async () => { throw new Error('Wiki request failed'); },
  }), /Wiki request failed/);
  assert.equal(redisChecks, 2);
  const artifact = JSON.parse(fs.readFileSync(harness.artifactPath, 'utf8'));
  assert.equal(artifact.status, 'failed');
  assert.match(artifact.failure, /Wiki request failed/);
  assert.equal(artifact.redisPostflight.dbSize, 0);
});

test('current-source replay checks postflight DB18 and exact acceptance identity', async (t) => {
  const harness = createHarness(t);
  let redisChecks = 0;
  let privateDirectory;
  const result = await runBuffCurrentSourceReplay({
    ...harness,
    redisDbSizeImpl: () => { redisChecks += 1; return 0; },
    captureImpl: async () => ({ snapshotSha256: 'test-snapshot' }),
    validateSourceReplayImpl: () => true,
    acceptanceImpl: async (options) => {
      privateDirectory = options.privateDirectory;
      return {
        status: 'passed',
        cleanupPassed: true,
        runKey: harness.identity.runKey,
        databases: harness.identity.databases,
        redis: { logicalDb: 18 },
      };
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.cleanupPassed, true);
  assert.equal(redisChecks, 2);
  assert.equal(fs.statSync(harness.artifactPath).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(privateDirectory), false);

  assert.throws(() => assertBuffCurrentSourceReplayIdentity({
    expected: harness.identity,
    observed: { runKey: 'other_0000000000000000', databases: harness.identity.databases },
  }), /runKey/i);
  assert.throws(() => assertBuffCurrentSourceReplayIdentity({
    expected: harness.identity,
    observed: { runKey: harness.identity.runKey, databases: { ...harness.identity.databases, relation: 'terria_v1_local' } },
  }), /database identity/i);
});

test('current-source replay rejects a non-loopback config before probing Redis', async (t) => {
  const harness = createHarness(t, { redisHost: 'redis.internal' });
  let redisChecks = 0;
  await assert.rejects(() => runBuffCurrentSourceReplay({
    ...harness,
    redisDbSizeImpl: () => { redisChecks += 1; return 0; },
  }), /Redis target host.*loopback/i);
  assert.equal(redisChecks, 0);
  const artifact = JSON.parse(fs.readFileSync(harness.artifactPath, 'utf8'));
  assert.equal(artifact.status, 'failed');
});

test('current-source replay identity is isolated to Redis DB18', () => {
  const identity = buildBuffCurrentSourceReplayIdentity('source-replay-db18');
  assert.equal(identity.redis.logicalDb, 18);
});
