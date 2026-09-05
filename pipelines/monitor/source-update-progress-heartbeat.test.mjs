import assert from 'node:assert/strict';
import test from 'node:test';

import { createSourceUpdateProgressHeartbeat } from './source-update-progress-heartbeat.mjs';

test('source update heartbeat republishes the current long-running probe progress', async () => {
  const writes = [];
  const heartbeat = createSourceUpdateProgressHeartbeat({
    heartbeatMs: 5,
    writeProgress: (progress) => writes.push(progress),
  });

  heartbeat.publish({
    status: 'running',
    phase: 'wiki',
    message: 'checking wiki.shimmer.page_and_langlinks',
    current: 9,
    total: 11,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  heartbeat.stop();

  assert.ok(writes.length >= 2);
  assert.equal(writes[0].status, 'running');
  assert.equal(writes.at(-1).phase, 'wiki');
  assert.equal(writes.at(-1).current, 9);
  assert.equal(writes.at(-1).total, 11);
  assert.ok(Date.parse(writes.at(-1).lastHeartbeatAt) >= Date.parse(writes[0].lastHeartbeatAt));
});

test('source update heartbeat captures asynchronous writer failures and stops retrying', async () => {
  const writes = [];
  const errors = [];
  let writeCount = 0;
  const heartbeat = createSourceUpdateProgressHeartbeat({
    heartbeatMs: 5,
    writeProgress: (progress) => {
      writeCount += 1;
      if (writeCount > 1) {
        throw new Error('simulated heartbeat writer failure');
      }
      writes.push(progress);
    },
    onError: (error) => errors.push(error),
  });

  heartbeat.publish({
    status: 'running',
    phase: 'wiki',
    message: 'checking source',
    current: 1,
    total: 2,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  heartbeat.stop();

  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /heartbeat writer failure/i);
  assert.throws(() => heartbeat.assertHealthy(), /heartbeat writer failure/i);
  assert.equal(writes.length, 1);
});
