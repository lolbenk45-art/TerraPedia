import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli.mjs';

test('runCli supports batch npc mode and delegates to the batch runner', async () => {
  const payload = await runCli([
    'batch',
    '--domain=npc',
    '--page-titles=Goblin Tinkerer|Medusa',
    '--api-url=https://terraria.wiki.gg/zh/api.php',
    '--write-files'
  ], {
    runNpcBatchImpl: async (options) => ({
      received: options,
      executions: [],
      summary: {
        total: 2,
        pass: 2,
        warn: 0,
        fail: 0,
        sampleIssues: []
      }
    })
  });

  assert.deepEqual(payload.received, {
    domain: 'npc',
    apiUrl: 'https://terraria.wiki.gg/zh/api.php',
    pageIds: [],
    pageTitles: ['Goblin Tinkerer', 'Medusa'],
    writeFiles: true
  });
  assert.equal(payload.summary.total, 2);
});

test('runCli passes batch targets file options through to the batch runner', async () => {
  const payload = await runCli([
    'batch',
    '--domain=npc',
    '--targets-file=C:/tmp/npc-targets.json',
    '--target-priority=p0_town',
    '--limit=10'
  ], {
    runNpcBatchImpl: async (options) => ({
      received: options,
      executions: [],
      summary: {
        total: 10,
        pass: 10,
        warn: 0,
        fail: 0,
        sampleIssues: []
      }
    })
  });

  assert.deepEqual(payload.received, {
    domain: 'npc',
    pageIds: [],
    pageTitles: [],
    targetsFile: 'C:/tmp/npc-targets.json',
    targetPriority: 'p0_town',
    limit: 10,
    writeFiles: false
  });
});
