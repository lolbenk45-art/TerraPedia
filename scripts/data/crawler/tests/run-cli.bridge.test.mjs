import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli.mjs';

test('runCli supports bridge npc mode and delegates to the bridge runner', async () => {
  const payload = await runCli([
    'bridge',
    '--domain=npc',
    '--source-standardized-dir=C:/tmp/source-standardized',
    '--crawler-output-root=C:/tmp/crawler-output',
    '--output-root=C:/tmp/generated-bridge'
  ], {
    runNpcStandardizedBridgeImpl: async (options) => ({
      received: options,
      summary: { matched: 2 }
    })
  });

  assert.deepEqual(payload.received, {
    domain: 'npc',
    sourceStandardizedDir: 'C:/tmp/source-standardized',
    crawlerOutputRoot: 'C:/tmp/crawler-output',
    outputRoot: 'C:/tmp/generated-bridge'
  });
  assert.equal(payload.summary.matched, 2);
});

test('runCli bridge rejects unsupported non-npc domains', async () => {
  await assert.rejects(
    () => runCli([
      'bridge',
      '--domain=item'
    ]),
    /Only bridge --domain=npc is supported/
  );
});
