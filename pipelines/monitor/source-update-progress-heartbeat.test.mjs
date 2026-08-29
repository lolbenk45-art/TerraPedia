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
